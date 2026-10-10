// Local tests for: order saved -> order email -> redirect to the Stripe Payment Link.
// No real network: fetch is stubbed for Netlify Blobs (in-memory) and the Resend API; SMTP goes to a fake
// local SMTP server on 127.0.0.1. Keys/passwords below are throwaway test strings.
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ token: "t", siteID: "site", edgeURL: "http://blobs.local" })).toString("base64");
for (const k of ["OPERATOR_KEY", "RESEND_API_KEY", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT", "EMAIL_FROM", "ORDER_EMAIL_TO"]) delete process.env[k];

const store = new Map();
const resendCalls = [];
let resendMode = "ok"; // ok | fail | hang
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.host === "blobs.local") {
    const key = decodeURIComponent(url.pathname.split("/site:pathway-formation/")[1]);
    if ((init.method || "GET") === "PUT") { store.set(key, init.body); return new Response("", { status: 200 }); }
    return store.has(key) ? new Response(store.get(key), { status: 200 }) : new Response("", { status: 404 });
  }
  if (url.href === "https://api.resend.com/emails" && init.method === "POST") {
    resendCalls.push({ headers: init.headers, body: JSON.parse(init.body) });
    if (resendMode === "fail") return new Response('{"message":"stub failure"}', { status: 500 });
    if (resendMode === "hang") return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    return new Response('{"id":"stub"}', { status: 200 });
  }
  throw new Error(`unexpected network call in test: ${url}`);
};

const { handler: desk } = await import("../netlify/functions/desk.mjs");

const ORIGIN = "https://pathwaydevs.software";
const CLIENT = "client-aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "client-bbbbbbbbbbbbbbbbbbbbbbbb";
const LINK = "https://buy.stripe.com/3cIfZhd9cbg1eho5Mj1kA0l";
const call = async (body, headers = {}) => {
  const r = await desk({ httpMethod: "POST", headers: { origin: ORIGIN, host: "pathwaydevs.software", ...headers }, body: JSON.stringify(body) });
  return { status: r.statusCode, data: JSON.parse(r.body), headers: r.headers };
};
const orders = () => JSON.parse(store.get("orders") || "[]");
const evidence = [];
const log = (step, v) => evidence.push({ step, ...v });

const draft = {
  stateCode: "MI", llcName: "North Lotz Holdings LLC", management: "member", purpose: "Consulting services",
  principal: { street: "1 Main St", city: "Detroit", state: "MI", zip: "48201" }, mailingSame: false,
  mailing: { street: "PO Box 9", city: "Warren", state: "MI", zip: "48089" },
  ra: { name: "Rita Agent", street: "22 Agent Way", city: "Lansing", state: "MI", zip: "48933" },
  members: [{ name: "Alice Owner", title: "Member", ownership: 60, street: "5 Elm", city: "Detroit", state: "MI", zip: "48201" }, { name: "Bob Owner", title: "Member", ownership: 40, street: "6 Oak", city: "Detroit", state: "MI", zip: "48201" }],
  organizer: "Alice Owner", ein: true, expedited: true, oaPages: 5, reminders: true, command: false, website: false,
};
const orderBody = (over = {}, d = draft) => ({ action: "place", clientId: CLIENT, items: [{ kind: "filing" }], order: { llcName: d.llcName, contactName: "Alice Owner", email: "alice+test@example.com", stateCode: d.stateCode, stateName: "Michigan", organizer: d.organizer, due: 1, status: "paid", draft: d, ...over } });
// 5000 fee + 5000 MI expedite + 10000 expedite svc + 9900 EIN + 400 OA + 9900 reminders = 40200
let orderId;

test("place: saved, quoted total computed server-side, status awaiting payment, browser amount/status ignored", async () => {
  process.env.RESEND_API_KEY = "re_local_test_only";
  const r = await call(orderBody());
  assert.equal(r.status, 200);
  orderId = r.data.orderId;
  const o = orders().find((x) => x.id === orderId);
  assert.equal(o.status, "awaiting_payment");
  assert.equal(o.due, 40200);
  assert.equal(o.paidAmount, null);
  assert.equal(o.contactName, "Alice Owner");
  assert.equal(r.data.emailStatus, "sent");
  log("place", { status: r.status, orderStatus: o.status, browserSentDue: 1, browserSentStatus: "paid", quotedTotalCents: o.due, emailStatus: r.data.emailStatus });
});

