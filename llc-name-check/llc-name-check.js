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
  var CORP_TAIL = ["inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited"];
  // States with no statewide sales tax (local taxes can still apply, e.g. Alaska).
  var NO_STATE_SALES_TAX = ["AK", "DE", "MT", "NH", "OR"];

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function safeHttps(u) { return typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ""; }
  function slugify(name) { return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function money(n) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function words(name) { return String(name || "").trim().split(/[\s,]+/).filter(Boolean); }

  // ---------- config ----------
  // Accepts the Free Tools format (a bare array of state rows) or the wrapped format
  // { feesVerified, updated, states: [...] }. Returns null when the payload is unusable.
  function normalizeConfig(raw) {
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
        fee: typeof r.filing_fee_usd === "number" && isFinite(r.filing_fee_usd) ? r.filing_fee_usd : null,
        feeVerified: r.fee_verified !== false,
        annualFee: typeof r.annual_report_fee_usd === "number" && isFinite(r.annual_report_fee_usd) ? r.annual_report_fee_usd : null,
        annualDue: r.annual_report_due ? String(r.annual_report_due) : null,
        publication: r.publication_required === true,
        searchUrl: safeHttps(r.search_url),
        deepLink: (!r.api_available && safeHttps(String(r.deep_link_template_or_null || "").replace("{name}", "NAME")) && String(r.deep_link_template_or_null).indexOf("{name}") > -1) ? String(r.deep_link_template_or_null) : "",
        sourceUrl: safeHttps(r.source_url) || safeHttps(r.search_url),
        designators: Array.isArray(r.designators_allowed) && r.designators_allowed.length ? r.designators_allowed.map(String) : ["LLC", "L.L.C.", "Limited Liability Company"],
        restricted: Array.isArray(r.restricted_words) ? r.restricted_words.map(String) : []
      };
    });
    var codes = Object.keys(states);
    if (codes.length < 51) return null;
    return {
      feesVerified: !Array.isArray(raw) && raw.feesVerified === true,
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

  function loadConfig() {
    var sources = [root.LNC_CONFIG_URL || REMOTE_CONFIG_URL, BUNDLED_CONFIG_URL];
    var i = 0;
    function next() {
      if (i >= sources.length) return Promise.reject(new Error("config unavailable"));
      var url = sources[i++];
      return fetchJson(url, 3500).then(function (raw) {
        var cfg = normalizeConfig(raw);
        if (!cfg) throw new Error("invalid config");
        cfg.loadedFrom = url;
        return cfg;
      }).catch(function () { return next(); });
    }
    return next();
  }

  // ---------- name rules (pure, no network) ----------
  function findDesignator(name, designators) {
    var w = words(name);
    var set = designators.map(function (d) { return { label: d, key: norm(d) }; });
    for (var k = Math.min(4, w.length); k >= 1; k--) {
      var tail = norm(w.slice(w.length - k).join(" "));
      for (var j = 0; j < set.length; j++) if (set[j].key && tail === set[j].key) return { label: set[j].label, written: w.slice(w.length - k).join(" "), atEnd: true, words: k };
    }
    // Present but not at the end?
    for (var s = 0; s < w.length; s++) {
      for (var len = 1; len <= 4 && s + len <= w.length; len++) {
        var piece = norm(w.slice(s, s + len).join(" "));
        for (var q = 0; q < set.length; q++) if (set[q].key && piece === set[q].key) return { label: set[q].label, written: w.slice(s, s + len).join(" "), atEnd: false, at: s, words: len };
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

  function coreName(name, des) {
    var w = words(name);
    if (des && des.atEnd) w = w.slice(0, w.length - des.words);
    else if (des) w.splice(des.at, des.words);
    var s = w.join(" ").replace(/&/g, " and ").replace(/[^A-Za-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/^the\s+/i, "");
    return s.toUpperCase();
  }

  function suggestName(name, st) {
    var w = words(name);
    while (w.length > 1 && CORP_TAIL.indexOf(norm(w[w.length - 1])) > -1) w.pop();
    var base = w.join(" ").replace(/[,\s]+$/, "");
    return base + " " + (st.designators.indexOf("LLC") > -1 ? "LLC" : st.designators[0]);
  }

  function checkName(rawName, st) {
    var name = String(rawName || "").replace(/\s+/g, " ").trim().slice(0, 200);
    var out = { name: name, legalName: name, designator: null, addDesignator: false, moveDesignator: false, hits: [], tips: [], errors: [], core: "" };
    if (name.length < 2) { out.errors.push("Type the business name you want."); return out; }
    var des = findDesignator(name, st.designators);
    out.designator = des;
    if (!des) { out.addDesignator = true; out.legalName = suggestName(name, st); }
    else if (!des.atEnd) {
      out.moveDesignator = true;
      var rest = words(name); rest.splice(des.at, des.words);
      out.legalName = rest.join(" ").replace(/[,\s]+$/, "") + " " + des.written;
    }
    out.hits = restrictedHits(name, st.restricted);
    // Search core: the legal name we'd file, minus the ending, "The" and punctuation.
    out.core = coreName(out.legalName, findDesignator(out.legalName, st.designators));
    var coreWords = words(out.core.toLowerCase());
    if (!out.core) out.errors.push("Add a distinctive word before the LLC ending.");
    else {
      if (coreWords.every(function (x) { return GENERIC.indexOf(x) > -1; })) out.tips.push("Add a distinctive word. Names built only from general words like Holdings, Services or Group are often already on the record.");
      if (out.core.replace(/\s/g, "").length <= 3) out.tips.push("Very short names and initials are often taken. A longer, specific name has a better chance.");
    }
    if (/[^\x20-\x7E]/.test(name)) out.tips.push("Some states accept only standard letters, numbers and common punctuation. Swap characters like é, ™ or emoji for plain text.");
    out.tips.push("Adding \"The,\" punctuation, or a different ending like \"Inc.\" vs \"LLC\" usually doesn't make a name different enough. Change a real word instead.");
    if (out.core) out.tips.push("On the state search, look up \"" + out.core + "\" without the ending, plus close spellings and plural forms.");
    return out;
  }

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

  function feeShown(cfg, st) { return !!(cfg.feesVerified && st.feeVerified && st.fee != null); }
  function ctaLabel(cfg, st) { return feeShown(cfg, st) ? "File it free, pay only the " + st.name + " fee of " + money(st.fee) : "File it free, pay only the state fee"; }
  function ctaHref(st, legalName) { return FILING_FLOW_URL + "?state=" + encodeURIComponent(st.code) + "&name=" + encodeURIComponent(legalName) + "&src=llc-name-check"; }
  function availabilityLink(st, core) {
    if (st.deepLink && core) return { url: st.deepLink.replace("{name}", encodeURIComponent(core)), prefilled: true };
    return { url: st.searchUrl || st.sourceUrl, prefilled: false };
  }

  var ANSWERS = [["online", "Selling online?"], ["markets", "Selling at markets or events?"], ["hire", "Hiring employees?"], ["owners", "More than one owner?"], ["food", "Selling food or other regulated goods?"]];
  function shareQuery(code, name, a) {
    var p = new URLSearchParams();
    p.set("state", code); p.set("name", name);
    ANSWERS.forEach(function (x) { if (a[x[0]]) p.set(x[0], "1"); });
    return p.toString();
  }
  function parseQuery(search) {
    var p = new URLSearchParams(search || "");
    var a = {};
    ANSWERS.forEach(function (x) { a[x[0]] = p.get(x[0]) === "1" || p.get(x[0]) === "yes"; });
    return { state: (p.get("state") || "").toUpperCase(), name: (p.get("name") || "").slice(0, 200), answers: a };
  }

  // ---------- rendering ----------
  function resultHtml(cfg, st, r, a) {
    var h = "";
    var avail = availabilityLink(st, r.core);
    h += '<div class="lnc-card" id="lnc-result" data-state="' + esc(st.code) + '">';
    h += '<p class="lnc-k">Result for ' + esc(st.name) + '</p><h2 class="lnc-h">' + esc(r.legalName) + '</h2>';

    // 1. Name rules
    h += '<h3 class="lnc-h3">Name rules</h3><ul class="lnc-list">';
    if (r.addDesignator) h += '<li class="lnc-info" data-rule="designator-added"><strong>Ending added.</strong> ' + esc(st.name) + ' LLC names end with an LLC designator. We\'ll add it for you: <strong>' + esc(r.legalName) + '</strong>.</li>';
    else if (r.moveDesignator) h += '<li class="lnc-warn" data-rule="designator-move"><strong>Move the ending.</strong> "' + esc(r.designator.written) + '" goes at the end: <strong>' + esc(r.legalName) + '</strong>.</li>';
    else h += '<li class="lnc-ok" data-rule="designator-ok"><strong>Ending looks right.</strong> "' + esc(r.designator.written) + '" is an accepted ending in ' + esc(st.name) + '.</li>';
    if (!r.hits.length) h += '<li class="lnc-ok" data-rule="words-ok"><strong>Restricted words clear.</strong> Your name avoids the restricted words on our ' + esc(st.name) + ' list.</li>';
    r.hits.forEach(function (x) {
      var cls = (x.kind === "blocked" || x.kind === "government") ? "lnc-bad" : "lnc-warn";
      var detail = x.who ? "Usually needs sign-off from " + esc(x.who) + "." : esc(x.why);
      h += '<li class="' + cls + '" data-rule="word" data-word="' + esc(x.word.toLowerCase()) + '" data-kind="' + esc(x.kind) + '"><strong>"' + esc(x.word) + '": ' + esc(x.label) + '.</strong> ' + detail + '</li>';
    });
    r.tips.forEach(function (t) { h += '<li class="lnc-tip" data-rule="tip">' + esc(t) + '</li>'; });
    h += '</ul>';

    // 2. Availability
    h += '<div class="lnc-avail"><a class="lnc-btn lnc-btn-ghost" id="lnc-avail" target="_blank" rel="noopener" href="' + esc(avail.url) + '" data-prefilled="' + (avail.prefilled ? "1" : "0") + '" data-copy="' + esc(r.core) + '">Check availability on the official ' + esc(st.name) + ' registry</a>';
    h += '<p class="lnc-small">' + (avail.prefilled ? "Opens the state's search with your name filled in." : "Opens the state's search in a new tab. We copy \"" + esc(r.core) + "\" to your clipboard so you can paste it.") + ' The state decides final approval when you file.</p></div>';

    // 3. State requirements
    var feeTxt = feeShown(cfg, st) ? '<span class="lnc-price" id="lnc-fee">' + esc(money(st.fee)) + '</span>' : '<span id="lnc-fee">See state site</span>' + (st.sourceUrl ? ' <a target="_blank" rel="noopener" href="' + esc(st.sourceUrl) + '">' + esc(st.name) + ' source</a>' : "");
    var annual;
    if ((!st.annualDue || /^none\b/i.test(st.annualDue)) && (st.annualFee === 0 || st.annualFee == null)) annual = "None listed for a standard LLC. Confirm on the state site.";
    else {
      var due = cfg.feesVerified ? (st.annualDue || "") : stripMoney(st.annualDue);
      var amt = cfg.feesVerified && st.annualFee != null ? money(st.annualFee) : "fee: see state site";
      annual = (due ? due + " · " : "") + amt;
    }
    h += '<h3 class="lnc-h3">' + esc(st.name) + ' requirements</h3><dl class="lnc-dl">';
    h += '<div><dt>State filing fee</dt><dd>' + feeTxt + '<br><span class="lnc-small">Passed through at cost. Prep is free.</span></dd></div>';
    h += '<div><dt>Annual report / franchise tax</dt><dd id="lnc-annual">' + esc(annual) + '</dd></div>';
    h += '<div><dt>Publication</dt><dd id="lnc-publication">' + (st.publication ? "<strong>Required.</strong> " + esc(st.name) + " asks new LLCs to publish a notice of formation. Budget for newspaper costs." : "Not listed for " + esc(st.name) + ".") + '</dd></div>';
    h += '<div><dt>Registered agent</dt><dd>Every ' + esc(st.name) + ' LLC names a registered agent with a street address in ' + esc(st.name) + '. It can be you, a person you trust, or a company. You add it in the filing flow.</dd></div>';
    h += '</dl>';

    // 4. Likely next
    var ns = nextSteps(st, a);
    h += '<h3 class="lnc-h3">You\'ll likely need next</h3><ul class="lnc-list" id="lnc-next">';
    ns.forEach(function (n) { h += '<li data-next="' + esc(n.k) + '"><strong>' + esc(n.t) + '.</strong> ' + esc(n.d) + '</li>'; });
    h += '</ul>';

    // 5. Disclaimer + CTA + share
    h += '<p class="lnc-small lnc-disclaimer">This check uses common state naming rules and our ' + esc(st.name) + ' data' + (cfg.updated ? " (updated " + esc(cfg.updated) + ")" : "") + '. Fees and rules change, so confirm on the official state site before you file. <strong>Not a licensed attorney. Not legal advice.</strong></p>';
    h += '<div class="lnc-row"><a class="lnc-btn" id="lnc-cta" href="' + esc(ctaHref(st, r.legalName)) + '">' + esc(ctaLabel(cfg, st)) + '</a>';
    h += '<button type="button" class="lnc-btn lnc-btn-ghost" id="lnc-share">Copy share link</button></div><p class="lnc-small" id="lnc-share-note" aria-live="polite"></p>';
    h += '</div>';
    return h;
  }

  function formHtml(cfg, sel, name, a) {
    var h = '<form class="lnc-card" id="lnc-form" novalidate>';
    h += '<div class="lnc-grid"><label class="lnc-field"><span>State</span><select id="lnc-state" required><option value="">Choose a state</option>';
    cfg.codes.forEach(function (c) { h += '<option value="' + c + '"' + (c === sel ? " selected" : "") + '>' + esc(cfg.states[c].name) + '</option>'; });
    h += '</select></label><label class="lnc-field"><span>Business name</span><input id="lnc-name" maxlength="200" autocomplete="organization" placeholder="Zephyr Bakery" value="' + esc(name) + '"></label></div>';
    h += '<fieldset class="lnc-qs"><legend>Optional: a few quick questions</legend>';
    ANSWERS.forEach(function (x) { h += '<label class="lnc-q"><input type="checkbox" id="lnc-' + x[0] + '"' + (a[x[0]] ? " checked" : "") + '> <span>' + esc(x[1]) + '</span> <em>Yes</em></label>'; });
    h += '</fieldset><p class="lnc-err" id="lnc-err" aria-live="polite"></p><button class="lnc-btn" type="submit" id="lnc-go">Check my name</button></form><div id="lnc-out"></div>';
    return h;
  }

  function mount(el) {
    if (!el || el.getAttribute("data-mounted")) return;
    el.setAttribute("data-mounted", "1");
    el.innerHTML = '<div class="lnc-card lnc-small" id="lnc-loading">Loading state rules…</div>';
    loadConfig().then(function (cfg) {
      root.LNC.config = cfg;
      var q = parseQuery(root.location.search);
      var fromPath = (root.location.pathname.match(/\/llc-name-check\/([a-z-]+)\/?$/) || [])[1];
      var def = (el.getAttribute("data-default-state") || "").toUpperCase();
      if (!cfg.states[def] && fromPath) cfg.codes.forEach(function (c) { if (cfg.states[c].slug === fromPath) def = c; });
      var sel = cfg.states[q.state] ? q.state : (cfg.states[def] ? def : "");
      el.innerHTML = formHtml(cfg, sel, q.name, q.answers);
      var $ = function (id) { return el.querySelector("#" + id); };
      function answers() { var a = {}; ANSWERS.forEach(function (x) { a[x[0]] = !!$("lnc-" + x[0]).checked; }); return a; }
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
        if (t.id === "lnc-avail" && t.getAttribute("data-prefilled") === "0" && root.navigator.clipboard) {
          root.navigator.clipboard.writeText(t.getAttribute("data-copy") || "").catch(function () {});
        }
      });
      if (sel && q.name) run(false);
    }).catch(function () {
      el.innerHTML = '<div class="lnc-card">State rules are taking a moment to load. Refresh the page to try again.</div>';
    });
  }

  var api = { normalizeConfig: normalizeConfig, checkName: checkName, findDesignator: findDesignator, restrictedHits: restrictedHits, coreName: coreName, nextSteps: nextSteps, stripMoney: stripMoney, ctaLabel: ctaLabel, ctaHref: ctaHref, availabilityLink: availabilityLink, shareQuery: shareQuery, parseQuery: parseQuery, resultHtml: resultHtml, feeShown: feeShown, mount: mount, REMOTE_CONFIG_URL: REMOTE_CONFIG_URL, BUNDLED_CONFIG_URL: BUNDLED_CONFIG_URL };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LNC = api;
  if (root.document) {
    var go = function () { Array.prototype.forEach.call(root.document.querySelectorAll("[data-llc-name-check]"), mount); };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", go); else go();
  }
})(typeof window !== "undefined" ? window : globalThis);
