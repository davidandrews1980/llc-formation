# Pathway Formation: payments and order email

Payment is a single Stripe **Payment Link**: `https://buy.stripe.com/3cIfZhd9cbg1eho5Mj1kA0l`
(constant in `netlify/lib/payment.mjs`). No Stripe API key or webhook secret is used by the live path.

## Flow

1. Customer fills the wizard; the Review step requires their name and email.
2. "Submit order and pay" (or Pay on the customer desk) -> `desk` saves the order (status `awaiting payment`,
   quoted total computed on the server), sends the order email (waits at most 4 s), returns the payment URL.
3. The browser goes to the payment link with `?client_reference_id=<orderId>&prefilled_email=<email>`
   (documented Payment Link URL parameters). The payer enters the amount on Stripe.
4. Operator (Admin desk, needs `OPERATOR_KEY`) records the paid amount and marks the order paid. Until then the
   order stays `awaiting payment`. In the Stripe Dashboard the payment's client reference ID is the order id.

The payment link must be set up in Stripe to let the customer enter the amount ("customer chooses price"); that is
a Stripe-side setting, not something this code controls.

## Netlify environment variables (site `pathway-formation`; secrets, not in git)

| Variable | Needed | Purpose |
|---|---|---|
| `OPERATOR_KEY` | yes | Admin desk. If unset, all admin actions are refused (fail closed). |
| `RESEND_API_KEY` | one of these two email options | Send the order email through Resend (`https://api.resend.com/emails`). |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | (alternative) | Send through SMTP instead (used only if `RESEND_API_KEY` is not set). Optional: `SMTP_PORT` (default 587), `SMTP_SECURE=true` (implied for port 465). |
| `EMAIL_FROM` | optional | From address. Default with Resend: `Formation Desk <onboarding@resend.dev>`. With SMTP the default is `SMTP_USER`. |
| `ORDER_EMAIL_TO` | optional | Recipient. Default `John_Gault_jr@outlook.com`. |

If neither Resend nor SMTP is configured, the function logs `order email not configured` and still saves the order
and redirects. Set variables for the Functions scope and redeploy so they take effect.

### Resend and `onboarding@resend.dev`

Resend documents `onboarding@resend.dev` (the `resend.dev` test domain) as testing only: it can send only to the
email address of the Resend account owner. Sending to any other recipient returns a 403 until you add and verify a
domain you own at resend.com/domains (add the DNS records Resend shows, wait for verification) and set `EMAIL_FROM`
to an address on that domain, for example `Formation Desk <orders@notifications.yourdomain.com>`.
So for mail to reach `John_Gault_jr@outlook.com`, either that address is the email of the Resend account, or a
domain is verified and `EMAIL_FROM` uses it. The order is saved either way; a failed send is recorded on the order
(`emailStatus`) and logged in the function log.

## Legacy

`netlify/functions/stripe-webhook.mjs`, `netlify/lib/stripe.mjs` are from the earlier Checkout approach (commit
dcf75a8). They are unused (no route, fail closed without `STRIPE_WEBHOOK_SECRET`). `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` are not needed.

## Older server app (`src/`, unrelated to the static desk above)

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
