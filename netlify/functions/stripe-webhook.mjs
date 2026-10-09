// LEGACY / UNUSED (commit dcf75a8 Checkout approach). The live flow redirects to a Stripe Payment Link and
// an operator marks orders paid; nothing calls this and it has no route in netlify.toml. It is fail-closed
// (503 without STRIPE_WEBHOOK_SECRET) and is kept only so the old approach stays readable.
// Original description: Stripe webhook for Pathway Formation.
// URL: https://pathwaydevs.software/.netlify/functions/stripe-webhook
// Events: checkout.session.completed (+ checkout.session.async_payment_succeeded for delayed methods)
// Env: STRIPE_WEBHOOK_SECRET (the endpoint's whsec_ signing secret). Missing => 503, nothing changes.

import { blobCtx, blobGet, blobPut } from "../lib/blobs.mjs";
import { verifyStripeSignature } from "../lib/stripe.mjs";

const PAID_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

function reply(statusCode, data) {
  return { statusCode, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(data) };
}

function header(event, name) {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(event.headers || {})) if (k.toLowerCase() === want) return v;
  return "";
}

function rawBody(event) {
  if (!event.body) return Buffer.alloc(0);
  return event.isBase64Encoded ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "utf8");
}

function paidKey(orderId) {
  return `paid-${String(orderId).replace(/[^A-Za-z0-9]/g, "")}`;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return reply(405, { ok: false, error: "POST only" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("stripe-webhook: STRIPE_WEBHOOK_SECRET is not set; refusing (fail closed)");
    return reply(503, { ok: false, error: "webhook not configured" });
  }
  const raw = rawBody(event);
  const check = verifyStripeSignature(raw, header(event, "stripe-signature"), secret);
  if (!check.ok) return reply(400, { ok: false, error: `bad signature: ${check.reason}` });

  let evt;
  try {
    evt = JSON.parse(raw.toString("utf8"));
  } catch {
    return reply(400, { ok: false, error: "bad json" });
  }
  if (!PAID_EVENTS.has(evt.type)) return reply(200, { ok: true, ignored: evt.type });

  const session = evt.data && evt.data.object ? evt.data.object : {};
  if (session.payment_status !== "paid") return reply(200, { ok: true, ignored: `payment_status ${session.payment_status}` });
  const orderId = String((session.metadata && session.metadata.orderId) || session.client_reference_id || "");
  if (!orderId || (session.metadata && session.metadata.app && session.metadata.app !== "pathway-formation")) {
    return reply(200, { ok: true, ignored: "not a formation order" });
  }

  const ctx = blobCtx(event);
  if (!ctx) return reply(503, { ok: false, error: "desk store is not attached" }); // Stripe retries

  try {
    const orders = (await blobGet(ctx, "orders")) || [];
    const order = Array.isArray(orders) ? orders.find((o) => o.id === orderId) : null;
    if (!order) return reply(200, { ok: true, ignored: "unknown order" });

    // Idempotent: a replayed / duplicate event for an already-paid order changes nothing.
    const existing = await blobGet(ctx, paidKey(orderId));
    if (existing && order.status === "paid") return reply(200, { ok: true, orderId, already: true });

    // The amount Stripe collected must equal what the server priced for this order.
    const expected = order.checkout && order.checkout.amountTotal;
    if (typeof expected !== "number" || session.amount_total !== expected || String(session.currency).toLowerCase() !== "usd") {
      console.error("stripe-webhook: amount mismatch, not marking paid", { orderId, expected, got: session.amount_total });
      order.paymentIssue = { sessionId: session.id, amountTotal: session.amount_total, expected, at: new Date().toISOString() };
      await blobPut(ctx, "orders", orders);
      return reply(200, { ok: true, orderId, flagged: "amount mismatch" });
    }

    const mark = existing || { orderId, sessionId: session.id, eventId: evt.id, amountTotal: session.amount_total, paidAt: new Date().toISOString() };
    if (!existing) await blobPut(ctx, paidKey(orderId), mark);
    order.status = "paid";
    order.paidAt = mark.paidAt;
    order.payment = { via: "stripe", sessionId: mark.sessionId, amountTotal: mark.amountTotal };
    await blobPut(ctx, "orders", orders);
    return reply(200, { ok: true, orderId, paid: true });
  } catch (err) {
    console.error("stripe-webhook failed", err && err.message);
    return reply(500, { ok: false, error: "store failed" }); // Stripe retries
  }
}
