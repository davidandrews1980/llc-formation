// Free Tools test report llc-preview-1: H1 (flagged word changes the result), H2/M2 (per-state endings),
// M1 (biennial fees), M7 (search term), M8 (runtime config validation), plus wizard and SEO checks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const ctx = { URLSearchParams, URL, console };
vm.runInNewContext(read("llc-name-check/llc-name-check.js"), ctx);
const L = ctx.LNC;
const raw = JSON.parse(read("llc-name-check/llc-states.json"));
const cfg = L.normalizeConfig(raw);
const S = (c) => cfg.states[c];
const check = (c, n) => L.checkName(n, S(c));
const html = (c, n, a = {}) => L.resultHtml(cfg, S(c), check(c, n), a);

test("#1 a flagged corporate word is removed from the filed name and the CTA", () => {
  const r = check("CA", "Golden Coast Inc LLC");
  assert.equal(r.legalName, "Golden Coast LLC");
  assert.deepEqual([...r.removed].map((x) => x.word), ["Inc"]);
  const h = html("CA", "Golden Coast Inc LLC");
  assert.match(h, /id="lnc-cta" href="\/#\/form\?state=CA&amp;name=Golden%20Coast%20LLC&amp;/);
  assert.match(h, /data-rule="removed" data-word="inc"/);
  assert.equal(check("MI", "Incorporated Ideas LLC").legalName, "Ideas LLC");
  assert.equal(check("MI", "Acme Corp. Holdings LLC").legalName, "Acme Holdings LLC");
});

test("#1 a 'leave it out' government word holds the CTA until the name is edited", () => {
  const h = html("NY", "Federal Street Bakery LLC");
  assert.match(h, /id="lnc-cta" aria-disabled="true" data-blocked="1">Edit the name to continue/);
  assert.doesNotMatch(h, /href="\/#\/form/);
});

test("#1 the wizard rejects corporate words, < >, and names without an allowed ending", () => {
  const src = read("index.html");
  const LLC_ENDINGS = JSON.parse(src.match(/const LLC_ENDINGS = (.*);\n/)[1]);
  const body = src.slice(src.indexOf("const CORP_WORDS = "), src.indexOf("function canNext()"));
  const BY = { CA: { name: "California" }, MI: { name: "Michigan" }, TX: { name: "Texas" }, NY: { name: "New York" } };
  const nameIssue = new Function("LLC_ENDINGS", "BY", "window", body + "return nameIssue;")(LLC_ENDINGS, BY, {});
  assert.match(nameIssue("Golden Coast Inc LLC", "CA"), /Take out "Inc"/);
  assert.match(nameIssue("Acme <b> LLC", "CA"), /< and >/);
  assert.match(nameIssue("Golden Coast", "CA"), /End the name with an LLC ending/);
  assert.match(nameIssue("Empire Limited Company", "NY"), /End the name/);
  assert.equal(nameIssue("Golden Coast LLC", "CA"), "");
  assert.equal(nameIssue("Golden L.C.", "MI"), "");
  assert.equal(nameIssue("Lone Star LC", "TX"), "");
  // wizard endings are the JSON's endings
  for (const r of raw.states) assert.deepEqual(LLC_ENDINGS[r.code], r.allowed_endings, r.code);
});

test("#2 allowed_endings: every verified row has a cite and an official source; others use the generic three", () => {
  const verified = raw.states.filter((r) => r.allowed_endings_verified);
  assert.ok(verified.length >= 31, `verified ${verified.length}`);
  for (const r of verified) { assert.ok(r.allowed_endings_cite, r.code); assert.ok(L.isOfficialUrl(r.allowed_endings_source), r.code); }
  for (const r of raw.states.filter((x) => !x.allowed_endings_verified)) assert.deepEqual(r.allowed_endings, ["Limited Liability Company", "LLC", "L.L.C."], r.code);
  assert.deepEqual(raw.states.find((r) => r.code === "NY").allowed_endings, ["Limited Liability Company", "LLC", "L.L.C."]);
});

test("#2 valid local endings get no second ending; invalid ones are replaced", () => {
  assert.equal(check("MI", "Golden L.C.").legalName, "Golden L.C.");
  assert.equal(check("MI", "Golden LC").addDesignator, false);
  assert.equal(check("TX", "Lone Star LC").legalName, "Lone Star LC");
  assert.equal(check("TX", "Lone Star Limited Company").addDesignator, false);
  assert.equal(check("NY", "Empire Limited Company").legalName, "Empire LLC");
  assert.equal(check("NY", "Empire Ltd. Liability Co.").addDesignator, true);
  assert.equal(check("CA", "Golden Limited Company").addDesignator, true);
  assert.equal(check("CO", "Rocky Ltd.").legalName, "Rocky Ltd.");
  const dup = check("MI", "Sweet Maes Bakery LLC LLC");
  assert.equal(dup.legalName, "Sweet Maes Bakery LLC"); assert.equal(dup.duplicateEnding, true); assert.equal(dup.core, "SWEET MAES BAKERY");
  assert.match(html("NY", "Empire LLC"), /data-endings="verified">Accepted endings in New York: Limited Liability Company, LLC, L\.L\.C\./);
  assert.match(html("AL", "Alpha LLC"), /data-endings="generic">[^<]*Confirm on the official site/);
});

test("#3 biennial reports read 'every 2 years' and count half per year", () => {
  for (const c of ["AK", "CA", "DC", "IN", "IA", "KS", "NE", "NY"]) assert.equal(S(c).everyYears, 2, c);
  const dc = html("DC", "Test Name LLC");
  assert.match(dc, /id="lnc-annual">[^<]*\$300/);
  assert.match(dc, /id="lnc-yearly"><span class="lnc-price">\$150<\/span> a year/);
  assert.match(html("NY", "Empire LLC"), /id="lnc-yearly"><span class="lnc-price">\$4\.50</);
  assert.match(html("CA", "Golden LLC"), /id="lnc-yearly"><span class="lnc-price">\$810</);
  assert.doesNotMatch(html("CA", "Golden LLC"), /every 2 years · \$20 every 2 years/);
  assert.match(html("MI", "Zephyr LLC"), /id="lnc-yearly"><span class="lnc-price">\$25<\/span> a year<\/dd>/);
});

test("#9 search term keeps apostrophes' letters, transliterates accents, turns & into AND once", () => {
  assert.equal(check("MI", "Sweet Mae's Bakery").core, "SWEET MAES BAKERY");
  assert.equal(check("MI", "Sweet Mae’s Bakery").core, "SWEET MAES BAKERY");
  const r = check("MI", "Café ☕ Ñandú™ & Sons 🚀 Co.");
  assert.equal(r.core, "CAFE NANDU AND SONS");
  assert.equal(r.legalName, "Café Ñandú & Sons LLC");
  assert.ok(r.removed.some((x) => x.word === "Co."));
  assert.equal(check("MI", "Rock & Roll & Co LLC").core.split(" AND ").length, 3);
});

test("#10 runtime config: only official links; a remote file with any other link is rejected", () => {
  assert.deepEqual([...L.validateConfig(raw.states)], []);
  assert.equal(L.isOfficialUrl("https://www.sos.state.tx.us/corp/sosda/index.shtml"), true);
  assert.equal(L.isOfficialUrl("https://search.sunbiz.org/Inquiry"), true);
  assert.equal(L.isOfficialUrl("https://evil.example.com/x"), false);
  assert.equal(L.isOfficialUrl("https://gov.evil.com/x"), false);
  assert.equal(L.isOfficialUrl("http://www.sos.ca.gov/"), false);
  const bad = JSON.parse(JSON.stringify(raw)); bad.states[3].search_url = "https://evil.example.com/search";
  assert.equal(L.normalizeConfig(bad, { strict: true }), null);
  assert.ok(L.normalizeConfig(bad)); // non-strict (bundled) still loads, but drops the link:
  assert.equal(L.normalizeConfig(bad).states[bad.states[3].code].searchUrl, "");
  const rules = JSON.parse(read("llc-name-check/llc-need-rules.json"));
  rules.sources.sba_bank.url = "https://example.com/";
  assert.throws(() => L.normalizeNeedRules(rules, { strict: true }));
});

test("#10 loadConfig falls back to the bundled copy when the remote file fails validation", async () => {
  const bad = JSON.parse(JSON.stringify(raw)); bad.states[0].source_url = "https://example.com/";
  const c2 = { URLSearchParams, URL, console, LNC_CONFIG_URL: "https://remote/x.json", LNC_NEED_RULES_URL: "https://remote/n.json", setTimeout, clearTimeout, AbortController,
    fetch: async (u) => ({ ok: true, json: async () => (u.startsWith("https://remote/x") ? bad : u.includes("need") ? JSON.parse(read("llc-name-check/llc-need-rules.json")) : raw) }) };
  vm.runInNewContext(read("llc-name-check/llc-name-check.js"), c2);
  const loaded = await c2.LNC.loadConfig();
  assert.equal(loaded.loadedFrom, "/llc-name-check/llc-states.json");
});

test("low: 200-char limit message, 'The LLC', emoji and < > out of the hand-off, AZ publication", () => {
  assert.match(check("MI", "x".repeat(250)).errors[0], /limited to 200 characters/);
  assert.match(check("MI", "The LLC").errors[0], /"The" on its own/);
  const x = check("MI", "<b>Zap</b> 🚀 Shop™");
  assert.doesNotMatch(x.legalName, /[<>🚀™]/u);
  assert.match(html("AZ", "Desert LLC"), /<strong>Required unless waived\.<\/strong>/);
  assert.match(html("TX", "Lone Star LLC"), /href="https:\/\/www\.sos\.state\.tx\.us\/corp\/sosda\/index\.shtml"/);
  assert.match(html("NY", "Empire LLC"), /Common restricted words clear\.<\/strong>[^<]*New York may restrict other words/);
});

test("SEO: canonical and sitemap use the trailing slash; FAQ JSON-LD matches the visible FAQ word for word", () => {
  const page = read("llc-name-check/index.html");
  assert.match(page, /<link rel="canonical" href="https:\/\/pathwaydevs\.software\/llc-name-check\/"\/>/);
  assert.match(read("sitemap.xml"), /<loc>https:\/\/pathwaydevs\.software\/llc-name-check\/<\/loc>/);
  assert.match(page, /<h1>Free LLC Name Check: test your name against state rules<\/h1>/);
  const desc = "Check your LLC name against state rules, see the fees, and open the official state search.";
  assert.ok(page.includes(`<meta name="description" content="${desc}"/>`));
  assert.ok(page.includes(`<meta property="og:description" content="${desc}"/>`));
  assert.ok(page.includes(`"description":"${desc}"`));
  assert.doesNotMatch(page.match(/<head>[\s\S]*?<\/head>/)[0].replace(/"@type":"FAQPage"[\s\S]*$/, ""), /is available/i);
  const ld = JSON.parse(page.match(/<script type="application\/ld\+json">\n(\{"@context":"https:\/\/schema.org","@type":"FAQPage"[\s\S]*?)\n<\/script>/)[1]);
  const sec = page.match(/<section class="faq" id="faq">([\s\S]*?)<\/section>/)[1];
  const txt = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  const vis = [...sec.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => [txt(m[1]), txt(m[2])]);
  assert.equal(vis.length, 11);
  assert.deepEqual(ld.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), vis);
});
