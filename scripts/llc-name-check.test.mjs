// Free LLC Name Check: rule engine, config loader shape, share URL, CTA hand-off. No network.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../llc-name-check/llc-name-check.js", import.meta.url), "utf8");
const ctx = { URLSearchParams, console };
vm.runInNewContext(src, ctx);
const L = ctx.LNC;
const raw = JSON.parse(readFileSync(new URL("../llc-name-check/llc-states.json", import.meta.url), "utf8"));
const cfg = L.normalizeConfig(raw);
const S = (c) => cfg.states[c];

test("bundled config: 51 jurisdictions, fees flagged unverified, publication NY/AZ/NE", () => {
  assert.equal(cfg.codes.length, 51);
  assert.ok(cfg.states.DC && cfg.states.WY);
  assert.equal(cfg.feesVerified, false);
  assert.deepEqual([...cfg.codes.filter((c) => S(c).publication)].sort(), ["AZ", "NE", "NY"]);
  // Free Tools' bare-array format is accepted too, and defaults to fees hidden.
  const bare = L.normalizeConfig(raw.states);
  assert.equal(bare.codes.length, 51);
  assert.equal(bare.feesVerified, false);
  assert.equal(L.normalizeConfig({ states: raw.states.slice(0, 10) }), null);
  assert.equal(L.normalizeConfig("nope"), null);
});

test("designator present, missing, in the middle", () => {
  for (const n of ["Zephyr Bakery LLC", "Zephyr Bakery, L.L.C.", "Zephyr Bakery Limited Liability Company", "zephyr bakery llc", "Zephyr Bakery Ltd. Liability Co."]) {
    const r = L.checkName(n, S("MI"));
    assert.equal(r.addDesignator, false, n);
    assert.equal(r.moveDesignator, false, n);
    assert.equal(r.core, "ZEPHYR BAKERY", n);
  }
  const m = L.checkName("Zephyr Bakery", S("MI"));
  assert.equal(m.addDesignator, true);
  assert.equal(m.legalName, "Zephyr Bakery LLC");
  const mid = L.checkName("Zephyr LLC Bakery", S("TX"));
  assert.equal(mid.moveDesignator, true);
  assert.equal(mid.legalName, "Zephyr Bakery LLC");
  const inc = L.checkName("Zephyr Bakery Inc.", S("FL"));
  assert.equal(inc.addDesignator, true);
  assert.equal(inc.legalName, "Zephyr Bakery LLC");
  assert.ok(inc.hits.some((h) => h.word === "Inc" && h.kind === "blocked"));
});

test("restricted words: approval vs blocked vs license", () => {
  const r = L.checkName("First Community Bank & Trust Insurance LLC", S("NY"));
  const kinds = Object.fromEntries(r.hits.map((h) => [h.word.toLowerCase(), h.kind]));
  assert.equal(kinds.bank, "approval");
  assert.equal(kinds.trust, "approval");
  assert.equal(kinds.insurance, "approval");
  const c = L.checkName("Acme Corp LLC", S("CA"));
  assert.ok(c.hits.some((h) => h.word === "Corporation" && h.kind === "blocked"));
  const u = L.checkName("Motor City University Engineering Attorneys LLC", S("MI"));
  const k2 = Object.fromEntries(u.hits.map((h) => [h.word.toLowerCase(), h.kind]));
  assert.equal(k2.university, "approval");
  assert.equal(k2.engineer, "license");
  assert.equal(k2.attorney, "license");
  assert.ok(L.checkName("Federal Olympic Treasury LLC", S("DE")).hits.length === 3);
  assert.equal(L.checkName("Trustworthy Bankside Bakery LLC", S("MI")).hits.length, 0); // whole words only
});

test("distinctness tips", () => {
  const g = L.checkName("Holdings Group LLC", S("WY"));
  assert.ok(g.tips.some((t) => /distinctive word/.test(t)));
  assert.equal(L.checkName("The Zephyr Bakery LLC", S("WY")).core, "ZEPHYR BAKERY");
  assert.equal(L.checkName("LLC", S("WY")).errors.length, 1);
  assert.equal(L.checkName("", S("WY")).errors.length, 1);
});