test("redirect URL: Stripe payment link + client_reference_id + prefilled_email", async () => {
  const r = await call(orderBody());
  const u = new URL(r.data.payUrl);
  assert.equal(u.origin + u.pathname, LINK);
  assert.equal(u.searchParams.get("client_reference_id"), r.data.orderId);
  assert.equal(u.searchParams.get("prefilled_email"), "alice+test@example.com");
  assert.match(r.data.payUrl, /prefilled_email=alice%2Btest%40example\.com/);
  log("pay-url", { payUrl: r.data.payUrl });
});

test("order email (Resend): to/from defaults, every detail present, unchecked add-ons omitted", async () => {
  const c = resendCalls[0];
  assert.deepEqual(c.body.to, ["John_Gault_jr@outlook.com"]);
  assert.equal(c.body.from, "Formation Desk <onboarding@resend.dev>");
  assert.match(c.headers.authorization, /^Bearer /);
  const { text, html, subject } = c.body;
  for (const needle of [
    orderId, "Alice Owner", "alice+test@example.com", "North Lotz Holdings LLC", "Michigan", "awaiting payment", "$402.00",
    "Rita Agent", "22 Agent Way, Lansing, MI 48933", "1 Main St, Detroit, MI 48201", "PO Box 9, Warren, MI 48089",
    "Bob Owner", "Alice Owner | Member | 60%", "EIN assistance", "Expedite handling", "Compliance reminders",
    "Operating agreement pages: 5", "State filing fee: $50.00", "Michigan state filing fee", "Stripe payment link", LINK,
  ]) {
    assert.ok(text.includes(needle), `text missing: ${needle}`);
    const value = needle.includes(": ") ? needle.split(": ")[1] : needle; // html puts label and value in separate cells
    assert.ok(html.includes(value), `html missing: ${value}`);
  }
  assert.match(text, /Placed \(ET\): .*E[SD]T/);
  assert.ok(!/Command desk|Website \/ domain/.test(text), "unchecked add-ons must be omitted");
  assert.match(subject, new RegExp(orderId));
  assert.equal(c.body.reply_to, "alice+test@example.com");
  log("email-resend", { to: c.body.to, from: c.body.from, subject, textBody: text });
});

test("ORDER_EMAIL_TO and EMAIL_FROM override the defaults", async () => {
  process.env.ORDER_EMAIL_TO = "desk@example.org";
  process.env.EMAIL_FROM = "Orders <orders@example.org>";
  const n = resendCalls.length;
  await call(orderBody());
  assert.deepEqual(resendCalls[n].body.to, ["desk@example.org"]);
  assert.equal(resendCalls[n].body.from, "Orders <orders@example.org>");
  delete process.env.ORDER_EMAIL_TO; delete process.env.EMAIL_FROM;
  log("email-env-overrides", { to: resendCalls[n].body.to, from: resendCalls[n].body.from });
});

test("email provider failure (500) does not block the order or the redirect", async () => {
  resendMode = "fail";
  const r = await call(orderBody({ llcName: "Failing Mail LLC" }));
  resendMode = "ok";
  assert.equal(r.status, 200);
  assert.ok(r.data.payUrl.startsWith(LINK));
  const o = orders().find((x) => x.id === r.data.orderId);
  assert.ok(o);
  assert.equal(o.emailStatus.status, "failed");
  assert.match(o.emailError, /resend 500 .*stub failure/);
  assert.match(r.data.emailError, /resend 500/);
  assert.equal(r.data.emailRecorded, true);
  assert.ok(!JSON.stringify(r.data).includes("re_local_test_only"));
  assert.equal(o.status, "awaiting_payment");
  log("email-failure", { httpStatus: r.status, emailStatus: r.data.emailStatus, orderSaved: true, payUrlPresent: true });
});

test("email provider hang: place returns within ~8s, order saved, redirect URL returned", async () => {
  resendMode = "hang";
  const t0 = Date.now();
  const r = await call(orderBody({ llcName: "Hanging Mail LLC" }));
  const ms = Date.now() - t0;
  resendMode = "ok";
  assert.equal(r.status, 200);
  assert.ok(ms >= 7000 && ms < 9800, `took ${ms}ms`);
  assert.equal(r.data.emailStatus, "failed");
  assert.ok(r.data.payUrl.startsWith(LINK));
  assert.ok(orders().find((x) => x.id === r.data.orderId));
  log("email-timeout", { elapsedMs: ms, emailStatus: r.data.emailStatus, orderSaved: true });
});

test("no email provider configured: order saved, clear log, redirect still returned", async () => {
  delete process.env.RESEND_API_KEY;
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(" "));
  const r = await call(orderBody({ llcName: "Unconfigured Mail LLC" }));
  console.error = orig;
  assert.equal(r.status, 200);
  assert.equal(r.data.emailStatus, "not_configured");
  assert.ok(r.data.payUrl.startsWith(LINK));
  assert.ok(orders().find((x) => x.id === r.data.orderId));
  assert.ok(errs.some((e) => /email not configured/.test(e)));
  log("email-not-configured", { emailStatus: r.data.emailStatus, logged: errs.find((e) => /not configured/.test(e)), orderSaved: true });
});

