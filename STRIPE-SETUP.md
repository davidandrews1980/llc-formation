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
