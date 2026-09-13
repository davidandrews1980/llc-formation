# Pathway Formation — paid clients + admin desk

The app records who ordered what.

- Customer pays → webhook stamps the packet **Paid**
- **Desk** (`/clients`) is the admin dashboard: company, contact, email, line items, amount, date
- You move the job: paid → working → filed → done
- Notes stay on the order

## Files

- `migrations/0003_payments.sql`
- `src/lib/stripe.ts`
- `src/lib/server/checkout.ts`
- `src/lib/server/llc.ts`
- `src/routes/api/stripe.webhook.ts`
- `src/routes/llc.$id.tsx`
- `src/routes/llc.tsx`
- `src/routes/clients.tsx`  ← the desk
- `src/components/app-shell.tsx`

## Netlify env (secret — not in git)

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OPERATOR_EMAIL` — your login email so Desk shows every order

Webhook: `https://YOUR-SITE/api/stripe/webhook`
Event: `checkout.session.completed`