// ---- fake SMTP server ----
function decodeQP(s) {
  return s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function fakeSmtp() {
  const got = { auth: null, from: "", rcpt: [], data: "" };
  const server = net.createServer((sock) => {
    let buf = "", inData = false, authStep = 0;
    const send = (l) => sock.write(l + "\r\n");
    send("220 fake.local ESMTP");
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      for (;;) {
        if (inData) {
          const i = buf.indexOf("\r\n.\r\n");
          if (i < 0) return;
          got.data = buf.slice(0, i); buf = buf.slice(i + 5); inData = false; send("250 queued"); continue;
        }
        const i = buf.indexOf("\r\n");
        if (i < 0) return;
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (authStep === 1) { got.pass = Buffer.from(line, "base64").toString(); authStep = 2; send("334 UGFzc3dvcmQ6"); continue; }
        if (authStep === 2) { authStep = 0; send("235 ok"); continue; }
        if (/^EHLO/i.test(line)) { sock.write("250-fake.local\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n"); }
        else if (/^AUTH PLAIN/i.test(line)) { got.auth = Buffer.from(line.split(" ")[2] || "", "base64").toString().split("\0").slice(1)[0]; send("235 ok"); }
        else if (/^AUTH LOGIN/i.test(line)) { authStep = 1; got.auth = "login"; send("334 VXNlcm5hbWU6"); }
        else if (/^MAIL FROM/i.test(line)) { got.from = line; send("250 ok"); }
        else if (/^RCPT TO/i.test(line)) { got.rcpt.push(line); send("250 ok"); }
        else if (/^DATA/i.test(line)) { inData = true; send("354 go"); }
        else if (/^QUIT/i.test(line)) { send("221 bye"); sock.end(); }
        else send("250 ok");
      }
    });
  });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res({ server, got, port: server.address().port })));
}

test("order email (SMTP via nodemailer): delivered to the fake server with all details", async () => {
  const smtp = await fakeSmtp();
  process.env.SMTP_HOST = "127.0.0.1"; process.env.SMTP_PORT = String(smtp.port);
  process.env.SMTP_USER = "smtp-user@example.org"; process.env.SMTP_PASS = "smtp-pass-test-only";
  const n = resendCalls.length;
  const r = await call(orderBody({ llcName: "Smtp Path LLC" }));
  smtp.server.close();
  delete process.env.SMTP_HOST; delete process.env.SMTP_PORT; delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
  assert.equal(r.status, 200);
  assert.equal(r.data.emailStatus, "sent");
  assert.equal(resendCalls.length, n, "SMTP path must not call Resend");
  assert.ok(smtp.got.rcpt.some((l) => l.includes("John_Gault_jr@outlook.com")));
  assert.ok(smtp.got.from.includes("smtp-user@example.org"));
  const msg = decodeQP(smtp.got.data);
  for (const needle of [r.data.orderId, "Smtp Path LLC", "Alice Owner", "alice+test@example.com", "Rita Agent", "awaiting payment", "$402.00", LINK]) assert.ok(msg.includes(needle), `smtp message missing ${needle}`);
  log("email-smtp", { rcpt: smtp.got.rcpt, mailFrom: smtp.got.from, authUserSeen: !!smtp.got.auth, messageHasAllKeyFields: true });
});

test("validation: name and email are required on the order", async () => {
  const noName = await call(orderBody({ contactName: "" }));
  const noEmail = await call(orderBody({ email: "" }));
  const badEmail = await call(orderBody({ email: "not-an-email" }));
  for (const r of [noName, noEmail, badEmail]) assert.equal(r.status, 400);
  log("validation", { noName: noName.data.error, noEmail: noEmail.data.error, badEmail: badEmail.data.error });
});

test("begin_payment (customer desk Pay): ownership enforced, no duplicate email once sent, resends if the first failed", async () => {
  process.env.RESEND_API_KEY = "re_local_test_only";
  const other = await call({ action: "begin_payment", clientId: OTHER, orderId });
  assert.equal(other.status, 404);
  const n = resendCalls.length;
  const mine = await call({ action: "begin_payment", clientId: CLIENT, orderId });
  assert.equal(mine.status, 200);
  assert.equal(new URL(mine.data.payUrl).searchParams.get("client_reference_id"), orderId);
  assert.equal(resendCalls.length, n, "already emailed: no duplicate");
  // an order whose email failed gets it on Pay
  resendMode = "fail";
  const f = await call(orderBody({ llcName: "Retry Mail LLC" }));
  resendMode = "ok";
  assert.equal(f.data.emailStatus, "failed");
  const m = resendCalls.length;
  const again = await call({ action: "begin_payment", clientId: CLIENT, orderId: f.data.orderId });
  assert.equal(again.status, 200);
  assert.equal(again.data.emailStatus, "sent");
  assert.equal(resendCalls.length, m + 1);
  log("begin-payment", { otherClient: other.status, ownOrder: mine.status, duplicateEmail: false, retryAfterFailure: again.data.emailStatus });
});

