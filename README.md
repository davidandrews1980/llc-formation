# Pathway Formation

The public page is `index.html`. Orders and the filing queue are stored by the Netlify function `netlify/functions/desk.mjs`, not in the browser.

- Wizard, 50-state fees, customer desk, admin queue
- `POST /.netlify/functions/desk` with `bootstrap`, `place`, `pay`, `status`
- Set `OPERATOR_KEY` on the Netlify site to lock queue changes. Until that key exists, the queue stays open.
- Stripe still charges cards only when `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set. This desk records the order either way.

Live page: **https://pathwaydevs.me/** (GitHub Pages). The function runs on the Netlify site `pathway-formation`.
