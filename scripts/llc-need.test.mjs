// "Do I need an LLC?" verdict: rules JSON shape, sources on every line, verdict selection, hand-off, copy rules.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../llc-name-check/llc-name-check.js", import.meta.url), "utf8");
const ctx = { URLSearchParams, console };
vm.runInNewContext(src, ctx);
const L = ctx.LNC;
const rawRules = JSON.parse(readFileSync(new URL("../llc-name-check/llc-need-rules.json", import.meta.url), "utf8"));
const rules = L.normalizeNeedRules(rawRules);
const cfg = L.normalizeConfig(JSON.parse(readFileSync(new URL("../llc-name-check/llc-states.json", import.meta.url), "utf8")));
cfg.need = rules;
const v = (a) => L.evaluateNeed(rules, a);
const ids = (list) => [...list].map((x) => x.id);

test("every reason, fact and benefit in the JSON has a known https source (nothing dropped)", () => {
  const keys = Object.keys(rawRules.sources);
  for (const k of keys) assert.match(rawRules.sources[k].url, /^https:\/\/www\.(irs|sba)\.gov\//, k);
  const all = [];
  for (const vd of rawRules.verdicts) { all.push(...(vd.facts || []), ...Object.values(vd.reasons || {})); }
  all.push(...rawRules.benefits);
  for (const x of all) { assert.ok(x.sources?.length, x.text); for (const s of x.sources) assert.ok(keys.includes(s), `${s} in ${x.text}`); }
  const shown = rules.verdicts.reduce((n, x) => n + x.facts.length + Object.keys(x.reasons).length, 0) + rules.benefits.length;
  assert.equal(shown, all.length);
});

test("an entry without a source is dropped", () => {
  const r = L.normalizeNeedRules({ sources: { a: { title: "A", url: "https://www.irs.gov/x" } }, verdicts: [{ id: "operate", title: "T", default: true, facts: [{ text: "ok", sources: ["a"] }, { text: "no source" }, { text: "bad key", sources: ["zz"] }] }] });
  assert.equal(r.verdicts[0].facts.length, 1);
  assert.throws(() => L.normalizeNeedRules({ verdicts: [{ id: "x", title: "X" }] }));
});

test("no answers / sole owner with nothing else: (a) You don't need an LLC to operate", () => {
  const r = v({});
  assert.equal(r.id, "operate");
  assert.equal(r.title, "You don't need an LLC to operate");
  const t = [...r.facts].map((f) => f.text).join(" ");
  assert.match(t, /sole proprietorship/); assert.match(t, /DBA/); assert.match(t, /Licenses and permits/);
  assert.equal(r.benefits.length, 0);
});

test("(b) better off: benefits follow the answers", () => {
  const sep = v({ separate: true });
  assert.equal(sep.id, "better");
  assert.equal(sep.title, "You don't need one, but you may be better off with one");
  assert.deepEqual(ids(sep.benefits), ["liability", "taxes", "scorp"]);
  const bank = v({ bank: true });
  assert.equal(bank.id, "better");
  assert.deepEqual(ids(bank.benefits), ["taxes", "scorp", "credibility", "bank"]);
  const online = v({ online: true });
  assert.deepEqual(ids(online.benefits), ["taxes", "scorp", "credibility", "bank"]);
  assert.equal(v({ hire: true }).id, "better");
  assert.equal(v({ markets: true }).id, "better");
});

test("(c) likely should: more than one owner, investors, liability exposure, food/regulated goods", () => {
  for (const k of ["owners", "investors", "liability", "food"]) {
    const r = v({ [k]: true });
    assert.equal(r.id, "should", k);
    assert.equal(r.title, "You likely should form one");
    assert.deepEqual(ids(r.reasons), [k]);
    assert.ok(r.benefits.length >= 2);
  }
  assert.deepEqual(ids(v({ liability: true }).benefits), ["taxes", "scorp"]);
  const both = v({ owners: true, separate: true, bank: true });
  assert.equal(both.id, "should");
  assert.deepEqual(ids(both.benefits), ["liability", "taxes", "scorp", "credibility", "bank"]);
});

test("rendered verdict: sources linked, disclaimer, hand-off to name check and filing CTA", () => {
  const MI = cfg.states.MI;
  const op = L.needCardHtml(cfg, MI, "", {});
  assert.match(op, /data-verdict="operate"/);
  assert.match(op, /id="lnc-need-name"/);
  assert.doesNotMatch(op, /lnc-need-cta/);
  assert.match(op, /Not a licensed attorney\. Not legal advice\./);
  assert.match(op, /href="https:\/\/www\.sba\.gov\//);
  const sh = L.needCardHtml(cfg, MI, "Zephyr Bakery LLC", { owners: true });
  assert.match(sh, /id="lnc-need-cta" href="\/#\/form\?state=MI&amp;name=Zephyr%20Bakery%20LLC&amp;src=llc-name-check">File it free, pay only the Michigan fee of \$50</);
  const noState = L.needCardHtml(cfg, null, "", { investors: true });
  assert.match(noState, /href="\/#\/form\?src=llc-need">File it free, pay only the state fee</);
  const stOnly = L.needCardHtml(cfg, cfg.states.NM, "", { liability: true });
  assert.match(stOnly, /href="\/#\/form\?state=NM&amp;src=llc-need">File it free, pay only the state fee</);
});

test("name-check result card carries the verdict once there is a Yes answer", () => {
  const MI = cfg.states.MI;
  const r = L.checkName("Zephyr Bakery", MI);
  assert.match(L.resultHtml(cfg, MI, r, { owners: true }), /id="lnc-need" data-verdict="should"/);
  assert.match(L.resultHtml(cfg, MI, r, {}), /id="lnc-need-hint"/);
  const noRules = { ...cfg, need: null };
  assert.doesNotMatch(L.resultHtml(noRules, MI, r, { owners: true }), /lnc-need/);
});

test("questions: existing five plus liability, bank, separate, investors; share URL round-trip with view=need", () => {
  const qs = L.questionsOf(cfg);
  assert.deepEqual([...qs].map((x) => x[0]), ["online", "markets", "hire", "owners", "food", "liability", "bank", "separate", "investors"]);
  const q = L.shareQuery("", "", { investors: true, bank: true, online: false }, { view: "need" });
  assert.equal(q, "investors=1&bank=1&view=need");
  const back = L.parseQuery("?" + q, qs);
  assert.equal(back.view, "need");
  assert.equal(back.answers.investors, true);
  assert.equal(back.answers.bank, true);
  assert.equal(back.answers.owners, false);
});

test("copy rules: no 'honest', disclaimer present, no negative framing about us", () => {
  const text = JSON.stringify(rawRules);
  assert.doesNotMatch(text, /honest/i);
  assert.match(rawRules.disclaimer, /Not a licensed attorney\. Not legal advice\.$/);
  assert.doesNotMatch(text, /\bwe (won't|can't|don't|do not|cannot)\b/i);
});
