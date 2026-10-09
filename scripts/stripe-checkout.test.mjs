// Local end-to-end test of Pay -> Stripe Checkout -> signed webhook -> paid.
// No network: globalThis.fetch is stubbed for Netlify Blobs (in-memory) and the Stripe API.
// Any other host throws. The webhook secret / API key here are throwaway test values.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const TEST_WHSEC = "whsec_local_test_only";
process.env.STRIPE_SECRET_KEY = "sk_test_local_stub_only";
process.env.STRIPE_WEBHOOK_SECRET = TEST_WHSEC;
process.env.OPERATOR_KEY = "op-local-test";
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ token: "t", siteID: "site", edgeURL: "http://blobs.local" })).toString("base64");

const store = new Map();
const stripeCalls = [];
let sessionN = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.host === "blobs.local") {
    const key = decodeURIComponent(url.pathname.split("/site:pathway-formation/")[1]);
    if ((init.method || "GET") === "PUT") { store.set(key, init.body); return new Response("", { status: 200 }); }
    return store.has(key) ? new Response(store.get(key), { status: 200 }) : new Response("", { status: 404 });
  }
  if (url.host === "api.stripe.com" && url.pathname === "/v1/checkout/sessions" && init.method === "POST") {
    const form = new URLSearchParams(String(init.body));
    stripeCalls.push({ form, headers: init.headers });
    let total = 0;
    for (const [k, v] of form) if (/^line_items\[\d+\]\[price_data\]\[unit_amount\]$/.test(k)) total += Number(v);
    const id = `cs_test_stub_${++sessionN}`;
    return new Response(JSON.stringify({ id, object: "checkout.session", url: `https://checkout.stripe.com/c/pay/${id}`, amount_total: total, currency: "usd", expires_at: 0 }), { status: 200 });
  }
  throw new Error(`unexpected network call in test: ${url}`);
};

const { handler: desk } = await import("../netlify/functions/desk.mjs");
const { handler: webhook } = await import("../netlify/functions/stripe-webhook.mjs");

