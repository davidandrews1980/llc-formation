/**
 * Live Stripe Payment Links for John Gault & Sons (acct_1UBXtFEWvt83P4ry).
 * These URLs are public Checkout pages — no secret key in the client.
 */
export const STRIPE_LINKS = {
  stateFee: "https://buy.stripe.com/eVq8wPedg6ZLfls8Yv1kA09",
  oaExtra: "https://buy.stripe.com/28EdR9edgbg15KS6Qn1kA0a",
  ein: "https://buy.stripe.com/3cIfZhd9cgAl4GOdeL1kA05",
  expedite: "https://buy.stripe.com/14AfZhd9c4RDfls7Ur1kA06",
  commandDesk: "https://buy.stripe.com/8x26oH6KOfwha18eiP1kA07",
  compliance: "https://buy.stripe.com/dRm28redg4RDehodeL1kA08",
} as const;

export type StripeAddon = {
  key: keyof typeof STRIPE_LINKS;
  title: string;
  price: string;
  blurb: string;
  required?: boolean;
};

export const FORMATION_ADDONS: StripeAddon[] = [
  {
    key: "stateFee",
    title: "State filing fee",
    price: "Pass-through",
    blurb: "You enter the exact state charge. No markup.",
    required: true,
  },
  {
    key: "ein",
    title: "EIN assistance",
    price: "$99 once",
    blurb: "We walk the IRS EIN with you.",
  },
  {
    key: "expedite",
    title: "Expedite handling",
    price: "$100 once",
    blurb: "Faster handling on our side. No date promised. State fee is separate.",
  },
  {
    key: "oaExtra",
    title: "Operating agreement extra pages",
    price: "First 3 pages $0",
    blurb: "$2 per page after 3. You set the amount on the next screen.",
  },
  {
    key: "commandDesk",
    title: "Command desk",
    price: "$10 / month",
    blurb: "Ongoing desk for this entity.",
  },
  {
    key: "compliance",
    title: "Compliance reminders",
    price: "$99 / year",
    blurb: "Annual statement and report reminders.",
  },
];

export function stripeCheckoutUrl(
  key: keyof typeof STRIPE_LINKS,
  opts?: { filingId?: number; email?: string },
) {
  const url = new URL(STRIPE_LINKS[key]);
  if (opts?.filingId) url.searchParams.set("client_reference_id", `filing-${opts.filingId}`);
  if (opts?.email) url.searchParams.set("prefilled_email", opts.email);
  return url.toString();
}
