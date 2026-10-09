// Minimal Stripe helpers for the Netlify functions. Plain fetch to the Stripe REST API; no SDK.
// Secrets come only from the site env (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) and are never
// logged or returned to the browser.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeConfigured() {
  const k = process.env.STRIPE_SECRET_KEY;
  const w = process.env.STRIPE_WEBHOOK_SECRET;
  return typeof k === "string" && k.length > 0 && typeof w === "string" && w.length > 0;
}

// Flatten nested params into Stripe's form encoding: a[b][0][c]=v
export function formEncode(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? formEncode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === "object") formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

// Create a Checkout Session. Amounts in quote.items are computed on the server (netlify/lib/pricing.mjs).
export async function createCheckoutSession({ order, quote, baseUrl }) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("payments are not configured (STRIPE_SECRET_KEY missing)");
  const params = {
    mode: "payment",
    success_url: `${baseUrl}/?paid=${encodeURIComponent(order.id)}#/app`,
    cancel_url: `${baseUrl}/?canceled=${encodeURIComponent(order.id)}#/app`,
    client_reference_id: order.id,
    customer_email: order.email || undefined,
    metadata: { orderId: order.id, app: "pathway-formation" },
    payment_intent_data: { metadata: { orderId: order.id, app: "pathway-formation" } },
    line_items: quote.items.map((i) => ({
      quantity: 1,
      price_data: { currency: quote.currency, unit_amount: i.amount, product_data: { name: `Pathway Formation — ${i.name}` } },
    })),
  };
  const body = formEncode(params);
  // Same order + same contents => same session within Stripe's idempotency window (no double sessions on double-click).
  const idem = "pf-" + createHash("sha256").update(body.toString()).digest("hex").slice(0, 40);
  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": idem,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url || !json.id) {
    throw new Error(`stripe checkout failed (${res.status}${json?.error?.message ? ": " + json.error.message : ""})`);
  }
  return { id: json.id, url: json.url, amountTotal: json.amount_total, expiresAt: json.expires_at };
}

// Verify a Stripe-Signature header against the RAW request body (Buffer or string).
// Scheme: HMAC-SHA256(secret, `${t}.${rawBody}`) hex, compared to every v1 entry; t within tolerance.
export function verifyStripeSignature(rawBody, sigHeader, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!secret) return { ok: false, reason: "webhook secret not configured" };
  if (!sigHeader || typeof sigHeader !== "string") return { ok: false, reason: "missing signature" };
  let t = null;
  const v1 = [];
  for (const part of sigHeader.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1.push(v);
  }
  if (!t || !/^\d+$/.test(t) || v1.length === 0) return { ok: false, reason: "malformed signature" };
  if (Math.abs(Math.floor(now / 1000) - Number(t)) > toleranceSec) return { ok: false, reason: "timestamp outside tolerance" };
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  const expected = createHmac("sha256", secret).update(Buffer.concat([Buffer.from(`${t}.`, "utf8"), raw])).digest();
  for (const sig of v1) {
    if (!/^[0-9a-f]{64}$/i.test(sig)) continue;
    const got = Buffer.from(sig, "hex");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature mismatch" };
}