const ORIGIN = "https://pathwaydevs.software";
const CLIENT = "client-aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "client-bbbbbbbbbbbbbbbbbbbbbbbb";
const call = async (body) => {
  const r = await desk({ httpMethod: "POST", headers: { origin: ORIGIN, host: "pathwaydevs.software" }, body: JSON.stringify(body) });
  return { status: r.statusCode, data: JSON.parse(r.body) };
};
const sign = (payload, secret = TEST_WHSEC, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
const hook = (payload, sig) => webhook({ httpMethod: "POST", headers: sig ? { "stripe-signature": sig } : {}, body: payload });
const orders = () => JSON.parse(store.get("orders") || "[]");
const evidence = [];
const log = (k, v) => { evidence.push({ step: k, ...v }); };

// Michigan, 2 members, EIN, expedite, 5 OA pages, reminders. Expected server total:
// 5000 fee + 5000 MI expedite + 10000 expedite svc + 9900 EIN + 400 OA + 9900 reminders = 40200
const draft = { stateCode: "MI", members: [{ name: "A" }, { name: "B" }], ein: true, expedited: true, oaPages: 5, reminders: true, command: false, website: false };
let orderId;

test("place: server prices the order and ignores browser amount/status", async () => {
  const r = await call({ action: "place", clientId: CLIENT, order: { llcName: "North Lotz Holdings LLC", email: "test@example.com", stateCode: "MI", stateName: "Michigan", due: 1, status: "paid", draft }, items: [{ kind: "filing" }] });
  assert.equal(r.status, 200);
  orderId = r.data.orderId;
  const o = orders().find((x) => x.id === orderId);
  assert.equal(o.status, "due");
  assert.equal(o.due, 40200);
  log("place", { status: r.status, orderStatus: o.status, browserSentDue: 1, browserSentStatus: "paid", serverDue: o.due, lines: o.quote.items });
});

test("browser cannot set paid via desk actions", async () => {
  const noKey = await call({ action: "pay", clientId: CLIENT, orderId });
  const badKey = await call({ action: "pay", clientId: CLIENT, orderId, key: "guess" });
  const oldAction = await call({ action: "request_payment", clientId: CLIENT, orderId });
  assert.equal(noKey.status, 403);
  assert.equal(badKey.status, 403);
  assert.equal(oldAction.status, 400);
  assert.equal(orders().find((x) => x.id === orderId).status, "due");
  log("browser-cannot-pay", { payNoKey: noKey.status, payBadKey: badKey.status, removedRequestPayment: oldAction.status, orderStatus: "due" });
});

test("create_checkout: other client's order refused; own order gets server-computed Stripe session", async () => {
  const other = await call({ action: "create_checkout", clientId: OTHER, orderId });
  assert.equal(other.status, 404);
  const r = await call({ action: "create_checkout", clientId: CLIENT, orderId, amount: 50, due: 50 });
  assert.equal(r.status, 200);
  assert.match(r.data.url, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(r.data.amount, 40200);
  const f = stripeCalls.at(-1).form;
  assert.equal(f.get("mode"), "payment");
  assert.equal(f.get("metadata[orderId]"), orderId);
  assert.equal(f.get("client_reference_id"), orderId);
  assert.equal(f.get("success_url"), `${ORIGIN}/?paid=${orderId}#/app`);
  const o = orders().find((x) => x.id === orderId);
  assert.equal(o.status, "awaiting_payment");
  assert.equal(o.checkout.amountTotal, 40200);
  const lines = [...f].filter(([k]) => k.startsWith("line_items")).map(([k, v]) => `${k}=${v}`);
  log("create_checkout", { otherClient: other.status, status: r.status, url: r.data.url, amount: r.data.amount, browserSentAmount: 50, stripeForm: { mode: f.get("mode"), client_reference_id: f.get("client_reference_id"), "metadata[orderId]": f.get("metadata[orderId]"), success_url: f.get("success_url"), cancel_url: f.get("cancel_url"), customer_email: f.get("customer_email"), line_items: lines }, authHeaderSent: /^Bearer /.test(stripeCalls.at(-1).headers.authorization), idempotencyKey: !!stripeCalls.at(-1).headers["idempotency-key"] });
});

const event = (overrides = {}) => JSON.stringify({ id: "evt_local_1", type: "checkout.session.completed", data: { object: { id: "cs_test_stub_1", object: "checkout.session", payment_status: "paid", amount_total: 40200, currency: "usd", client_reference_id: orderId, metadata: { orderId, app: "pathway-formation" }, ...overrides } } });

test("webhook: unsigned, wrong-secret, tampered and stale signatures are rejected", async () => {
  const p = event();
  const none = await hook(p, "");
  const wrong = await hook(p, sign(p, "whsec_attacker"));
  const tampered = await hook(event({ amount_total: 1 }), sign(p));
  const stale = await hook(p, sign(p, TEST_WHSEC, Math.floor(Date.now() / 1000) - 3600));
  for (const r of [none, wrong, tampered, stale]) assert.equal(r.statusCode, 400);
  assert.equal(orders().find((x) => x.id === orderId).status, "awaiting_payment");
  log("webhook-bad-signatures", { missing: [none.statusCode, JSON.parse(none.body).error], wrongSecret: [wrong.statusCode, JSON.parse(wrong.body).error], tamperedBody: [tampered.statusCode, JSON.parse(tampered.body).error], stale: [stale.statusCode, JSON.parse(stale.body).error], orderStatus: "awaiting_payment" });
});

test("webhook: signed checkout.session.completed marks paid; replay is idempotent", async () => {
  const p = event();
  const first = await hook(p, sign(p));
  assert.equal(first.statusCode, 200);
  const o1 = orders().find((x) => x.id === orderId);
  assert.equal(o1.status, "paid");
  const paidAt = o1.paidAt;
  const replay = await hook(p, sign(p));
  assert.equal(replay.statusCode, 200);
  assert.equal(JSON.parse(replay.body).already, true);
  const o2 = orders().find((x) => x.id === orderId);
  assert.equal(o2.paidAt, paidAt);
  const b64 = await webhook({ httpMethod: "POST", headers: { "Stripe-Signature": sign(p) }, body: Buffer.from(p).toString("base64"), isBase64Encoded: true });
  assert.equal(b64.statusCode, 200);
  const desk2 = await call({ action: "bootstrap", clientId: CLIENT });
  assert.equal(desk2.data.orders.find((x) => x.id === orderId).status, "paid");
  const again = await call({ action: "create_checkout", clientId: CLIENT, orderId });
  assert.equal(again.status, 409);
  log("webhook-paid-and-replay", { first: [first.statusCode, JSON.parse(first.body)], replay: [replay.statusCode, JSON.parse(replay.body)], base64Body: b64.statusCode, paidAtUnchanged: o2.paidAt === paidAt, customerDeskSees: "paid", payAgain: again.status, paidMarker: JSON.parse(store.get(`paid-${orderId}`)) });
});

test("webhook: paid marker survives a racing desk write", async () => {
  const list = orders();
  list.find((x) => x.id === orderId).status = "awaiting_payment"; // simulate a stale desk write
  store.set("orders", JSON.stringify(list));
  const r = await call({ action: "bootstrap", clientId: CLIENT });
  assert.equal(r.data.orders.find((x) => x.id === orderId).status, "paid");
  log("race-overlay", { afterStaleOverwrite: r.data.orders.find((x) => x.id === orderId).status });
});

test("webhook: amount mismatch is flagged, not paid", async () => {
  const r0 = await call({ action: "place", clientId: CLIENT, order: { llcName: "Second Test LLC", email: "test@example.com", stateCode: "WY", draft: { stateCode: "WY", members: [{}] } } });
  const id2 = r0.data.orderId;
  await call({ action: "create_checkout", clientId: CLIENT, orderId: id2 });
  const p = JSON.stringify({ id: "evt_local_2", type: "checkout.session.completed", data: { object: { id: "cs_x", payment_status: "paid", amount_total: 100, currency: "usd", metadata: { orderId: id2, app: "pathway-formation" } } } });
  const r = await hook(p, sign(p));
  const o = orders().find((x) => x.id === id2);
  assert.equal(r.statusCode, 200);
  assert.notEqual(o.status, "paid");
  assert.ok(o.paymentIssue);
  log("amount-mismatch", { webhook: [r.statusCode, JSON.parse(r.body)], orderStatus: o.status, serverDue: o.due });
});

test("fail closed: no Stripe secrets => no checkout, webhook refuses", async () => {
  const k = process.env.STRIPE_SECRET_KEY, w = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
  const r1 = await call({ action: "place", clientId: CLIENT, order: { llcName: "Third Test LLC", email: "test@example.com", stateCode: "TX", draft: { stateCode: "TX", members: [{}] } } });
  const n = stripeCalls.length;
  const c = await call({ action: "create_checkout", clientId: CLIENT, orderId: r1.data.orderId });
  assert.equal(c.status, 503);
  assert.equal(stripeCalls.length, n);
  process.env.STRIPE_SECRET_KEY = k;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const c2 = await call({ action: "create_checkout", clientId: CLIENT, orderId: r1.data.orderId });
  const p = event();
  const h = await hook(p, sign(p));
  assert.equal(c2.status, 503);
  assert.equal(h.statusCode, 503);
  process.env.STRIPE_WEBHOOK_SECRET = w;
  log("fail-closed", { checkoutNoSecretKey: [c.status, c.data.error], checkoutNoWebhookSecret: c2.status, webhookNoSecret: h.statusCode, orderStatus: orders().find((x) => x.id === r1.data.orderId).status });
});

test.after(async () => {
  globalThis.fetch = realFetch;
  const dir = process.env.EVIDENCE_DIR;
  if (dir) {
    const fs = await import("node:fs");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/stripe-checkout-evidence.json`, JSON.stringify(evidence, null, 2));
  }
});
