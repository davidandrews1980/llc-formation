// Server-side price table for Pathway Formation checkout.
// Duplicated from the STATES / P / stateFee / quote() logic in index.html so the server, not the
// browser, decides what a customer is charged. scripts/pricing-parity.test.mjs fails if the two drift.

export const STATE_FEES = {
  AL: { name: "Alabama", feeCents: 20000, expediteCents: 5000 },
  AK: { name: "Alaska", feeCents: 25000, expediteCents: 5000 },
  AZ: { name: "Arizona", feeCents: 5000, expediteCents: 3500 },
  AR: { name: "Arkansas", feeCents: 4500, expediteCents: 5000 },
  CA: { name: "California", feeCents: 7000, expediteCents: 35000 },
  CO: { name: "Colorado", feeCents: 5000, expediteCents: 5000 },
  CT: { name: "Connecticut", feeCents: 12000, expediteCents: 5000 },
  DE: { name: "Delaware", feeCents: 11000, expediteCents: 5000 },
  DC: { name: "District of Columbia", feeCents: 9900, expediteCents: 10000 },
  FL: { name: "Florida", feeCents: 12500, expediteCents: 5000 },
  GA: { name: "Georgia", feeCents: 10000, expediteCents: 10000 },
  HI: { name: "Hawaii", feeCents: 5000, expediteCents: 2500 },
  ID: { name: "Idaho", feeCents: 10000, expediteCents: 4000 },
  IL: { name: "Illinois", feeCents: 15000, expediteCents: 5000 },
  IN: { name: "Indiana", feeCents: 9500, expediteCents: 2500 },
  IA: { name: "Iowa", feeCents: 5000, expediteCents: 5000 },
  KS: { name: "Kansas", feeCents: 16000, expediteCents: 5000 },
  KY: { name: "Kentucky", feeCents: 4000, expediteCents: 4000 },
  LA: { name: "Louisiana", feeCents: 10000, expediteCents: 3000 },
  ME: { name: "Maine", feeCents: 17500, expediteCents: 5000 },
  MD: { name: "Maryland", feeCents: 10000, expediteCents: 5000 },
  MA: { name: "Massachusetts", feeCents: 50000, expediteCents: 50000 },
  MI: { name: "Michigan", feeCents: 5000, expediteCents: 5000 },
  MN: { name: "Minnesota", feeCents: 15500, expediteCents: 5000 },
  MS: { name: "Mississippi", feeCents: 5000, expediteCents: 4000 },
  MO: { name: "Missouri", feeCents: 5000, expediteCents: 2000 },
  MT: { name: "Montana", feeCents: 3500, expediteCents: 2000 },
  NE: { name: "Nebraska", feeCents: 10000, expediteCents: 5000 },
  NV: { name: "Nevada", feeCents: 42500, expediteCents: 12500 },
  NH: { name: "New Hampshire", feeCents: 10000, expediteCents: 5000 },
  NJ: { name: "New Jersey", feeCents: 12500, expediteCents: 5000 },
  NM: { name: "New Mexico", feeCents: 5000, expediteCents: 15000 },
  NY: { name: "New York", feeCents: 20000, expediteCents: 7500 },
  NC: { name: "North Carolina", feeCents: 12500, expediteCents: 10000 },
  ND: { name: "North Dakota", feeCents: 13500, expediteCents: 5000 },
  OH: { name: "Ohio", feeCents: 9900, expediteCents: 10000 },
  OK: { name: "Oklahoma", feeCents: 10000, expediteCents: 5000 },
  OR: { name: "Oregon", feeCents: 10000, expediteCents: 5000 },
  PA: { name: "Pennsylvania", feeCents: 12500, expediteCents: 10000 },
  RI: { name: "Rhode Island", feeCents: 15000, expediteCents: 5000 },
  SC: { name: "South Carolina", feeCents: 11000, expediteCents: 2500 },
  SD: { name: "South Dakota", feeCents: 15000, expediteCents: 5000 },
  TN: { name: "Tennessee", feeCents: 30000, expediteCents: 10000 },
  TX: { name: "Texas", feeCents: 30000, expediteCents: 2500 },
  UT: { name: "Utah", feeCents: 5900, expediteCents: 7500 },
  VT: { name: "Vermont", feeCents: 15500, expediteCents: 5000 },
  VA: { name: "Virginia", feeCents: 10000, expediteCents: 10000 },
  WA: { name: "Washington", feeCents: 20000, expediteCents: 5000 },
  WV: { name: "West Virginia", feeCents: 10000, expediteCents: 5000 },
  WI: { name: "Wisconsin", feeCents: 13000, expediteCents: 2500 },
  WY: { name: "Wyoming", feeCents: 10000, expediteCents: 5000 },
};

// Same constants as P in index.html (cents).
export const PRICES = { ein: 9900, oaPage: 200, oaFree: 3, oaMax: 40, reminders: 9900, expSvc: 10000, command: 1000, website: 2000 };

export function stateFee(code, members) {
  if (code === "TN") return Math.min(300000, Math.max(30000, Math.max(1, members) * 5000));
  return STATE_FEES[code]?.feeCents || 0;
}

function int(v, lo, hi, dflt) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

// Server quote. Input is the order draft the customer submitted (choices only; any prices or
// totals in it are ignored). Returns null when the state is unknown.
export function serverQuote(draft) {
  const d = draft && typeof draft === "object" ? draft : {};
  const code = String(d.stateCode || "");
  const st = STATE_FEES[code];
  if (!st) return null;
  const members = int(Array.isArray(d.members) ? d.members.length : 1, 1, 50, 1);
  const oaPages = int(d.oaPages, PRICES.oaFree, PRICES.oaMax, PRICES.oaFree);
  const lines = [[st.name + " state filing fee", stateFee(code, members)]];
  if (d.expedited === true) {
    lines.push([st.name + " state expedite", st.expediteCents]);
    lines.push(["Expedite handling", PRICES.expSvc]);
  }
  if (d.ein === true) lines.push(["EIN assistance", PRICES.ein]);
  const oa = Math.max(0, oaPages - PRICES.oaFree) * PRICES.oaPage;
  if (oa) lines.push(["Extra OA pages", oa]);
  if (d.reminders === true) lines.push(["Reminders (year 1)", PRICES.reminders]);
  if (d.command === true) lines.push(["Command desk (first month)", PRICES.command]);
  if (d.website === true) lines.push(["Website (first month)", PRICES.website]);
  const items = lines.filter(([, c]) => c > 0).map(([name, amount]) => ({ name, amount }));
  const total = items.reduce((a, i) => a + i.amount, 0);
  return { stateCode: code, stateName: st.name, currency: "usd", items, total };
}
