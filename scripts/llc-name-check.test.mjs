// Free LLC Name Check: rule engine, config loader shape, share URL, CTA hand-off. No network.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../llc-name-check/llc-name-check.js", import.meta.url), "utf8");
const ctx = { URLSearchParams, URL, console };
vm.runInNewContext(src, ctx);
const L = ctx.LNC;
const raw = JSON.parse(readFileSync(new URL("../llc-name-check/llc-states.json", import.meta.url), "utf8"));
const cfg = L.normalizeConfig(raw);
const S = (c) => cfg.states[c];

test("bundled config: 51 jurisdictions, fees on, publication NY/AZ/NE", () => {
  assert.equal(cfg.codes.length, 51);
  assert.ok(cfg.states.DC && cfg.states.WY);
  assert.equal(cfg.feesHidden, false);
  assert.deepEqual([...cfg.codes.filter((c) => S(c).publication)].sort(), ["AZ", "NE", "NY"]);
  // Free Tools' bare-array format is accepted too; rows decide.
  const bare = L.normalizeConfig(raw.states);
  assert.equal(bare.codes.length, 51);
  assert.equal(bare.feesHidden, false);
  assert.equal(L.normalizeConfig({ states: raw.states.slice(0, 10) }), null);
  assert.equal(L.normalizeConfig("nope"), null);
});

