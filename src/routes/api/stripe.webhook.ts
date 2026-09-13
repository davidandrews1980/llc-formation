import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";

function verified(payload: string, header: string, secret: string) {
  const parts: Record<string, string> = {};
  for (const item of header.split(",")) {
    const [k, ...rest] = item.split("=");
    if (k) parts[k.trim()] = rest.join("=").trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

type StripeObj = Record<string, unknown>;

function asObj(v: unknown): StripeObj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as StripeObj) : {};
}

function asStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "id" in (v as StripeObj)) {
    const id = (v as StripeObj).id;
    return typeof id === "string" ? id : "";
  }
  return "";
}

function meta(v: unknown): Record<string, string> {
  const o = asObj(v);
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(o)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

async function stampPayment(input: {
  filingId: number;
  addon: string;
  sessionId: string;
  subscriptionId: string;
  customerId: string;
  email: string;
  amountCents: number;
  currency: string;
  status: string;
}) {
  const sql = await getSql();
  if (input.subscriptionId) {
    const existing = await sql.query<{ id: number }>(
      `select id from filing_payments where stripe_subscription_id = $1 limit 1`,
      [input.subscriptionId],
    );
    if (existing[0]) {
      await sql.query(
        `update filing_payments
         set status = $1, amount_cents = $2, email = coalesce(nullif($3, ''), email),
             stripe_customer_id = coalesce(nullif($4, ''), stripe_customer_id)
         where id = $5`,
        [input.status, input.amountCents, input.email, input.customerId, existing[0].id],
      );
      return;
    }
  }
  await sql.query(
    `insert into filing_payments
       (filing_id, addon_key, stripe_session_id, stripe_subscription_id, stripe_customer_id, email, amount_cents, currency, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (stripe_session_id) do update set
       status = excluded.status,
       amount_cents = excluded.amount_cents,
       stripe_subscription_id = coalesce(nullif(excluded.stripe_subscription_id, ''), filing_payments.stripe_subscription_id)`,
    [
      input.filingId,
      input.addon,
      input.sessionId,
      input.subscriptionId,
      input.customerId,
      input.email,
      input.amountCents,
      input.currency,
      input.status,
    ],
  );
  if (input.status === "paid" || input.status === "active") {
    await sql.query(
      `update filings
       set service_status = 'paid', updated_at = now()
       where id = $1 and service_status = 'open'`,
      [input.filingId],
    );
  }
}

async function setSubStatus(subscriptionId: string, status: string) {
  if (!subscriptionId) return;
  const sql = await getSql();
  await sql.query(
    `update filing_payments set status = $1 where stripe_subscription_id = $2`,
    [status, subscriptionId],
  );
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = env("STRIPE_WEBHOOK_SECRET");
        if (!secret) {
          return new Response("webhook not configured", { status: 503 });
        }
        const payload = await request.text();
        const sig = request.headers.get("stripe-signature") || "";
        if (!verified(payload, sig, secret)) {
          return new Response("bad signature", { status: 400 });
        }
        const event = JSON.parse(payload) as { type?: string; data?: { object?: StripeObj } };
        const obj = event.data?.object ?? {};

        if (event.type === "checkout.session.completed") {
          if (asStr(obj.payment_status) && asStr(obj.payment_status) !== "paid") {
            return new Response("ok", { status: 200 });
          }
          const m = meta(obj.metadata);
          const filingId = Number(m.filingId);
          const addon = m.addon;
          if (!addon || !Number.isFinite(filingId)) return new Response("ok", { status: 200 });
          const details = asObj(obj.customer_details);
          await stampPayment({
            filingId,
            addon,
            sessionId: asStr(obj.id),
            subscriptionId: asStr(obj.subscription),
            customerId: asStr(obj.customer),
            email: asStr(details.email) || asStr(obj.customer_email),
            amountCents: Number(obj.amount_total) || 0,
            currency: asStr(obj.currency) || "usd",
            status: asStr(obj.subscription) ? "active" : "paid",
          });
          return new Response("ok", { status: 200 });
        }

        if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
          const parent = asObj(obj.parent);
          const subDetails = asObj(parent.subscription_details);
          const m = { ...meta(obj.metadata), ...meta(subDetails.metadata) };
          const subscriptionId =
            asStr(obj.subscription) || asStr(subDetails.subscription);
          const filingId = Number(m.filingId);
          const addon = m.addon;
          const status = event.type === "invoice.paid" ? "active" : "past_due";
          if (addon && Number.isFinite(filingId)) {
            await stampPayment({
              filingId,
              addon,
              sessionId: asStr(obj.id),
              subscriptionId,
              customerId: asStr(obj.customer),
              email: asStr(obj.customer_email),
              amountCents: Number(obj.amount_paid) || Number(obj.amount_due) || 0,
              currency: asStr(obj.currency) || "usd",
              status,
            });
          } else if (subscriptionId) {
            await setSubStatus(subscriptionId, status);
          }
          return new Response("ok", { status: 200 });
        }

        if (event.type === "customer.subscription.deleted") {
          await setSubStatus(asStr(obj.id), "canceled");
          return new Response("ok", { status: 200 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
