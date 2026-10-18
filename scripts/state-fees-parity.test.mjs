// Hard requirement: the Free LLC Name Check, the Formation wizard and the server quote use the same
// state filing fees, all taken from llc-name-check/llc-states.json. Fix drift with: node scripts/sync-state-fees.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { STATE_FEES, serverQuote } from "../netlify/lib/pricing.mjs";
import { syncIndex, syncPricing } from "./sync-state-fees.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const cfgRaw = JSON.parse(read("llc-name-check/llc-states.json"));
const rows = cfgRaw.states;
const html = read("index.html");
const page = {};
vm.runInNewContext([html.match(/const STATES = \[.*\];/)[0], "this.STATES = STATES;"].join("\n"), page);
const BY = Object.fromEntries(page.STATES.map((s) => [s.code, s]));
const lncCtx = { URLSearchParams, console };
vm.runInNewContext(read("llc-name-check/llc-name-check.js"), lncCtx);
const L = lncCtx.LNC;
const cfg = L.normalizeConfig(cfgRaw);
const cents = (usd) => Math.round(usd * 100);

test("config: 51 rows, feesVerified true, NM the only unverified row", () => {
  assert.equal(rows.length, 51);
  assert.equal(cfgRaw.feesVerified, true);
  assert.deepEqual(rows.filter((r) => r.verified !== true).map((r) => r.code), ["NM"]);
});

test("wizard STATES fees === llc-states.json (all 51)", () => {
  assert.equal(page.STATES.length, 51);
  for (const r of rows) {
    assert.ok(BY[r.code], r.code);
    assert.equal(BY[r.code].feeCents, cents(r.filing_fee_usd), `${r.code} filing fee`);
    assert.equal(BY[r.code].annualCents, cents(r.typical_yearly_cost_usd), `${r.code} yearly cost`);
  }
});

test("server quote fees === llc-states.json (all 51)", () => {
  for (const r of rows) {
    assert.equal(STATE_FEES[r.code].feeCents, cents(r.filing_fee_usd), r.code);
    const d = { stateCode: r.code, members: [{}], ein: false, expedited: false, reminders: false, command: false, website: false, oaPages: 3 };
    assert.equal(serverQuote(d).total, cents(r.filing_fee_usd), `${r.code} one-member quote`);
  }
});

test("name-check CTA amount === wizard fee for verified rows; NM gets the generic CTA", () => {
  for (const r of rows) {
    const st = cfg.states[r.code];
    const label = L.ctaLabel(cfg, st);
    if (r.verified) {
      const amt = "$" + (BY[r.code].feeCents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
      assert.equal(label, `File it free, pay only the ${r.state} fee of ${amt}`, r.code);
    } else assert.equal(label, "File it free, pay only the state fee", r.code);
  }
});

test("sync script is a no-op (files already match the JSON)", () => {
  assert.equal(syncIndex(html), html);
  assert.equal(syncPricing(read("netlify/lib/pricing.mjs")), read("netlify/lib/pricing.mjs"));
});
