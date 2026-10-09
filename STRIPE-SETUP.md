# Pathway Formation — paid clients + admin desk

The desk function records who ordered what. Card charging is separate and still needs Stripe.

- One-time (state fee, EIN, expedite, OA extra): first pay stamps the packet
- Monthly command desk and yearly reminders: first pay plus each renewal

## Webhook — four events

`https://YOUR-SITE/api/stripe/webhook`

| Event | Why |
|---|---|
| `checkout.session.completed` | First pay. Packet becomes a client. |
| `invoice.paid` | Command desk ($10/mo) and reminders ($99/yr) renewed. |
| `invoice.payment_failed` | Recurring gig lapsed. Desk shows `past_due`. |
| `customer.subscription.deleted` | They canceled. Desk shows `canceled`. |

Do not add `customer.created` or the rest.

## Netlify env (secret — not in git)

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OPERATOR_EMAIL`
- `OPERATOR_KEY` — required for the admin desk (view queue, change status, mark paid). If unset, admin is disabled entirely (fail closed).

Desk: `/clients` on the server app. The live page uses `/admin`.

## Static desk (index.html + Netlify functions): instant Checkout

This is what the live page at pathwaydevs.software uses.

1. Pay -> `POST /.netlify/functions/desk` `{action:"create_checkout", orderId}` -> server computes the
   amount (`netlify/lib/pricing.mjs`) -> Stripe Checkout Session (`mode=payment`, `metadata[orderId]`,
   `client_reference_id`) -> browser redirects to `session.url`.
2. Stripe -> `POST https://pathwaydevs.software/.netlify/functions/stripe-webhook`
   (same function also answers at `/api/stripe/webhook`). Signature checked with `STRIPE_WEBHOOK_SECRET`
   on the raw body; on `checkout.session.completed` with `payment_status=paid` and the amount matching the
   server price, the order is set `paid` (idempotent; replays change nothing).

Webhook endpoint to add in Stripe (Developers -> Webhooks), events:
- `checkout.session.completed` (required)
- `checkout.session.async_payment_succeeded` (optional, only matters for delayed payment methods)

Netlify env for site `pathway-formation`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (the `whsec_...`
signing secret of THAT endpoint), `OPERATOR_KEY`.

Recurring add-ons (command desk, reminders, website) are charged as their first period only, the same
as the page's "Due today" quote. Renewals are not automated by this flow.
