// Order email for the formation desk. Provider is chosen by env vars:
//   1. RESEND_API_KEY set  -> Resend REST API (https://api.resend.com/emails)
//   2. SMTP_HOST + SMTP_USER + SMTP_PASS set -> SMTP via nodemailer
//   3. neither -> logs "email not configured"; the order is still saved.
// sendOrderEmail never throws and never waits longer than timeoutMs, so it can be awaited before the redirect.

import { STRIPE_PAYMENT_LINK } from "./payment.mjs";

export const DEFAULT_TO = "John_Gault_jr@outlook.com";
export const DEFAULT_RESEND_FROM = "Formation Desk <onboarding@resend.dev>";
export const EMAIL_TIMEOUT_MS = 8000;

const s = (v) => String(v ?? "").replace(/[\r\n]+/g, " ").trim();
const clean = (v) => String(v ?? "").trim();
const money = (cents) => `$${(Number(cents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function etTime(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return String(iso || "");
  const et = d.toLocaleString("en-US", { timeZone: "America/New_York", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
  return `${et} (${d.toISOString()})`;
}

function addr(a) {
  if (!a || typeof a !== "object") return "";
  const line = [s(a.street), s(a.city), [s(a.state), s(a.zip)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return line;
}

export function recipient() {
  const to = s(process.env.ORDER_EMAIL_TO);
  return to || DEFAULT_TO;
}

// Structured sections, rendered to both text and HTML so the two always say the same thing.
export function orderSections(order) {
  const d = order.draft && typeof order.draft === "object" ? order.draft : {};
  const q = order.quote;
  const members = Array.isArray(d.members) ? d.members : [];
  const sections = [];

  sections.push({
    title: "Customer",
    rows: [
      ["Name", s(order.contactName) || "(not given)"],
      ["Email", s(order.email)],
    ],
  });

  sections.push({
    title: "Order",
    rows: [
      ["Order ID", s(order.id)],
      ["Placed (ET)", etTime(order.created)],
      ["Status", "awaiting payment"],
      ["Quoted total", q ? money(q.total) : money(order.due)],
      ["State filing fee", q && q.items && q.items[0] ? money(q.items[0].amount) : "(see breakdown)"],
    ],
  });

  const company = [
    ["LLC name", s(order.llcName)],
    ["State", `${s(order.stateName)} (${s(order.stateCode)})`],
    ["Filing", [s(order.document), s(order.agency)].filter(Boolean).join(" / ")],
    ["Management", s(d.management)],
    ["Purpose", s(d.purpose)],
    ["Organizer", s(order.organizer)],
    ["Principal office", addr(d.principal)],
    ["Mailing address", d.mailingSame ? "same as principal office" : addr(d.mailing)],
    ["Registered agent", s(d.ra && d.ra.name)],
    ["Registered agent address", addr(d.ra)],
  ].filter(([, v]) => v);
  sections.push({ title: "Company", rows: company });

  sections.push({
    title: "Members",
    rows: members.length
      ? members.map((m, i) => [`Member ${i + 1}`, [s(m.name), s(m.title), m.ownership !== undefined && m.ownership !== "" ? `${s(m.ownership)}%` : "", addr(m)].filter(Boolean).join(" | ")])
      : [["Members", "(none listed)"]],
  });

  const svc = [];
  if (d.ein === true) svc.push(["EIN assistance", "yes"]);
  if (d.expedited === true) svc.push(["Expedite handling", "yes"]);
  const oa = Number(d.oaPages);
  if (Number.isFinite(oa)) svc.push(["Operating agreement pages", `${oa} (first 3 included)`]);
  if (d.reminders === true) svc.push(["Compliance reminders", "yes"]);
  if (d.command === true) svc.push(["Command desk", "yes"]);
  if (d.website === true) svc.push(["Website / domain / email", "yes"]);
  sections.push({ title: "Services and add-ons chosen", rows: svc.length ? svc : [["Add-ons", "none selected"]] });

  if (q && Array.isArray(q.items)) {
    sections.push({
      title: "Quote breakdown",
      rows: [...q.items.map((i) => [s(i.name), money(i.amount)]), ["Quoted total", money(q.total)]],
    });
  }

  sections.push({
    title: "Payment",
    rows: [
      ["Status", "awaiting payment"],
      ["How", `The customer pays through the Stripe payment link and types the amount there: ${STRIPE_PAYMENT_LINK}`],
      ["Match the payment", `In Stripe, the payment's client reference ID is ${s(order.id)} and the payer email was prefilled with ${s(order.email)}.`],
    ],
  });
  return sections;
}

