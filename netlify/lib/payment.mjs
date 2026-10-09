// The single Stripe Payment Link every order is sent to. The payer types the amount on Stripe's page,
// so there is no server-side amount enforcement here. The order id rides along as client_reference_id
// so a payment can be matched to its order; prefilled_email prefills the payer's email field.
// Both are documented Payment Link URL parameters (https://docs.stripe.com/payment-links/customize).

export const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/3cIfZhd9cbg1eho5Mj1kA0l";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function paymentUrl(order) {
  const u = new URL(STRIPE_PAYMENT_LINK);
  // Stripe accepts only [A-Za-z0-9_-] (max 200) in client_reference_id; order ids are 16 hex chars.
  u.searchParams.set("client_reference_id", String(order.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200));
  const email = String(order.email || "").trim();
  if (EMAIL_RE.test(email)) u.searchParams.set("prefilled_email", email);
  return u.toString();
}
