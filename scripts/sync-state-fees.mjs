// One source of truth for state fees: llc-name-check/llc-states.json.
// Writes its filing fees into the Formation wizard table (index.html STATES.feeCents), the server quote
// (netlify/lib/pricing.mjs STATE_FEES.feeCents), and the wizard's ongoing cost (STATES.annualCents =
// typical_yearly_cost_usd). scripts/state-fees-parity.test.mjs fails if any of them drift.
// Usage: node scripts/sync-state-fees.mjs        (rewrite files)
//        node scripts/sync-state-fees.mjs --check (exit 1 if a rewrite is needed)
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const cfg = JSON.parse(readFileSync(new URL("llc-name-check/llc-states.json", root), "utf8"));
const rows = Array.isArray(cfg) ? cfg : cfg.states;
const cents = (usd) => Math.round(Number(usd) * 100);

// The wizard shows annualCents next to its cadence ("$9 biennial"). For a report due every 2 years with no
// yearly tax, that is the per-filing fee; otherwise it is the yearly cost (typical_yearly_cost_usd).
export function wizardAnnualUsd(r) {
  if (r.annual_report_every_years === 2 && !r.min_annual_tax_usd && typeof r.annual_report_fee_usd === "number") return r.annual_report_fee_usd;
  return typeof r.typical_yearly_cost_usd === "number" ? r.typical_yearly_cost_usd : null;
}
export function syncIndex(html) {
  for (const r of rows) {
    if (typeof r.filing_fee_usd !== "number") throw new Error(`${r.code}: filing_fee_usd missing`);
    const obj = new RegExp(`(\\{"code": "${r.code}", [^}]*?"feeCents": )\\d+`);
    if (!obj.test(html)) throw new Error(`${r.code}: not found in index.html STATES`);
    html = html.replace(obj, `$1${cents(r.filing_fee_usd)}`);
    const ongoing = wizardAnnualUsd(r);
    if (ongoing != null) {
      html = html.replace(new RegExp(`(\\{"code": "${r.code}", [^}]*?"annualCents": )\\d+`), `$1${cents(ongoing)}`);
    }
  }
  // Allowed endings for the wizard's name check (same list the Free LLC Name Check uses).
  const endings = Object.fromEntries(rows.map((r) => [r.code, r.allowed_endings]));
  const line = /const LLC_ENDINGS = .*;\n/;
  if (!line.test(html)) throw new Error("index.html: const LLC_ENDINGS line not found");
  html = html.replace(line, `const LLC_ENDINGS = ${JSON.stringify(endings)};\n`);
  return html;
}
export function syncPricing(src) {
  for (const r of rows) {
    const re = new RegExp(`(\\b${r.code}: \\{ name: "[^"]+", feeCents: )\\d+`);
    if (!re.test(src)) throw new Error(`${r.code}: not found in pricing.mjs`);
    src = src.replace(re, `$1${cents(r.filing_fee_usd)}`);
  }
  return src;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = [["index.html", syncIndex], ["netlify/lib/pricing.mjs", syncPricing]];
  let changed = 0;
  for (const [f, fn] of files) {
    const url = new URL(f, root);
    const before = readFileSync(url, "utf8");
    const after = fn(before);
    if (after !== before) {
      changed++;
      if (!process.argv.includes("--check")) writeFileSync(url, after);
      console.log((process.argv.includes("--check") ? "out of sync: " : "updated: ") + f);
    }
  }
  if (!changed) console.log("state fees already in sync");
  if (changed && process.argv.includes("--check")) process.exit(1);
}