const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function buildOrderEmail(order) {
  const sections = orderSections(order);
  const q = order.quote;
  const total = q ? money(q.total) : money(order.due);
  const subject = `New LLC order ${s(order.id)}: ${s(order.llcName)} (${s(order.stateCode)}) ${total}, awaiting payment`.slice(0, 200);
  const head = `New formation order from ${s(order.contactName) || "(no name)"} <${s(order.email)}>`;

  const text = [
    head,
    "",
    ...sections.flatMap((sec) => [sec.title.toUpperCase(), ...sec.rows.map(([k, v]) => `  ${k}: ${clean(v)}`), ""]),
    "This is an automatic notice from the Pathway Formation desk. Payment has not been confirmed.",
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1c1c;max-width:680px">
<h2 style="margin:0 0 4px">New formation order</h2>
<p style="font-size:18px;margin:0 0 14px"><strong>${escHtml(s(order.contactName) || "(no name)")}</strong> &lt;<a href="mailto:${escHtml(s(order.email))}">${escHtml(s(order.email))}</a>&gt;</p>
${sections.map((sec) => `<h3 style="margin:18px 0 6px;border-bottom:1px solid #ccc">${escHtml(sec.title)}</h3>
<table cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:14px">${sec.rows.map(([k, v]) => `<tr><td style="vertical-align:top;color:#555;padding-right:14px;white-space:nowrap">${escHtml(k)}</td><td style="vertical-align:top">${escHtml(clean(v))}</td></tr>`).join("")}</table>`).join("\n")}
<p style="color:#666;font-size:12px;margin-top:20px">Automatic notice from the Pathway Formation desk. Payment has not been confirmed.</p>
</body></html>`;
  return { subject, text, html };
}

function fromAddress(kind) {
  const f = s(process.env.EMAIL_FROM);
  if (f) return f;
  if (kind === "resend") return DEFAULT_RESEND_FROM;
  return s(process.env.SMTP_USER);
}

export function emailProvider() {
  if (s(process.env.RESEND_API_KEY)) return "resend";
  if (s(process.env.SMTP_HOST) && s(process.env.SMTP_USER) && process.env.SMTP_PASS) return "smtp";
  return null;
}

async function viaResend(mail, order, to, signal) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal,
    headers: { authorization: `Bearer ${s(process.env.RESEND_API_KEY)}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: fromAddress("resend"),
      to: [to],
      reply_to: s(order.email) || undefined,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
  });
  if (!res.ok) {
    const detail = s(await res.text().catch(() => "")).slice(0, 120); // short, single-line; Resend error bodies never echo the key
    throw new Error(`resend ${res.status} ${detail}`);
  }
}

async function viaSmtp(mail, order, to, timeoutMs) {
  const { default: nodemailer } = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
  const transport = nodemailer.createTransport({
    host: s(process.env.SMTP_HOST),
    port,
    secure,
    auth: { user: s(process.env.SMTP_USER), pass: String(process.env.SMTP_PASS) },
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  });
  try {
    await transport.sendMail({ from: fromAddress("smtp"), to, replyTo: s(order.email) || undefined, subject: mail.subject, text: mail.text, html: mail.html });
  } finally {
    transport.close();
  }
}

// Short, secret-free failure reason: never includes the API key, SMTP password or auth header.
export function failureReason(err, provider) {
  let msg = s((err && err.message) || err);
  for (const secret of [process.env.RESEND_API_KEY, process.env.SMTP_PASS, process.env.OPERATOR_KEY]) {
    const v = s(secret);
    if (v.length >= 6) msg = msg.split(v).join("[redacted]");
  }
  msg = msg.replace(/re_[A-Za-z0-9_]{8,}/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  return `${provider}: ${msg}`.slice(0, 200);
}

// Returns { status: "sent" | "not_configured" | "failed", provider?, error? }. Never throws.
export async function sendOrderEmail(order, { timeoutMs = EMAIL_TIMEOUT_MS } = {}) {
  const provider = emailProvider();
  if (!provider) {
    console.error(`order email not configured: set RESEND_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS. Order ${order.id} was saved but NOT emailed.`);
    return { status: "not_configured" };
  }
  const to = recipient();
  const ctl = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new Error(`email timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    const mail = buildOrderEmail(order);
    const work = provider === "resend" ? viaResend(mail, order, to, ctl.signal) : viaSmtp(mail, order, to, timeoutMs);
    work.catch(() => {}); // a late rejection after the timeout must not become unhandled
    await Promise.race([work, timeout]);
    return { status: "sent", provider };
  } catch (err) {
    const msg = failureReason(err, provider);
    console.error(`order email failed (${provider}) for order ${order.id}: ${msg}`);
    return { status: "failed", provider, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
