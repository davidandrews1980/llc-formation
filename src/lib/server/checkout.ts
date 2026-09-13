import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";
import { FORMATION_ADDONS, STRIPE_PRICES, type AddonKey } from "@/lib/stripe";

function secretKey() {
  const k = env("STRIPE_SECRET_KEY");
  if (!k) throw new Error("Stripe is not configured on the server");
  return k;
}

export const startCheckout = createServerFn({ method: "POST" })
  .validator((input: { filingId: number; addon: AddonKey; origin: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const addon = FORMATION_ADDONS.find((a) => a.key === data.addon);
    if (!addon) throw new Error("Unknown add-on");
    const origin = data.origin.replace(/\/$/, "");
    if (!/^https?:\/\//i.test(origin)) throw new Error("Bad origin");

    const sql = await getSql();
    const rows = await sql<{
      id: number;
      organizer_email: string;
      entity_name: string;
      name_ending: string;
    }>`
      select id, organizer_email, entity_name, name_ending
      from filings
      where id = ${data.filingId} and user_id = ${context.userId}
    `;
    const filing = rows[0];
    if (!filing) throw new Error("Filing not found");

    const already = await sql<{ id: number }>`
      select id from filing_payments
      where filing_id = ${data.filingId} and addon_key = ${data.addon} and status = ${"paid"}
    `;
    if (already[0]) throw new Error("Already paid");

    const body = new URLSearchParams();
    body.set("mode", addon.mode);
    body.set("success_url", `${origin}/llc/${data.filingId}?paid=${data.addon}`);
    body.set("cancel_url", `${origin}/llc/${data.filingId}?canceled=1`);
    body.set("client_reference_id", `filing-${data.filingId}`);
    body.set("line_items[0][price]", STRIPE_PRICES[data.addon]);
    body.set("line_items[0][quantity]", "1");
    body.set("metadata[filingId]", String(data.filingId));
    body.set("metadata[addon]", data.addon);
    body.set("metadata[userId]", context.userId);
    if (addon.mode === "subscription") {
      body.set("subscription_data[metadata][filingId]", String(data.filingId));
      body.set("subscription_data[metadata][addon]", data.addon);
      body.set("subscription_data[metadata][userId]", context.userId);
    }
    const email = filing.organizer_email.trim();
    if (email) body.set("customer_email", email);

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!res.ok || !json.url) {
      throw new Error(json.error?.message || "Could not start checkout");
    }
    return { url: json.url };
  });
