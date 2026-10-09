# Pathway Formation

The public page is `index.html`. Orders and the filing queue are stored by the Netlify function `netlify/functions/desk.mjs`, not in the browser.

- Wizard, 50-state fees, customer desk, admin queue
- `POST /.netlify/functions/desk` (same origin only). Customer actions: `bootstrap`, `place`, `create_checkout` (scoped to the caller's own client id). Operator actions: `admin_bootstrap`, `status`, `pay` (mark paid).
- Admin access is decided only by `OPERATOR_KEY` on the Netlify site. A role sent by the browser is ignored. If `OPERATOR_KEY` is not set, every admin action is refused (fail closed).
- Pay (Review step or customer desk) calls `create_checkout`: the server prices the order from its choices (`netlify/lib/pricing.mjs`, kept equal to the page's fee table by `scripts/pricing-parity.test.mjs`), creates a Stripe Checkout Session, and the browser goes straight to it.
- Only the signed Stripe webhook (`netlify/functions/stripe-webhook.mjs`, also at `/api/stripe/webhook`) marks an order `paid`, on `checkout.session.completed`. The page cannot mark itself paid. Operators can still mark paid manually with `OPERATOR_KEY`.
- Fail closed: without `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, Pay refuses with a clear error and nothing is charged; the webhook returns 503. See `STRIPE-SETUP.md`.
- CORS: only `https://pathwaydevs.software` and `https://www.pathwaydevs.software` (plus same-origin) may call the function from a browser.

Live page: **https://pathwaydevs.me/** (GitHub Pages). The function runs on the Netlify site `pathway-formation`.