test("admin fails closed without OPERATOR_KEY; role/status from the browser is ignored", async () => {
  delete process.env.OPERATOR_KEY;
  const res = [];
  for (const a of ["admin_bootstrap", "pay", "paid_amount", "status"]) {
    const r = await call({ action: a, clientId: CLIENT, orderId, queueId: orderId, status: "paid", role: "admin", paidAmount: 5, key: "" });
    assert.equal(r.status, 503, a);
    res.push([a, r.status]);
  }
  assert.equal(orders().find((x) => x.id === orderId).status, "awaiting_payment");
  assert.equal(orders().find((x) => x.id === orderId).paidAmount, null);
  log("admin-fail-closed", { noOperatorKey: res });
});

test("with OPERATOR_KEY: wrong key refused; browser can't mark paid; operator sets paid amount, then marks paid", async () => {
  process.env.OPERATOR_KEY = "op-local-test";
  const bad = await call({ action: "pay", clientId: CLIENT, orderId, key: "guess", paidAmount: 402 });
  const none = await call({ action: "paid_amount", clientId: CLIENT, orderId, paidAmount: 402, role: "admin" });
  assert.equal(bad.status, 403);
  assert.equal(none.status, 403);
  assert.equal(orders().find((x) => x.id === orderId).status, "awaiting_payment");
  const cust = await call({ action: "bootstrap", clientId: CLIENT, role: "admin", key: "op-local-test" });
  assert.equal(cust.data.operator, false);
  const amt = await call({ action: "paid_amount", clientId: CLIENT, orderId, paidAmount: "250.50", key: "op-local-test" });
  assert.equal(amt.status, 200);
  let o = orders().find((x) => x.id === orderId);
  assert.equal(o.paidAmount, 25050);
  assert.equal(o.status, "awaiting_payment");
  assert.equal(o.due, 40200);
  const badAmt = await call({ action: "paid_amount", clientId: CLIENT, orderId, paidAmount: -3, key: "op-local-test" });
  assert.equal(badAmt.status, 400);
  const paid = await call({ action: "pay", clientId: CLIENT, orderId, key: "op-local-test" });
  assert.equal(paid.status, 200);
  o = orders().find((x) => x.id === orderId);
  assert.equal(o.status, "paid");
  assert.ok(o.paidAt);
  assert.equal(o.paidAmount, 25050);
  const cdesk = await call({ action: "bootstrap", clientId: CLIENT });
  assert.equal(cdesk.data.orders.find((x) => x.id === orderId).paidAmount, 25050);
  const again = await call({ action: "begin_payment", clientId: CLIENT, orderId });
  assert.equal(again.status, 409);
  log("operator-paid", { wrongKey: bad.status, noKeyWithAdminRole: none.status, browserOperatorFlag: cust.data.operator, paidAmountCents: 25050, statusAfterAmountOnly: "awaiting_payment", negativeAmount: badAmt.status, afterMarkPaid: o.status, payAgain: again.status });
});

test("customers only see their own orders; CORS allows only the site origins", async () => {
  const b = await call({ action: "bootstrap", clientId: OTHER });
  assert.equal(b.data.orders.length, 0);
  const evil = await call({ action: "bootstrap", clientId: CLIENT }, { origin: "https://evil.example", host: "pathwaydevs.software" });
  assert.equal(evil.status, 403);
  const ok = await call({ action: "bootstrap", clientId: CLIENT });
  assert.equal(ok.headers["access-control-allow-origin"], ORIGIN);
  log("scope-and-cors", { otherClientOrders: 0, evilOrigin: evil.status, allowedOrigin: ok.headers["access-control-allow-origin"] });
});

test("old Stripe Checkout action is gone", async () => {
  const r = await call({ action: "create_checkout", clientId: CLIENT, orderId });
  assert.equal(r.status, 400);
});

test.after(async () => {
  const dir = process.env.EVIDENCE_DIR;
  if (dir) {
    const fs = await import("node:fs");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/payment-link-evidence.json`, JSON.stringify(evidence, null, 2));
  }
});
