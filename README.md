# Pathway Formation

The public page is `index.html`. Orders and the filing queue are stored by the Netlify function `netlify/functions/desk.mjs`, not in the browser.

- Wizard, 50-state fees, customer desk, admin queue
- `POST /.netlify/functions/desk` (same origin only). Customer actions: `bootstrap`, `place`, `request_payment` (scoped to the caller's own client id). Operator actions: `admin_bootstrap`, `status`, `pay` (mark paid).
- Admin access is decided only by `OPERATOR_KEY` on the Netlify site. A role sent by the browser is ignored. If `OPERATOR_KEY` is not set, every admin action is refused (fail closed).
- Customers cannot mark an order paid. Pay flags the order `awaiting_payment` and says a secure payment link will be emailed. Stripe Checkout is not wired here yet: see the `TODO(stripe)` hook in `netlify/functions/desk.mjs` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
- CORS: only `https://pathwaydevs.software` and `https://www.pathwaydevs.software` (plus same-origin) may call the function from a browser.

Live page: **https://pathwaydevs.me/** (GitHub Pages). The function runs on the Netlify site `pathway-formation`.
