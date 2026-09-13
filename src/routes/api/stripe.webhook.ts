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
        const event = JSON.parse(payload) as {
          type?: string;
          data?: {
            object?: {
              id?: string;
              payment_status?: string;
              amount_total?: number;
              currency?: string;
              customer?: string | null;
              customer_email?: string | null;
              customer_details?: { email?: string | null } | null;
              metadata?: Record<string, string>;
              client_reference_id?: string | null;
            };
          };
        };
        if (event.type !== "checkout.session.completed") {
          return new Response("ok", { status: 200 });
        }
        const session = event.data?.object;
        if (!session?.id) return new Response("ok", { status: 200 });
        if (session.payment_status && session.payment_status !== "paid") {
          return new Response("ok", { status: 200 });
        }
        const addon = session.metadata?.addon;
        const filingId = Number(session.metadata?.filingId);
        if (!addon || !Number.isFinite(filingId)) {
          return new Response("ok", { status: 200 });
        }
        const email =
          session.customer_details?.email ||
          session.customer_email ||
          "";
        const sql = await getSql();
        await sql.query(
          `insert into filing_payments
             (filing_id, addon_key, stripe_session_id, stripe_customer_id, email, amount_cents, currency, status)
           values ($1, $2, $3, $4, $5, $6, $7, 'paid')
           on conflict (stripe_session_id) do nothing`,
          [
            filingId,
            addon,
            session.id,
            session.customer || "",
            email,
            session.amount_total || 0,
            session.currency || "usd",
          ],
        );
        await sql.query(
          `update filings
           set service_status = 'paid', updated_at = now()
           where id = $1 and service_status = 'open'`,
          [filingId],
        );
        return new Response("ok", { status: 200 });
      },
    },
  },
});