test("fees hidden while feesVerified is false; shown when true", () => {
  assert.equal(L.ctaLabel(cfg, S("MI")), "File it free, pay only the state fee");
  const html = L.resultHtml(cfg, S("MI"), L.checkName("Zephyr Bakery", S("MI")), {});
  assert.match(html, /See state site/);
  assert.doesNotMatch(html, /\$50\b/);
  const on = L.normalizeConfig({ ...raw, feesVerified: true });
  assert.equal(L.ctaLabel(on, on.states.MI), "File it free, pay only the Michigan fee of $50");
  assert.match(L.resultHtml(on, on.states.MI, L.checkName("Zephyr Bakery", on.states.MI), {}), /\$50/);
  assert.equal(L.stripMoney("$150 list + $200 license, end of anniversary month"), "list + license, end of anniversary month");
  assert.equal(L.stripMoney("Business Privilege Tax return due Apr 15 (min $50)"), "Business Privilege Tax return due Apr 15");
});

test("availability: Florida pre-fills, API templates are never used as links", () => {
  const fl = L.availabilityLink(S("FL"), "ZEPHYR BAKERY");
  assert.equal(fl.prefilled, true);
  assert.equal(fl.url, "https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?inquiryType=EntityName&searchTerm=ZEPHYR%20BAKERY");
  for (const c of ["CO", "CT", "NY", "OR", "PA", "MI", "CA"]) {
    const l = L.availabilityLink(S(c), "ZEPHYR");
    assert.equal(l.prefilled, false, c);
    assert.ok(!/\/resource\//.test(l.url), c);
    assert.ok(l.url.startsWith("https://"), c);
  }
  for (const c of cfg.codes) assert.ok(L.availabilityLink(S(c), "X").url.startsWith("https://"), c);
});

test("likely next list follows answers", () => {
  const keys = (a, c = "MI") => [...L.nextSteps(S(c), a).map((x) => x.k)];
  assert.deepEqual(keys({}), ["local"]);
  assert.ok(keys({ hire: true }).includes("ein") && keys({ hire: true }).includes("employer"));
  assert.ok(keys({ owners: true }).includes("ein") && keys({ owners: true }).includes("oa"));
  assert.ok(keys({ online: true }).includes("salestax"));
  assert.ok(keys({ food: true }).includes("food") && keys({ food: true }).includes("salestax"));
  assert.ok(keys({ markets: true }).includes("local"));
  assert.match(L.nextSteps(S("OR"), { online: true }).find((x) => x.k === "salestax").d, /no statewide sales tax/);
});

test("share URL round-trip and CTA hand-off URL", () => {
  const q = L.shareQuery("MI", "Zephyr & Sons Bakery", { online: true, hire: true });
  const back = L.parseQuery("?" + q);
  assert.equal(back.state, "MI");
  assert.equal(back.name, "Zephyr & Sons Bakery");
  assert.equal(back.answers.online, true);
  assert.equal(back.answers.hire, true);
  assert.equal(back.answers.food, false);
  assert.equal(L.ctaHref(S("MI"), "Zephyr & Sons Bakery LLC"), "/#/form?state=MI&name=Zephyr%20%26%20Sons%20Bakery%20LLC&src=llc-name-check");
});

test("output is escaped", () => {
  const html = L.resultHtml(cfg, S("MI"), L.checkName('<img src=x onerror=alert(1)> Bakery', S("MI")), {});
  assert.doesNotMatch(html, /<img/);
});

test("search core drops corporate endings; 'None' annual rows read cleanly", () => {
  assert.equal(L.checkName("Sunshine Corp", S("FL")).core, "SUNSHINE");
  assert.match(L.resultHtml(cfg, S("AZ"), L.checkName("Desert Bloom", S("AZ")), {}), /None listed for a standard LLC/);
  assert.match(L.resultHtml(cfg, S("SC"), L.checkName("Palmetto Goods", S("SC")), {}), /None listed for a standard LLC/);
});
