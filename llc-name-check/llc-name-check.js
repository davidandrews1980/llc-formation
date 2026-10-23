/* Free LLC Name Check (pathwaydevs.software/llc-name-check)
 *
 * - Name rules run here in the browser. Checking a name makes no network request.
 * - Per-state data comes from a JSON config loaded once at page load (see loadConfig and README.md).
 * - Availability is a deep link to the official state registry. Nothing calls state sites from our server.
 *
 * Mount: <div data-llc-name-check data-default-state="MI"></div> plus this script.
 * Per-state pages (e.g. /llc-name-check/michigan/) set data-default-state, or the slug is read from the path.
 * Pure functions are exposed as window.LNC (and module.exports under Node) for tests.
 */
(function (root) {
  "use strict";

  // Where the runtime config comes from, in order. The first one that loads and validates wins.
  // 1) The llc-config branch on GitHub: commit a new llc-name-check/llc-states.json there and it is live
  //    within about 5 minutes (GitHub raw cache). No Netlify build, no production publish.
  // 2) The copy bundled with the site deploy (fallback).
  // A page can override 1) with window.LNC_CONFIG_URL before this script runs (used by tests).
  var REMOTE_CONFIG_URL = "https://raw.githubusercontent.com/davidandrews1980/llc-formation/llc-config/llc-name-check/llc-states.json";
  var BUNDLED_CONFIG_URL = "/llc-name-check/llc-states.json";
  // "Do I need an LLC?" rules load the same way: llc-config branch first, bundled copy as fallback.
  // Override with window.LNC_NEED_RULES_URL (tests).
  var REMOTE_NEED_RULES_URL = "https://raw.githubusercontent.com/davidandrews1980/llc-formation/llc-config/llc-name-check/llc-need-rules.json";
  var BUNDLED_NEED_RULES_URL = "/llc-name-check/llc-need-rules.json";
  var FILING_FLOW_URL = "/#/form";

  // What each restricted word means. Words in the state config that are not listed here still get flagged.
  var WORD_RULES = {
    "bank":         { aliases: ["bank", "banks", "banking", "banker", "bankers", "bancorp"], kind: "approval", who: "the state banking regulator" },
    "trust":        { aliases: ["trust", "trusts", "trustee", "trustees"], kind: "approval", who: "the state banking regulator (when it suggests trust services)" },
    "insurance":    { aliases: ["insurance", "insurer", "insurers", "assurance", "underwriter", "underwriters", "underwriting"], kind: "approval", who: "the state insurance department" },
    "corporation":  { aliases: ["corporation", "corp"], kind: "blocked", why: "It signals a corporation. An LLC name uses an LLC ending instead." },
    "incorporated": { aliases: ["incorporated"], kind: "blocked", why: "It signals a corporation. An LLC name uses an LLC ending instead." },
    "inc":          { aliases: ["inc"], kind: "blocked", why: "It signals a corporation. An LLC name uses an LLC ending instead." },
    "university":   { aliases: ["university", "universities"], kind: "approval", who: "the state education or higher-education authority" },
    "college":      { aliases: ["college", "colleges"], kind: "approval", who: "the state education or higher-education authority" },
    "attorney":     { aliases: ["attorney", "attorneys"], kind: "license", who: "a licensed attorney, usually as a professional LLC (PLLC)" },
    "engineer":     { aliases: ["engineer", "engineers", "engineering"], kind: "license", who: "a licensed engineer, usually as a professional LLC (PLLC)" },
    "fbi":          { aliases: ["fbi"], kind: "government", why: "It suggests a government agency." },
    "treasury":     { aliases: ["treasury"], kind: "government", why: "It suggests a government agency." },
    "federal":      { aliases: ["federal"], kind: "government", why: "It suggests a government connection." },
    "olympic":      { aliases: ["olympic", "olympics", "olympiad"], kind: "protected", why: "Federal law protects it for the U.S. Olympic & Paralympic Committee; use needs written authorization." }
  };
  var KIND_LABEL = { approval: "Needs approval", license: "Needs a professional license", blocked: "Leave it out", government: "Leave it out", protected: "Needs authorization", review: "Check with the state" };
  var GENERIC = ["holdings", "holding", "services", "service", "group", "enterprises", "enterprise", "solutions", "consulting", "ventures", "partners", "company", "co", "management", "investments", "properties", "llc", "and", "of", "the", "business", "global", "international", "usa", "america", "american"];
  // Every LLC ending some state accepts. One that is not valid in the chosen state is removed from the end
  // as a whole phrase ("Ltd. Liability Co.", "LC") and replaced with that state's ending.
  var KNOWN_ENDINGS = ["Limited Liability Company", "Limited-Liability Company", "Limited Liability Co.", "Limited-Liability Co.", "Ltd. Liability Company", "Ltd. Liability Co.", "Limited Company", "Limited Co.", "Ltd. Company", "Ltd. Co.", "LLC", "L.L.C.", "LC", "L.C."];
  var CORP_TAIL = ["inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited"];
  // Used when a state's allowed endings are not verified yet; the card then says to confirm on the official site.
  var GENERIC_ENDINGS = ["Limited Liability Company", "LLC", "L.L.C."];
  // States with no statewide sales tax (local taxes can still apply, e.g. Alaska).
  var NO_STATE_SALES_TAX = ["AK", "DE", "MT", "NH", "OR"];

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function safeHttps(u) { return typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ""; }
  // Official links only: .gov / .us hosts, plus the few state-run domains that use another TLD.
  // Parsed with URL: https only, no user:password@, no port. Allowed: *.gov, *.state.XX.us, and the
  // explicit list below. Bare .us is open registration, so it is not trusted on its own.
  var OFFICIAL_HOSTS = ["sunbiz.org", "njportal.com"];
  function hostOf(u) {
    var p;
    try { p = new URL(String(u || "")); } catch (e) { return ""; }
    if (p.protocol !== "https:" || p.username || p.password || p.port) return "";
    if (/[@\\\s]/.test(String(u).split(/[?#]/)[0].slice(8))) return "";
    return p.hostname.toLowerCase();
  }
  function isOfficialUrl(u) {
    if (typeof u !== "string") return false;
    var h = hostOf(u);
    if (!h || !/^[a-z0-9.-]+$/.test(h)) return false;
    if (/\.gov$/.test(h)) return true;
    if (/(^|\.)state\.[a-z]{2}\.us$/.test(h)) return true;
    return OFFICIAL_HOSTS.some(function (d) { return h === d || h.slice(-(d.length + 1)) === "." + d; });
  }
  function official(u) { return isOfficialUrl(u) ? u : ""; }
  // é -> e, Ñ -> N, and drop anything that is not a letter, digit, space or common name punctuation.
  function ascii(s) {
    s = String(s || "");
    if (s.normalize) s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return s.replace(/[\u00df]/g, "ss").replace(/[\u00e6]/g, "ae").replace(/[\u00c6]/g, "AE").replace(/[\u00f8]/g, "o").replace(/[\u00d8]/g, "O");
  }
  // What goes to the wizard: no emoji, symbols like ™, or < >. Accented letters are kept as typed.
  function cleanForFiling(s) {
    return String(s || "").replace(/[<>]/g, " ").replace(/[\u2122\u00ae\u00a9]/g, " ")
      .replace(/[\u2190-\u2bff\u2600-\u27bf\ufe0f\u200d]|[\ud800-\udbff][\udc00-\udfff]/g, " ")
      .replace(/\s+/g, " ").replace(/\s+([,.])/g, "$1").trim();
  }
  function slugify(name) { return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function money(n) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  var SYMBOLS = /[<>\u2122\u00ae\u00a9\u2190-\u2bff\u2600-\u27bf\ufe0f\u200d]|[\ud800-\udbff][\udc00-\udfff]/;
  // "Name to file: X." without a double period when X ends in "L.L.C."
  function endDot(s) { return /\.$/.test(s) ? "" : "."; }
  function words(name) { return String(name || "").trim().split(/[\s,]+/).filter(Boolean); }

  // ---------- config ----------
  // Accepts the Free Tools format (a bare array of state rows) or the wrapped format
  // { feesVerified, updated, states: [...] }. Returns null when the payload is unusable.
  function deepLinkOf(r) {
    if (r.api_available) return "";
    var t = String(r.deep_link_template || r.deep_link_template_or_null || "");
    return t.indexOf("{name}") > -1 && safeHttps(t.replace("{name}", "NAME")) ? t : "";
  }

  // feesVerified (top level) is a kill switch: false hides every dollar amount. Otherwise each row's
  // `verified` decides: verified rows show the fee and a CTA with the amount; unverified rows show the
  // fee with a "confirm on the official site" note and a generic CTA.
  // Every link in a row must be official (see isOfficialUrl). A remote file with any other link is rejected
  // as a whole and the bundled copy is used instead. Returns the list of problems (empty = valid).
  function validateConfig(list) {
    var bad = [];
    (list || []).forEach(function (r) {
      if (!r || typeof r !== "object") { bad.push("row is not an object"); return; }
      ["search_url", "source_url", "allowed_endings_source", "deep_link_template", "deep_link_template_or_null"].forEach(function (k) {
        if (r[k] && !isOfficialUrl(r[k])) bad.push(r.code + "." + k + ": " + r[k]);
      });
      if (r.allowed_endings != null && (!Array.isArray(r.allowed_endings) || r.allowed_endings.some(function (e) { return typeof e !== "string" || !/^[A-Za-z. -]{2,40}$/.test(e); }))) bad.push(r.code + ".allowed_endings");
    });
    return bad;
  }
  function normalizeConfig(raw, opts) {
    var list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.states) ? raw.states : null);
    if (!list) return null;
    var states = {};
    list.forEach(function (r) {
      if (!r || typeof r !== "object") return;
      var code = String(r.code || "").toUpperCase();
      if (!/^[A-Z]{2}$/.test(code) || !r.state) return;
      states[code] = {
        code: code,
        name: String(r.state),
        slug: r.slug ? String(r.slug) : slugify(r.state),
        fee: num(r.filing_fee_usd),
        verified: r.verified === true,
        annualFee: num(r.annual_report_fee_usd),
        minTax: num(r.min_annual_tax_usd),
        yearly: num(r.typical_yearly_cost_usd),
        publicationNote: r.publication_note ? String(r.publication_note) : "",
        annualDue: r.annual_report_due && !/^none\.?$/i.test(String(r.annual_report_due).trim()) ? String(r.annual_report_due) : null,
        noAnnual: /^none\.?$/i.test(String(r.annual_report_due || "").trim()) && !r.annual_report_fee_usd,
        everyYears: r.annual_report_every_years === 2 ? 2 : 1,
        publicationStatus: r.publication_status ? String(r.publication_status) : "",
        registryNote: r.registry_note ? String(r.registry_note) : "",
        endingsVerified: r.allowed_endings_verified === true && Array.isArray(r.allowed_endings) && r.allowed_endings.length > 0,
        endingsCite: r.allowed_endings_cite ? String(r.allowed_endings_cite) : "",
        endingsSource: official(r.allowed_endings_source),
        restrictedScope: r.restricted_words_scope === "state" ? "state" : "common",
        publication: r.publication_required === true,
        searchUrl: official(r.search_url),
        deepLink: official(deepLinkOf(r)),
        sourceUrl: official(r.source_url) || official(r.search_url),
        designators: (Array.isArray(r.allowed_endings) && r.allowed_endings.length && r.allowed_endings_verified === true) ? r.allowed_endings.map(String) : GENERIC_ENDINGS.slice(),
        restricted: Array.isArray(r.restricted_words) ? r.restricted_words.map(String) : []
      };
    });
    var codes = Object.keys(states);
    if (codes.length < 51) return null;
    if (opts && opts.strict && validateConfig(list).length) return null;
    return {
      feesHidden: !Array.isArray(raw) && raw.feesVerified === false,
      updated: (!Array.isArray(raw) && raw.updated) ? String(raw.updated) : "",
      states: states,
      codes: codes.sort(function (a, b) { return states[a].name.localeCompare(states[b].name); })
    };
  }

  function fetchJson(url, ms) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    return fetch(url, { cache: "no-cache", signal: ctl ? ctl.signal : undefined, credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .finally(function () { if (t) clearTimeout(t); });
  }

  // Filing fees always come from the bundled copy: it is the same file the Formation wizard (index.html
  // STATES) and the server quote (netlify/lib/pricing.mjs) are generated from, so the CTA amount and the
  // amount the wizard quotes can never differ. Everything else (rules, links, annual costs, notes) comes
  // from the remote copy when it loads.
  function withBundledFees(cfg, bundled) {
    if (!bundled) return cfg;
    cfg.codes.forEach(function (c) { if (bundled.states[c]) cfg.states[c].fee = bundled.states[c].fee; });
    return cfg;
  }
  function loadNeedRules() {
    var remoteUrl = root.LNC_NEED_RULES_URL || REMOTE_NEED_RULES_URL;
    var bundledP = fetchJson(BUNDLED_NEED_RULES_URL, 6000).then(normalizeNeedRules, function () { return null; });
    var remoteP = fetchJson(remoteUrl, 3500).then(function (j) { return normalizeNeedRules(j, { strict: true }); }, function () { return null; });
    return Promise.all([remoteP, bundledP]).then(function (both) {
      if (both[0]) { both[0].loadedFrom = remoteUrl; return both[0]; }
      if (both[1]) { both[1].loadedFrom = BUNDLED_NEED_RULES_URL; return both[1]; }
      return null; // the name check still works; the verdict section is left out
    });
  }
  function loadConfig() {
    var remoteUrl = root.LNC_CONFIG_URL || REMOTE_CONFIG_URL;
    var bundledP = fetchJson(BUNDLED_CONFIG_URL, 6000).then(normalizeConfig, function () { return null; });
    var remoteP = fetchJson(remoteUrl, 3500).then(function (j) { return normalizeConfig(j, { strict: true }); }, function () { return null; });
    var needP = loadNeedRules().catch(function () { return null; });
    return Promise.all([remoteP, bundledP, needP]).then(function (both) {
      var remote = both[0], bundled = both[1], cfg;
      if (remote) { remote.loadedFrom = remoteUrl; cfg = withBundledFees(remote, bundled); }
      else if (bundled) { bundled.loadedFrom = BUNDLED_CONFIG_URL; cfg = bundled; }
      else throw new Error("config unavailable");
      cfg.need = both[2];
      return cfg;
    });
  }

  // ---------- "Do I need an LLC?" ----------
  // Pure: rules JSON in, normalized rules out. Any reason, fact or benefit without a known https source is
  // dropped, so every line shown on the page links to where it comes from.
  var QID = /^[a-z][a-z0-9_]{1,23}$/;
  function normalizeNeedRules(raw, opts) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.verdicts)) throw new Error("bad need rules");
    if (opts && opts.strict) Object.keys(raw.sources || {}).forEach(function (k) { if (!isOfficialUrl((raw.sources[k] || {}).url)) throw new Error("need rules: unofficial source " + k); });
    var sources = {};
    Object.keys(raw.sources || {}).forEach(function (k) {
      var s = raw.sources[k];
      if (s && isOfficialUrl(s.url)) sources[k] = { key: k, title: String(s.title || s.url), url: s.url };
    });
    function item(x, id) {
      if (!x || !x.text) return null;
      var src = (Array.isArray(x.sources) ? x.sources : [x.source]).filter(function (k) { return sources[k]; }).map(function (k) { return sources[k]; });
      if (!src.length) return null;
      return { id: id || (x.id ? String(x.id) : ""), title: x.title ? String(x.title) : "", text: String(x.text), sources: src, always: x.always === true, when: Array.isArray(x.when_any) ? x.when_any.map(String) : [] };
    }
    var verdicts = raw.verdicts.map(function (v) {
      var reasons = {};
      Object.keys(v.reasons || {}).forEach(function (k) { var it = item(v.reasons[k], k); if (it) reasons[k] = it; });
      return {
        id: String(v.id), title: String(v.title || ""), intro: v.intro ? String(v.intro) : "",
        when: Array.isArray(v.when_any) ? v.when_any.map(String) : [], isDefault: v.default === true,
        reasons: reasons, facts: (v.facts || []).map(function (f) { return item(f); }).filter(Boolean)
      };
    }).filter(function (v) { return v.id && v.title; });
    if (!verdicts.some(function (v) { return v.isDefault; })) throw new Error("need rules: no default verdict");
    var questions = (raw.questions || []).filter(function (q) { return q && QID.test(String(q.id)) && q.label; }).map(function (q) { return [String(q.id), String(q.label)]; });
    return {
      updated: raw.updated ? String(raw.updated) : "",
      disclaimer: raw.disclaimer ? String(raw.disclaimer) : "Not a licensed attorney. Not legal advice.",
      questions: questions,
      verdicts: verdicts,
      benefitsFor: Array.isArray(raw.benefits_for) ? raw.benefits_for.map(String) : ["better", "should"],
      benefits: (raw.benefits || []).map(function (b) { return item(b); }).filter(Boolean),
      sources: sources
    };
  }
  // Pure: the first verdict whose when_any has a Yes answer wins; otherwise the default verdict.
  function evaluateNeed(rules, a) {
    a = a || {};
    var yes = function (k) { return a[k] === true; };
    var v = null;
    rules.verdicts.forEach(function (x) { if (!v && !x.isDefault && x.when.some(yes)) v = x; });
    if (!v) rules.verdicts.forEach(function (x) { if (!v && x.isDefault) v = x; });
    var reasons = v.when.filter(function (k) { return yes(k) && v.reasons[k]; }).map(function (k) { return v.reasons[k]; });
    var shown = reasons.map(function (x) { return x.id; });
    // A benefit that repeats a reason already listed (same id, e.g. liability) is left out.
    var benefits = rules.benefitsFor.indexOf(v.id) > -1 ? rules.benefits.filter(function (b) { return (b.always || b.when.some(yes)) && shown.indexOf(b.id) < 0; }) : [];
    return { id: v.id, title: v.title, intro: v.intro, reasons: reasons, facts: v.facts, benefits: benefits, disclaimer: rules.disclaimer, matched: v.when.filter(yes) };
  }

  // ---------- name rules (pure, no network) ----------
  function findDesignator(name, designators) {
    var w = words(name);
    var set = designators.map(function (d) { return { label: d, key: norm(d) }; });
    for (var k = Math.min(4, w.length); k >= 1; k--) {
      var tail = norm(w.slice(w.length - k).join(" "));
      for (var j = 0; j < set.length; j++) if (set[j].key && tail === set[j].key) return { label: set[j].label, written: w.slice(w.length - k).join(" "), atEnd: true, words: k };
    }
    // Present but not at the end? Only for unmistakable endings (LLC, L.L.C., "... Liability ..."), so a word like
    // "Limited" or initials like "LC" at the start of a name are left alone.
    for (var s = 0; s < w.length; s++) {
      for (var len = 1; len <= 4 && s + len <= w.length; len++) {
        var piece = norm(w.slice(s, s + len).join(" "));
        for (var q = 0; q < set.length; q++) if (set[q].key && piece === set[q].key && (set[q].key === "llc" || set[q].key.indexOf("liability") > -1)) return { label: set[q].label, written: w.slice(s, s + len).join(" "), atEnd: false, at: s, words: len };
      }
    }
    return null;
  }

  function restrictedHits(name, restricted) {
    var toks = words(name.replace(/[^A-Za-z0-9&'\s,.-]/g, " ")).map(norm).filter(Boolean);
    var hits = [];
    var seen = {};
    restricted.forEach(function (word) {
      var key = norm(word);
      if (!key || seen[key]) return;
      var rule = WORD_RULES[key] || { aliases: [key], kind: "review" };
      var found = null;
      for (var i = 0; i < toks.length; i++) if (rule.aliases.indexOf(toks[i]) > -1) { found = toks[i]; break; }
      if (found) { seen[key] = 1; hits.push({ word: word.replace(/\.$/, ""), matched: found, kind: rule.kind, label: KIND_LABEL[rule.kind], who: rule.who || "", why: rule.why || "" }); }
    });
    return hits;
  }

  // The term to type into the state search: the name without its ending, "The", or punctuation.
  // "Sweet Mae's" -> "SWEET MAES"; "Café Ñandú & Sons" -> "CAFE NANDU AND SONS".
  function coreName(name, des) {
    var w = words(name);
    if (des && des.atEnd) w = w.slice(0, w.length - des.words);
    else if (des) w.splice(des.at, des.words);
    var s = ascii(cleanForFiling(w.join(" "))).replace(/['\u2019`]/g, "").replace(/\s*&\s*/g, " AND ")
      .replace(/[^A-Za-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/^the(\s+|$)/i, "");
    return s.toUpperCase();
  }

  var MAX_NAME = 200, MAX_INPUT = 1000;
  function preferredEnding(st) { return st.designators.indexOf("LLC") > -1 ? "LLC" : st.designators[0]; }

  function checkName(rawName, st) {
    var name = cleanSpaces(rawName);
    var out = { name: name, legalName: name, designator: null, addDesignator: false, moveDesignator: false, removed: [], duplicateEnding: false, hits: [], tips: [], errors: [], core: "", blocked: false };
    if (name.length < 2) { out.errors.push("Type the business name you want."); return out; }
    if (name.length > MAX_NAME) { out.errors.push("Names are limited to " + MAX_NAME + " characters here. Yours is " + name.length + (name.length >= MAX_INPUT ? " (the box holds " + MAX_INPUT + ", so longer text was cut)" : "") + ". Shorten it to continue."); return out; }
    out.hits = restrictedHits(name, st.restricted);

    // Build the name we'd file: drop corporate words (Inc, Corp, ...), symbols the states reject, a repeated
    // ending, and put exactly one allowed ending at the end.
    var w = words(cleanForFiling(name));
    if (SYMBOLS.test(name)) out.removed.push({ word: "symbols", why: "emoji, ™ and < > are left out of the filed name" });
    var drop = {};
    out.hits.forEach(function (x) { if (x.kind === "blocked") (WORD_RULES[norm(x.word)] || { aliases: [norm(x.word)] }).aliases.forEach(function (al) { drop[al] = x.word; }); });
    var des = findDesignator(w.join(" "), st.designators);
    if (!des || !des.atEnd) {
      // An ending valid elsewhere but not here comes off as a whole phrase.
      var other = KNOWN_ENDINGS.filter(function (e) { return !st.designators.some(function (d) { return norm(d) === norm(e); }); });
      for (var k = Math.min(4, w.length - 1); k >= 1; k--) {
        var tail = w.slice(w.length - k).join(" ");
        if (other.some(function (e) { return norm(e) === norm(tail); })) {
          out.removed.push({ word: tail.replace(/,+$/, ""), why: "it is not an LLC ending in " + st.name });
          w = w.slice(0, w.length - k);
          des = findDesignator(w.join(" "), st.designators);
          break;
        }
      }
    }
    out.designator = des;
    var ending = des ? des.written : "";
    var body = w.slice();
    if (des && des.atEnd) body = body.slice(0, body.length - des.words);
    else if (des) { body.splice(des.at, des.words); out.moveDesignator = true; }
    // A second ending ("... LLC LLC") is removed.
    var again = findDesignator(body.join(" "), st.designators);
    while (again && again.atEnd && body.length > again.words) { out.duplicateEnding = true; body = body.slice(0, body.length - again.words); again = findDesignator(body.join(" "), st.designators); }
    // "... Limited Liability Co. LLC": an ending from another state left in front of the real one goes too.
    if (des) for (var kk = Math.min(4, body.length - 1); kk >= 1; kk--) {
      var t2 = body.slice(body.length - kk).join(" ");
      if (KNOWN_ENDINGS.some(function (e) { return norm(e) === norm(t2); })) { out.duplicateEnding = true; body = body.slice(0, body.length - kk); kk = Math.min(4, body.length - 1) + 1; }
    }
    body = body.filter(function (t) { var k = norm(t); if (drop[k]) { out.removed.push({ word: t.replace(/[,.]+$/, ""), why: "it signals a corporation" }); return false; } return true; });
    if (!des) {
      // Trailing "Co." / "Ltd." etc. that is not a valid ending in this state goes, and we say so.
      while (body.length > 1 && CORP_TAIL.indexOf(norm(body[body.length - 1])) > -1) out.removed.unshift({ word: body.pop().replace(/[,]+$/, ""), why: "it is not an LLC ending in " + st.name });
      out.addDesignator = true;
      ending = preferredEnding(st);
    }
    out.legalName = (body.join(" ").replace(/[,\s]+$/, "") + " " + ending).trim();

    out.core = coreName(out.legalName, findDesignator(out.legalName, st.designators));
    var coreWords = words(out.core.toLowerCase());
    if (!out.core) out.errors.push(body.length && /^the$/i.test(body.join(" ").trim()) ? "\"The\" on its own is not a name. Add a distinctive word, like \"The Harbor Bakery LLC\"." : "Add a distinctive word before the LLC ending.");
    else {
      if (coreWords.every(function (x) { return GENERIC.indexOf(x) > -1; })) out.tips.push("Add a distinctive word. Names built only from general words like Holdings, Services or Group are often already on the record.");
      if (out.core.replace(/\s/g, "").length <= 3) out.tips.push("Very short names and initials are often taken. A longer, specific name has a better chance.");
    }
    // Words that must come out (government) hold the CTA until the name is edited.
    // Corporate words were taken out above; the removed note covers them, so no red row as well.
    out.hits = out.hits.filter(function (x) { return x.kind !== "blocked"; });
    out.needsApproval = out.hits.filter(function (x) { return x.kind === "approval" || x.kind === "license" || x.kind === "protected"; }).map(function (x) { return x.matched; });
    out.blocked = out.hits.some(function (x) { return x.kind === "government"; });
    if (/[^\x20-\x7E]/.test(name)) out.tips.push("Some states accept only standard letters, numbers and common punctuation. Swap characters like é for plain letters if the state asks.");
    out.tips.push("Adding \"The,\" punctuation, or a different ending like \"Inc.\" vs \"LLC\" usually doesn't make a name different enough. Change a real word instead.");
    if (out.core) out.tips.push("On the state search, look up \"" + out.core + "\" without the ending, plus close spellings and plural forms.");
    return out;
  }
  function cleanSpaces(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  function nextSteps(st, a) {
    var list = [];
    if (a.hire || a.owners) list.push({ k: "ein", t: "EIN from the IRS", d: (a.hire ? "You need one to run payroll." : "Multi-owner LLCs file a partnership return, which needs an EIN.") + " It's free at irs.gov." });
    if (a.hire) list.push({ k: "employer", t: st.name + " employer registration", d: "Register for state withholding and unemployment insurance, and set up workers' compensation coverage." });
    if (a.owners) list.push({ k: "oa", t: "Operating agreement", d: "Put ownership, voting and what happens if someone leaves in writing. The filing flow includes a simple one." });
    if (a.online || a.markets || a.food) {
      if (NO_STATE_SALES_TAX.indexOf(st.code) > -1) list.push({ k: "salestax", t: "Sales tax check", d: st.name + " has no statewide sales tax. Check local rules where you sell, and other states' rules if you ship there." });
      else list.push({ k: "salestax", t: st.name + " sales tax permit", d: "If what you sell is taxable, register with the " + st.name + " tax department before your first sale." });
    }
    if (a.markets) list.push({ k: "local", t: "Local business license and event permits", d: "Cities, counties and many markets ask vendors for a business license and a temporary-event or vendor permit." });
    if (a.food) list.push({ k: "food", t: "Food or regulated-goods permit", d: "Food usually needs a health department permit or a cottage-food registration. Other regulated goods need the matching state license." });
    if (!a.markets) list.push({ k: "local", t: "Local business license", d: "Check your city or county. Many ask every business for a general license." });
    return list;
  }

  function stripMoney(s) {
    return String(s || "").replace(/\([^)]*\$[^)]*\)/g, "").replace(/\$[\d,.]+\s*/g, "").replace(/\s+([,;.])/g, "$1").replace(/\s{2,}/g, " ").replace(/^[\s+,;]+|[\s+,;]+$/g, "").trim();
  }

  function feeShown(cfg, st) { return !cfg.feesHidden && st.fee != null; }
  function ctaLabel(cfg, st) { return feeShown(cfg, st) && st.verified ? "File it free, pay only the " + st.name + " fee of " + money(st.fee) : "File it free, pay only the state fee"; }
  function ctaHref(st, legalName) { return FILING_FLOW_URL + "?state=" + encodeURIComponent(st.code) + "&name=" + encodeURIComponent(legalName) + "&src=llc-name-check"; }
  function availabilityLink(st, core) {
    if (st.deepLink && core) return { url: st.deepLink.replace("{name}", encodeURIComponent(core)), prefilled: true };
    return { url: st.searchUrl || st.sourceUrl, prefilled: false };
  }

  var ANSWERS = [["online", "Selling online?"], ["markets", "Selling at markets or events?"], ["hire", "Hiring employees?"], ["owners", "More than one owner?"], ["food", "Selling food or other regulated goods?"]];
  // The name check's questions plus the extra ones the need rules ask (liability, bank, separate, investors).
  function questionsOf(cfg) {
    var list = ANSWERS.slice(), seen = {};
    list.forEach(function (x) { seen[x[0]] = 1; });
    ((cfg && cfg.need && cfg.need.questions) || []).forEach(function (x) { if (!seen[x[0]]) { seen[x[0]] = 1; list.push(x); } });
    return list;
  }
  function shareQuery(code, name, a, opts) {
    opts = opts || {};
    var p = new URLSearchParams();
    if (code) p.set("state", code);
    if (name) p.set("name", name);
    Object.keys(a || {}).forEach(function (k) { if (a[k] === true && QID.test(k)) p.set(k, "1"); });
    if (opts.view) p.set("view", opts.view);
    return p.toString();
  }
  function parseQuery(search, questions) {
    var p = new URLSearchParams(search || "");
    var a = {};
    (questions || ANSWERS).forEach(function (x) { a[x[0]] = p.get(x[0]) === "1" || p.get(x[0]) === "yes"; });
    return { state: (p.get("state") || "").toUpperCase(), name: (p.get("name") || "").slice(0, MAX_INPUT), answers: a, view: p.get("view") === "need" ? "need" : "" };
  }

  // ---------- rendering ----------
  function srcLinks(list) {
    return ' <span class="lnc-src">' + list.map(function (s) { return '<a target="_blank" rel="noopener" href="' + esc(s.url) + '">' + esc(s.title) + '</a>'; }).join(" · ") + '</span>';
  }
  // The verdict block. ctx: { cfg, st (optional), legalName (optional), standalone }.
  function needHtml(rules, v, ctx) {
    ctx = ctx || {};
    var h = '<section class="lnc-need lnc-need-' + esc(v.id) + '" id="lnc-need" data-verdict="' + esc(v.id) + '">';
    h += '<p class="lnc-k">Do I need an LLC?</p><h3 class="lnc-h3 lnc-verdict" id="lnc-verdict">' + esc(v.title) + '</h3>';
    if (v.intro) h += '<p class="lnc-small">' + esc(v.intro) + '</p>';
    var li = function (x, cls, kind) { return '<li class="' + cls + '" data-' + kind + '="' + esc(x.id) + '">' + (x.title ? '<strong>' + esc(x.title) + '.</strong> ' : '') + esc(x.text) + srcLinks(x.sources) + '</li>'; };
    if (v.reasons.length) { h += '<ul class="lnc-list" id="lnc-need-reasons">'; v.reasons.forEach(function (x) { h += li(x, "lnc-warn", "reason"); }); h += '</ul>'; }
    // With reasons (verdict c) the facts close the block; otherwise they lead.
    var facts = v.facts.length ? '<ul class="lnc-list" id="lnc-need-facts">' + v.facts.map(function (x) { return li(x, "lnc-info", "fact"); }).join("") + '</ul>' : "";
    if (!v.reasons.length) h += facts;
    if (v.benefits.length) {
      h += '<p class="lnc-small"><strong>Benefits that match your answers</strong></p><ul class="lnc-list" id="lnc-need-benefits">';
      v.benefits.forEach(function (x) { h += li(x, "lnc-ok", "benefit"); }); h += '</ul>';
    }
    if (v.reasons.length) h += facts;
    h += '<p class="lnc-small lnc-disclaimer" id="lnc-need-disclaimer">' + esc(v.disclaimer.replace(/\s*Not a licensed attorney\. Not legal advice\.\s*$/, "")) + ' <strong>Not a licensed attorney. Not legal advice.</strong></p>';
    if (ctx.standalone) {
      var st = ctx.st, cfg = ctx.cfg;
      h += '<div class="lnc-row">';
      h += '<button type="button" class="lnc-btn' + (v.id === "operate" ? "" : " lnc-btn-ghost") + '" id="lnc-need-name">' + (ctx.legalName ? "Check this name" : "Check a business name") + '</button>';
      if (v.id !== "operate") {
        var href = st ? (ctx.legalName ? ctaHref(st, ctx.legalName) : FILING_FLOW_URL + "?state=" + encodeURIComponent(st.code) + "&src=llc-need") : FILING_FLOW_URL + "?src=llc-need";
        h += '<a class="lnc-btn" id="lnc-need-cta" href="' + esc(href) + '">' + esc(st && cfg ? ctaLabel(cfg, st) : "File it free, pay only the state fee") + '</a>';
      }
      h += '<button type="button" class="lnc-btn lnc-btn-ghost" id="lnc-share">Copy share link</button></div><p class="lnc-small" id="lnc-share-note" aria-live="polite"></p>';
    }
    h += '</section>';
    return h;
  }
  function needCardHtml(cfg, st, legalName, a) {
    return '<div class="lnc-card" id="lnc-need-card">' + needHtml(cfg.need, evaluateNeed(cfg.need, a), { cfg: cfg, st: st, legalName: legalName, standalone: true }) + '</div>';
  }
  function resultHtml(cfg, st, r, a) {
    var h = "";
    var avail = availabilityLink(st, r.core);
    h += '<div class="lnc-card" id="lnc-result" data-state="' + esc(st.code) + '">';
    h += '<p class="lnc-k">Result for ' + esc(st.name) + '</p><h2 class="lnc-h">' + esc(r.legalName) + '</h2>';

    // 1. Name rules
    h += '<h3 class="lnc-h3">Name rules</h3><ul class="lnc-list">';
    var endSrc = st.endingsVerified && st.endingsSource ? ' <a class="lnc-srcl" target="_blank" rel="noopener" href="' + esc(st.endingsSource) + '">' + esc(st.endingsCite || (st.name + " law")) + '</a>' : "";
    var endNote = st.endingsVerified ? '<br><span class="lnc-small" data-endings="verified">Accepted endings in ' + esc(st.name) + ': ' + esc(st.designators.join(", ").replace(/\.$/, "")) + '.' + endSrc + '</span>'
      : '<br><span class="lnc-small lnc-confirm" data-endings="generic">We check the standard endings (' + esc(st.designators.join(", ")) + '). ' + esc(st.name) + ' may accept others. Confirm on the official site.</span>';
    r.removed.forEach(function (x) { h += '<li class="lnc-info" data-rule="removed" data-word="' + esc(String(x.word).toLowerCase()) + '"><strong>' + (x.word === "symbols" ? "Symbols removed." : 'Removed "' + esc(x.word) + '".') + '</strong> ' + (x.word === "symbols" ? "Emoji, ™ and < > are left out of the filed name." : "We left it out because " + esc(x.why) + ".") + ' Name to file: <strong>' + esc(r.legalName) + '</strong>' + endDot(r.legalName) + '</li>'; });
    if (r.duplicateEnding) h += '<li class="lnc-info" data-rule="duplicate-ending"><strong>One ending is enough.</strong> We kept a single ending: <strong>' + esc(r.legalName) + '</strong>' + endDot(r.legalName) + '</li>';
    if (r.addDesignator) h += '<li class="lnc-info" data-rule="designator-added"><strong>Ending added.</strong> ' + esc(st.name) + ' LLC names end with an LLC designator. We\'ll add it for you: <strong>' + esc(r.legalName) + '</strong>' + endDot(r.legalName) + endNote + '</li>';
    else if (r.moveDesignator) h += '<li class="lnc-warn" data-rule="designator-move"><strong>Move the ending.</strong> "' + esc(r.designator.written) + '" goes at the end: <strong>' + esc(r.legalName) + '</strong>' + endDot(r.legalName) + '</li>';
    else h += '<li class="lnc-ok" data-rule="designator-ok"><strong>Ending looks right.</strong> "' + esc(r.designator.written) + '" is ' + (st.endingsVerified ? "an accepted ending in " + esc(st.name) : "a standard LLC ending") + '.' + endNote + '</li>';
    if (!r.hits.length) h += '<li class="lnc-ok" data-rule="words-ok"><strong>Common restricted words clear.</strong> Your name avoids the words we check in every state, such as Bank, Trust, Insurance, University and Inc. ' + (st.restrictedScope === "state" ? "" : esc(st.name) + ' may restrict other words. Confirm on the official site.') + '</li>';
    r.hits.forEach(function (x) {
      var cls = (x.kind === "blocked" || x.kind === "government") ? "lnc-bad" : "lnc-warn";
      var detail = x.who ? "Usually needs sign-off from " + esc(x.who) + "." : esc(x.why);
      h += '<li class="' + cls + '" data-rule="word" data-word="' + esc(x.word.toLowerCase()) + '" data-kind="' + esc(x.kind) + '"><strong>"' + esc(x.word) + '": ' + esc(x.label) + '.</strong> ' + detail + '</li>';
    });
    r.tips.forEach(function (t) { h += '<li class="lnc-tip" data-rule="tip">' + esc(t) + '</li>'; });
    h += '</ul>';

    // 2. Availability
    h += '<div class="lnc-avail"><a class="lnc-btn lnc-btn-ghost" id="lnc-avail" target="_blank" rel="noopener" href="' + esc(avail.url) + '" data-prefilled="' + (avail.prefilled ? "1" : "0") + '" data-copy="' + esc(r.core) + '">Check availability on the official ' + esc(st.name) + ' registry</a>' + (st.registryNote ? '<p class="lnc-small" id="lnc-registry-note">' + esc(st.registryNote) + '</p>' : '');
    h += '<p class="lnc-small">' + (avail.prefilled ? "Opens the state's search with your name filled in." : "Opens the state's search in a new tab. We copy \"" + esc(r.core) + "\" to your clipboard so you can paste it.") + ' The state decides final approval when you file.</p></div>';

    // 3. State requirements
    var src = st.sourceUrl ? ' <a target="_blank" rel="noopener" href="' + esc(st.sourceUrl) + '">' + esc(st.name) + ' source</a>' : "";
    var confirm = '<br><span class="lnc-small lnc-confirm" data-confirm="1">Confirm on the official site.' + src + '</span>';
    var show = feeShown(cfg, st);
    var feeTxt = show ? '<span class="lnc-price" id="lnc-fee">' + esc(money(st.fee)) + '</span>' + (st.code === "TN" ? ' <span class="lnc-small">($50 per member, $300 minimum)</span>' : "") + (st.verified ? "" : confirm)
      : '<span id="lnc-fee">See state site</span>' + src;
    var annual;
    if (st.noAnnual) annual = show ? "$0, no annual report" + (st.verified ? "." : ". Confirm on the state site.") : "No annual report. Confirm on the state site.";
    else if (!st.annualDue && !st.annualFee) annual = "None listed for a standard LLC. Confirm on the state site.";
    else if (!show) annual = stripMoney(st.annualDue) + " · fee: see state site";
    else annual = (st.annualDue || "") + (st.annualFee ? " · " + money(st.annualFee) + (st.everyYears === 2 && !/2 years|2nd year|bienn/i.test(st.annualDue || "") ? " every 2 years" : "") : "");
    var extra = "";
    if (show && st.yearly != null) extra += '<div><dt>Yearly cost to keep it active</dt><dd id="lnc-yearly"><span class="lnc-price">' + esc(money(st.yearly)) + '</span> a year' + (st.everyYears === 2 && st.annualFee ? ' <span class="lnc-small">(the ' + esc(money(st.annualFee)) + ' report is due every 2 years, so it counts as ' + esc(money(st.annualFee / 2)) + ' a year)</span>' : "") + (st.verified ? "" : confirm) + '</dd></div>';
    if (show && st.minTax) extra += '<div><dt>Minimum annual tax</dt><dd id="lnc-mintax"><span class="lnc-price">' + esc(money(st.minTax)) + '</span>, due every year even with no income. It\'s included in the yearly cost.</dd></div>';
    h += '<h3 class="lnc-h3">' + esc(st.name) + ' requirements</h3><dl class="lnc-dl">';
    h += '<div><dt>State filing fee</dt><dd>' + feeTxt + '<br><span class="lnc-small">Passed through at cost. Prep is free.</span></dd></div>';
    h += '<div><dt>Annual report / franchise tax</dt><dd id="lnc-annual">' + esc(annual) + '</dd></div>' + extra;
    h += '<div><dt>Publication</dt><dd id="lnc-publication">' + (st.publication ? "<strong>" + esc(st.publicationStatus || "Required") + ".</strong> " + (st.publicationNote ? esc(st.publicationNote) : esc(st.name) + " asks new LLCs to publish a notice of formation. Budget for newspaper costs.") : "Not listed for " + esc(st.name) + ".") + '</dd></div>';
    h += '<div><dt>Registered agent</dt><dd>Every ' + esc(st.name) + ' LLC names a registered agent with a street address in ' + esc(st.name) + '. It can be you, a person you trust, or a company. You add it in the filing flow.</dd></div>';
    h += '</dl>';

    // 4. Do I need an LLC? (only once they've answered something; the full view is the form's second button)
    if (cfg.need) {
      var anyYes = Object.keys(a).some(function (k) { return a[k] === true; });
      if (anyYes) h += needHtml(cfg.need, evaluateNeed(cfg.need, a), {});
      else h += '<p class="lnc-small" id="lnc-need-hint">Wondering whether you need an LLC at all? Answer the quick questions above and choose <strong>Do I need an LLC?</strong></p>';
    }

    // 5. Likely next
    var ns = nextSteps(st, a);
    h += '<h3 class="lnc-h3">You\'ll likely need next</h3><ul class="lnc-list" id="lnc-next">';
    ns.forEach(function (n) { h += '<li data-next="' + esc(n.k) + '"><strong>' + esc(n.t) + '.</strong> ' + esc(n.d) + '</li>'; });
    h += '</ul>';

    // 6. Disclaimer + CTA + share
    h += '<p class="lnc-small lnc-disclaimer">This check uses common state naming rules and our ' + esc(st.name) + ' data' + (cfg.updated ? " (updated " + esc(cfg.updated) + ")" : "") + '. Fees and rules change, so confirm on the official state site before you file. <strong>Not a licensed attorney. Not legal advice.</strong></p>';
    if (r.blocked) h += '<p class="lnc-small lnc-err" id="lnc-cta-note">A word marked "Leave it out" is still in the name. Edit it above and check again.</p>';
    if (r.blocked) h += '<div class="lnc-row"><span class="lnc-btn lnc-btn-off" id="lnc-cta" aria-disabled="true" data-blocked="1">Edit the name to continue</span>';
    else h += '<div class="lnc-row"><a class="lnc-btn" id="lnc-cta" href="' + esc(ctaHref(st, r.legalName)) + '">' + esc(ctaLabel(cfg, st)) + '</a>';
    h += '<button type="button" class="lnc-btn lnc-btn-ghost" id="lnc-share">Copy share link</button></div><p class="lnc-small" id="lnc-share-note" aria-live="polite"></p>';
    h += '</div>';
    return h;
  }

  function formHtml(cfg, sel, name, a) {
    var qs = questionsOf(cfg);
    var h = '<form class="lnc-card" id="lnc-form" novalidate>';
    h += '<div class="lnc-grid"><label class="lnc-field"><span>State</span><select id="lnc-state" required><option value="">Choose a state</option>';
    cfg.codes.forEach(function (c) { h += '<option value="' + c + '"' + (c === sel ? " selected" : "") + '>' + esc(cfg.states[c].name) + '</option>'; });
    h += '</select></label><label class="lnc-field"><span>Business name</span><input id="lnc-name" maxlength="' + MAX_INPUT + '" autocomplete="organization" placeholder="Zephyr Bakery" value="' + esc(name) + '"></label></div>';
    h += '<fieldset class="lnc-qs"><legend>Optional: a few quick questions</legend>';
    qs.forEach(function (x) { h += '<label class="lnc-q"><input type="checkbox" id="lnc-' + x[0] + '"' + (a[x[0]] ? " checked" : "") + '> <span>' + esc(x[1]) + '</span> <em>Yes</em></label>'; });
    h += '</fieldset><p class="lnc-err" id="lnc-err" aria-live="polite"></p><div class="lnc-row"><button class="lnc-btn" type="submit" id="lnc-go">Check my name</button>' + (cfg.need ? '<button class="lnc-btn lnc-btn-ghost" type="button" id="lnc-need-go">Do I need an LLC?</button>' : '') + '</div></form><div id="lnc-out"></div>';
    return h;
  }

  function mount(el) {
    if (!el || el.getAttribute("data-mounted")) return;
    el.setAttribute("data-mounted", "1");
    el.innerHTML = '<div class="lnc-card lnc-small" id="lnc-loading">Loading state rules…</div>';
    loadConfig().then(function (cfg) {
      root.LNC.config = cfg;
      var QS = questionsOf(cfg);
      var q = parseQuery(root.location.search, QS);
      var fromPath = (root.location.pathname.match(/\/llc-name-check\/([a-z-]+)\/?$/) || [])[1];
      var def = (el.getAttribute("data-default-state") || "").toUpperCase();
      if (!cfg.states[def] && fromPath) cfg.codes.forEach(function (c) { if (cfg.states[c].slug === fromPath) def = c; });
      var sel = cfg.states[q.state] ? q.state : (cfg.states[def] ? def : "");
      el.innerHTML = formHtml(cfg, sel, q.name, q.answers);
      var $ = function (id) { return el.querySelector("#" + id); };
      function answers() { var a = {}; QS.forEach(function (x) { a[x[0]] = !!$("lnc-" + x[0]).checked; }); return a; }
      // "Do I need an LLC?": state and name are optional here; when present they carry into the hand-off.
      function runNeed(updateUrl) {
        if (!cfg.need) return;
        $("lnc-err").textContent = "";
        var code = $("lnc-state").value, st = cfg.states[code] || null, a = answers();
        var r = st ? checkName($("lnc-name").value, st) : null;
        var legal = r && !r.errors.length && !r.blocked ? r.legalName : "";
        $("lnc-out").innerHTML = needCardHtml(cfg, st, legal, a);
        if (updateUrl && root.history && root.history.replaceState) root.history.replaceState(null, "", root.location.pathname + "?" + shareQuery(st ? code : "", $("lnc-name").value.trim(), a, { view: "need" }));
        if (typeof root.gtag === "function") root.gtag("event", "llc_need_verdict", { verdict: evaluateNeed(cfg.need, a).id });
      }
      function run(updateUrl) {
        var code = $("lnc-state").value, name = $("lnc-name").value;
        var err = $("lnc-err");
        err.textContent = "";
        if (!cfg.states[code]) { err.textContent = "Choose a state."; $("lnc-out").innerHTML = ""; return; }
        var st = cfg.states[code];
        var r = checkName(name, st);
        if (r.errors.length) { err.textContent = r.errors[0]; $("lnc-out").innerHTML = ""; return; }
        var a = answers();
        $("lnc-out").innerHTML = resultHtml(cfg, st, r, a);
        if (updateUrl && root.history && root.history.replaceState) root.history.replaceState(null, "", root.location.pathname + "?" + shareQuery(code, r.name, a));
        if (typeof root.gtag === "function") root.gtag("event", "llc_name_check", { state: code });
      }
      $("lnc-form").addEventListener("submit", function (e) { e.preventDefault(); run(true); var o = $("lnc-result"); if (o && o.scrollIntoView) o.scrollIntoView({ behavior: "smooth", block: "start" }); });
      el.addEventListener("click", function (e) {
        var t = e.target;
        if (t.id === "lnc-share") {
          var url = root.location.href;
          var note = $("lnc-share-note");
          (root.navigator.clipboard ? root.navigator.clipboard.writeText(url) : Promise.reject()).then(function () { note.textContent = "Link copied: " + url; }, function () { note.textContent = "Share this link: " + url; });
        }
        if (t.id === "lnc-need-go") { runNeed(true); var c = $("lnc-need-card"); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: "smooth", block: "start" }); }
        if (t.id === "lnc-need-name") {
          if ($("lnc-state").value && $("lnc-name").value.trim()) { run(true); var o2 = $("lnc-result"); if (o2 && o2.scrollIntoView) o2.scrollIntoView({ behavior: "smooth", block: "start" }); }
          else { var f = $("lnc-state").value ? $("lnc-name") : $("lnc-state"); if (f.scrollIntoView) f.scrollIntoView({ behavior: "smooth", block: "center" }); f.focus(); }
        }
        if (t.id === "lnc-avail" && t.getAttribute("data-prefilled") === "0" && root.navigator.clipboard) {
          root.navigator.clipboard.writeText(t.getAttribute("data-copy") || "").catch(function () {});
        }
      });
      if (q.view === "need" && cfg.need) runNeed(false);
      else if (sel && q.name) run(false);
    }).catch(function () {
      el.innerHTML = '<div class="lnc-card">State rules are taking a moment to load. Refresh the page to try again.</div>';
    });
  }

  var api = { normalizeConfig: normalizeConfig, checkName: checkName, findDesignator: findDesignator, restrictedHits: restrictedHits, coreName: coreName, nextSteps: nextSteps, stripMoney: stripMoney, ctaLabel: ctaLabel, ctaHref: ctaHref, availabilityLink: availabilityLink, shareQuery: shareQuery, parseQuery: parseQuery, normalizeNeedRules: normalizeNeedRules, validateConfig: validateConfig, isOfficialUrl: isOfficialUrl, KNOWN_ENDINGS: KNOWN_ENDINGS, WORD_RULES: WORD_RULES, cleanForFiling: cleanForFiling, loadConfig: loadConfig, evaluateNeed: evaluateNeed, needHtml: needHtml, needCardHtml: needCardHtml, questionsOf: questionsOf, REMOTE_NEED_RULES_URL: REMOTE_NEED_RULES_URL, BUNDLED_NEED_RULES_URL: BUNDLED_NEED_RULES_URL, resultHtml: resultHtml, feeShown: feeShown, mount: mount, REMOTE_CONFIG_URL: REMOTE_CONFIG_URL, BUNDLED_CONFIG_URL: BUNDLED_CONFIG_URL };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LNC = api;
  if (root.document) {
    var go = function () { Array.prototype.forEach.call(root.document.querySelectorAll("[data-llc-name-check]"), mount); };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", go); else go();
  }
})(typeof window !== "undefined" ? window : globalThis);