test("designator present, missing, in the middle", () => {
  for (const n of ["Zephyr Bakery LLC", "Zephyr Bakery, L.L.C.", "Zephyr Bakery Limited Liability Company", "zephyr bakery llc", "Zephyr Bakery L.C."]) {
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
  assert.ok(inc.removed.some((x) => x.word === "Inc." || x.word === "Inc"));
  assert.ok(!inc.hits.some((h) => h.kind === "blocked")); // N6: removed note only, no red row
});

test("restricted words: approval vs blocked vs license", () => {
  const r = L.checkName("First Community Bank & Trust Insurance LLC", S("NY"));
  const kinds = Object.fromEntries(r.hits.map((h) => [h.word.toLowerCase(), h.kind]));
  assert.equal(kinds.bank, "approval");
  assert.equal(kinds.trust, "approval");
  assert.equal(kinds.insurance, "approval");
  const c = L.checkName("Acme Corp LLC", S("CA"));
  assert.ok(c.removed.some((x) => x.word === "Corp"));
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

test("per-row fees: verified rows show $ and CTA amount; NM shows fee + confirm note; kill switch hides all", () => {
  const mi = L.resultHtml(cfg, S("MI"), L.checkName("Zephyr Bakery", S("MI")), {});
  assert.equal(L.ctaLabel(cfg, S("MI")), "File it free, pay only the Michigan fee of $50");
  assert.match(mi, /id="lnc-fee">\$50</);
  assert.match(mi, /Yearly cost to keep it active/);
  assert.doesNotMatch(mi, /data-confirm/);
  const nm = L.resultHtml(cfg, S("NM"), L.checkName("Zia Goods", S("NM")), {});
  assert.equal(L.ctaLabel(cfg, S("NM")), "File it free, pay only the state fee");
  assert.match(nm, /id="lnc-fee">\$50</);
  assert.match(nm, /Confirm on the official site\. <a [^>]*href="https:/);
  const ca = L.resultHtml(cfg, S("CA"), L.checkName("Golden Bakery", S("CA")), {});
  assert.match(ca, /id="lnc-yearly"><span class="lnc-price">\$810</);
  assert.match(ca, /id="lnc-mintax"><span class="lnc-price">\$800</);
  const ri = L.resultHtml(cfg, S("RI"), L.checkName("Ocean Goods", S("RI")), {});
  assert.match(ri, /id="lnc-yearly"><span class="lnc-price">\$450</);
  assert.match(ri, /id="lnc-mintax"><span class="lnc-price">\$400</);
  assert.doesNotMatch(mi, /lnc-mintax/);
  const off = L.normalizeConfig({ ...raw, feesVerified: false });
  const hid = L.resultHtml(off, off.states.CA, L.checkName("Golden Bakery", off.states.CA), {});
  assert.match(hid, /See state site/);
  assert.doesNotMatch(hid, /\$\d/);
  assert.equal(L.ctaLabel(off, off.states.MI), "File it free, pay only the state fee");
  assert.match(L.resultHtml(cfg, S("NY"), L.checkName("Empire Goods", S("NY")), {}), /2 newspapers for 6 weeks/);
  assert.equal(L.stripMoney("$150 list + $200 license, end of anniversary month"), "list + license, end of anniversary month");
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

test("search core drops corporate endings; no-report rows read cleanly", () => {
  assert.equal(L.checkName("Sunshine Corp", S("FL")).core, "SUNSHINE");
  assert.match(L.resultHtml(cfg, S("AZ"), L.checkName("Desert Bloom", S("AZ")), {}), /Arizona LLCs file no annual report/);
});

// ---------- llc-preview-2 round ----------
test("N2: official-link allowlist parses the host", () => {
  for (const u of ["https://x.gov:pw@evil.com/", "https://x.gov@evil.com/", "https://evil.us/", "https://sos.ca.gov:8443/", "http://sos.ca.gov/", "https://evil.com/?x=.gov", "https://evil.com#.gov", "javascript:alert(1)", "https://sos.ca.gov.evil.com/", "https://mi.us/"])
    assert.equal(L.isOfficialUrl(u), false, u);
  for (const u of ["https://bizfileonline.sos.ca.gov/search/business", "https://arc-sos.state.al.us/", "https://www.sos.state.tx.us/", "https://search.sunbiz.org/x", "https://www.njportal.com/DOR/", "https://boss.dc.gov/"])
    assert.equal(L.isOfficialUrl(u), true, u);
  assert.equal(L.validateConfig(raw.states).length, 0);
  const evil = JSON.parse(JSON.stringify(raw)); evil.states[0].search_url = "https://x.gov:pw@evil.com/";
  assert.equal(L.normalizeConfig(evil, { strict: true }), null);
});

test("N3/N4 + Opti: foreign endings are replaced as a whole phrase", () => {
  for (const c of ["NY", "PA", "MI", "TX", "FL", "DE"]) {
    for (const n of ["Empire Ltd. Liability Co.", "Empire Limited Liability Co."]) {
      const r = L.checkName(n, S(c));
      assert.equal(r.legalName, "Empire LLC", c + " " + n);
      assert.ok(r.removed.some((x) => /Liability Co/.test(x.word)), c + " note");
    }
  }
  for (const c of ["CA", "NY", "FL", "DE"]) {
    assert.equal(L.checkName("Empire LC", S(c)).legalName, "Empire LLC", c + " LC");
    assert.equal(L.checkName("Empire L.C.", S(c)).legalName, "Empire LLC", c + " L.C.");
  }
  // Kept where the statute allows it (MI MCL 450.4204, TX BOC 5.056, CA 2 CCR 21000).
  assert.equal(L.checkName("Golden LC", S("MI")).legalName, "Golden LC");
  assert.equal(L.checkName("Lone Star L.C.", S("TX")).legalName, "Lone Star L.C.");
  assert.equal(L.checkName("Golden Ltd. Liability Co.", S("CA")).legalName, "Golden Ltd. Liability Co.");
  assert.equal(L.checkName("Empire Limited Company", S("NY")).legalName, "Empire LLC");
  assert.equal(L.checkName("Empire Limited Liability Co. LLC", S("NY")).legalName, "Empire LLC");
  assert.equal(L.checkName("Empire LC LLC", S("NY")).legalName, "Empire LLC");
});

test("N5: commas do not trigger 'Symbols removed', no double period", () => {
  const r = L.checkName("Sweet Mae's Bakery, L.L.C.", S("MI"));
  assert.equal(r.removed.length, 0);
  assert.equal(r.legalName, "Sweet Mae's Bakery L.L.C.");
  const h = L.resultHtml(cfg, S("MI"), L.checkName("Golden Coast, Inc., LLC", S("MI")), {});
  assert.ok(!/Symbols removed/.test(h));
  assert.ok(!/L\.L\.C\.<\/strong>\./.test(L.resultHtml(cfg, S("MI"), L.checkName("Zephyr Inc L.L.C.", S("MI")), {})));
  assert.ok(L.checkName("Zap 🚀 Shop", S("MI")).removed.some((x) => x.word === "symbols"));
});

test("N6: removed corp word shows once, as typed", () => {
  const r = L.checkName("Golden Corp", S("CA"));
  assert.equal(r.legalName, "Golden LLC");
  assert.equal(r.hits.filter((x) => x.kind === "blocked").length, 0);
  const h = L.resultHtml(cfg, S("CA"), r, {});
  assert.ok(/Removed "Corp"/.test(h));
  assert.ok(!/Corporation": Leave it out/.test(h));
  assert.ok(/Removed "Inc"/.test(L.resultHtml(cfg, S("CA"), L.checkName("Golden Coast Inc", S("CA")), {})));
});

test("N7: New Mexico annual row", () => {
  const h = L.resultHtml(cfg, S("NM"), L.checkName("Mesa LLC", S("NM")), {});
  assert.ok(/\$0, no annual report/.test(h));
  assert.ok(!/id="lnc-annual">None</.test(h));
});

test("N8: 500 characters are counted as 500", () => {
  const r = L.checkName("A".repeat(500), S("MI"));
  assert.ok(/Yours is 500\./.test(r.errors[0]), r.errors[0]);
  assert.equal(L.parseQuery("name=" + "b".repeat(700)).name.length, 700);
});

test("approval words are listed for the wizard", () => {
  const r = L.checkName("Harbor Bank", S("CA"));
  assert.equal(JSON.stringify(r.needsApproval), '["bank"]');
  assert.equal(r.blocked, false);
  assert.equal(L.checkName("Federal Street Bakery", S("CA")).blocked, true);
});

// ---------- wizard (index.html) uses the same engine (N9) ----------
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const pick = (re) => { const m = re.exec(html); assert.ok(m, String(re)); return m[0]; };
const wiz = { window: { LNC: L }, draft: { nameAck: "" }, BY: Object.fromEntries(cfg.codes.map((c) => [c, { name: S(c).name }])),
  esc: (s) => String(s).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";") };
vm.runInNewContext(pick(/const LLC_ENDINGS = .*;/) + "\n" + pick(/const CORP_WORDS = .*;/) + "\n" +
  html.slice(html.indexOf("const COMMON_RESTRICTED"), html.indexOf("function canNext()")) +
  "\nthis.nameIssue = nameIssue; this.needsAck = needsAck; this.approvalHtml = approvalHtml;", wiz);

test("N9: wizard name step matches the checker", () => {
  assert.equal(wiz.nameIssue("Zephyr Bakery LLC", "MI"), "");
  assert.match(wiz.nameIssue("Federal Street Bakery LLC", "CA"), /Take out "Federal"/);
  assert.match(wiz.nameIssue("Zap 🚀 Shop LLC", "CA"), /emoji/);
  assert.match(wiz.nameIssue("Empire Limited Liability Co. LLC", "NY"), /Use one LLC ending. Try: Empire LLC/);
  assert.match(wiz.nameIssue("Empire Ltd. Liability Co.", "NY"), /Take out "Ltd. Liability Co."/);
  assert.match(wiz.nameIssue("Empire LC", "NY"), /Take out "LC".*Empire LLC/);
  assert.equal(wiz.nameIssue("Golden LC", "MI"), "");
  assert.ok(!/\.\.$/.test(wiz.nameIssue("Zephyr", "NY")), wiz.nameIssue("Zephyr", "NY"));
});

test("Opti: approval words need an acknowledgment in the wizard", () => {
  for (const w of ["Bank", "Bancorp", "Insurance", "Trust", "Engineer", "Olympic", "University", "Attorney"]) {
    const n = `Harbor ${w} LLC`;
    wiz.draft.nameAck = "";
    assert.equal(wiz.nameIssue(n, "CA"), "", n);
    assert.equal(wiz.needsAck(n, "CA"), true, n);
    assert.match(wiz.approvalHtml(n, "CA"), /id="name-ack"/);
    wiz.draft.nameAck = n;
    assert.equal(wiz.needsAck(n, "CA"), false, n);
    assert.equal(wiz.needsAck(n + " Two", "CA"), true, "ack resets when the name changes");
  }
  assert.equal(wiz.needsAck("Harbor Bakery LLC", "CA"), false);
  assert.equal(wiz.approvalHtml("Harbor Bakery LLC", "CA"), "");
});

test("pages: H1/FAQ copy, trailing-slash links, CSS fixes", () => {
  const page = readFileSync(new URL("../llc-name-check/index.html", import.meta.url), "utf8");
  assert.match(page, /<h1>Free LLC Name Check/);
  assert.match(page, /<title>Free LLC Name Check/);
  assert.match(page, /<h2>Free LLC Name Check FAQ<\/h2>/);
  assert.match(page, /<h3>Do I need an LLC\?<\/h3>/);
  assert.match(page, /"name": "Do I need an LLC\?"/);
  assert.match(page, /overflow-wrap:anywhere/);
  assert.ok(!/honest/i.test(page));
  for (const f of [page, html]) assert.ok(!/href="\/llc-name-check"/.test(f));
  assert.match(html, /input,select,textarea\{height:2\.75rem;min-height:44px/);
  assert.ok(!/<main class="wrap" style="padding:2\.4rem 0/.test(html));
  assert.equal(S("DC").searchUrl, "https://boss.dc.gov/");
});
