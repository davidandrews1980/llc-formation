/**
 * Public catalog for Pathway Formation.
 * Price IDs are not secret. The secret key lives only on the server.
 */
export const STRIPE_PRICES = {
  stateFee: "price_1UDpK8EWvt83P4ry5Kp3Bj0a",
  oaExtra: "price_1UDpKAEWvt83P4ryOQDAMO55",
  ein: "price_1UDpK3EWvt83P4ryck6zLGmo",
  expedite: "price_1UDpK1EWvt83P4ryMXUBReJo",
  commandDesk: "price_1UDpK5EWvt83P4ryBz47ea8i",
  compliance: "price_1UDpK7EWvt83P4ryL8BtzZSB",
} as const;

export type AddonKey = keyof typeof STRIPE_PRICES;

export type StripeAddon = {
  key: AddonKey;
  title: string;
  price: string;
  blurb: string;
  mode: "payment" | "subscription";
  customAmount?: boolean;
  required?: boolean;
};

export const FORMATION_ADDONS: StripeAddon[] = [
  {
    key: "stateFee",
    title: "State filing fee",
    price: "Pass-through",
    blurb: "You type the exact state charge. No markup.",
    mode: "payment",
    customAmount: true,
    required: true,
  },
  {
    key: "ein",
    title: "EIN assistance",
    price: "$99 once",
    blurb: "We walk the IRS EIN with you.",
    mode: "payment",
  },
  {
    key: "expedite",
    title: "Expedite handling",
    price: "$100 once",
    blurb: "Faster handling on our side. No date promised. State fee is separate.",
    mode: "payment",
  },
  {
    key: "oaExtra",
    title: "Operating agreement extra pages",
    price: "First 3 pages $0",
    blurb: "$2 per page after 3. You set the amount on the next screen.",
    mode: "payment",
    customAmount: true,
  },
  {
    key: "commandDesk",
    title: "Command desk",
    price: "$10 / month",
    blurb: "Ongoing desk for this entity.",
    mode: "subscription",
  },
  {
    key: "compliance",
    title: "Compliance reminders",
    price: "$99 / year",
    blurb: "Annual statement and report reminders.",
    mode: "subscription",
  },
];
