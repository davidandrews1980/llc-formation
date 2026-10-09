# Pathway Formation

The public page is `index.html`. Orders and the filing queue are stored by the Netlify function `netlify/functions/desk.mjs` (Netlify Blobs), not in the browser.

- Wizard, 50-state fees, customer desk, admin queue.
- `POST /.netlify/functions/desk` (same origin only). Customer actions: `bootstrap`, `place`, `begin_payment` (all scoped to the caller's own client id). Operator actions: `admin_bootstrap`, `status`, `paid_amount`, `pay` (mark paid).
- **Order flow.** The Review-step button and the customer-desk Pay button both: save the order on the server, send the ORDER EMAIL, then send the customer to the single Stripe payment link with `?client_reference_id=<orderId>&prefilled_email=<email>`. The payer types the amount on Stripe; there is no server-side amount enforcement. The order records the QUOTED total (computed on the server by `netlify/lib/pricing.mjs`, kept equal to the page's fee table by `scripts/pricing-parity.test.mjs`) and stays `awaiting payment` until the operator records the paid amount and marks it paid.
- **Order email** (`netlify/lib/email.mjs`) goes to `ORDER_EMAIL_TO` (default `John_Gault_jr@outlook.com`), plain text plus HTML, with every order detail. Provider by env: `RESEND_API_KEY` -> Resend; else `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` -> SMTP (nodemailer); else it logs "email not configured". The send is awaited for at most 4 seconds and the customer is redirected regardless; the order is always saved first. Customer name and email are required on the order.
- Admin access is decided only by `OPERATOR_KEY`. A role sent by the browser is ignored. If `OPERATOR_KEY` is not set, every admin action is refused (fail closed). Only an operator can set the paid amount or mark an order paid.
- CORS: only `https://pathwaydevs.software` and `https://www.pathwaydevs.software` (plus same-origin) may call the function from a browser.
- Analytics: placeholder only. Set `ANALYTICS_SCRIPT_URL` in `index.html` when David provides the tag; it loads only after consent (`pfConsent.grant()`).
- Legacy: `netlify/functions/stripe-webhook.mjs` and `netlify/lib/stripe.mjs` belong to the earlier Stripe Checkout approach (commit dcf75a8). Nothing calls them and they have no route; they stay for history.

Setup and env vars: `STRIPE-SETUP.md`. Tests: `node --test scripts/desk-order.test.mjs scripts/pricing-parity.test.mjs` (needs `npm install` for nodemailer).

Live page: **https://pathwaydevs.me/** (GitHub Pages). The function runs on the Netlify site `pathway-formation`.
