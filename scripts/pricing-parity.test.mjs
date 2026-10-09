// The server price table (netlify/lib/pricing.mjs) must match the page's STATES / P / quote() in index.html.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { serverQuote } from "../netlify/lib/pricing.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const pick = (re) => { const m = html.match(re); assert.ok(m, String(re)); return m[0]; };
const src = [
  pick(/const STATES = \[.*\];/),
  "const BY = Object.fromEntries(STATES.map(s => [s.code, s]));",
  pick(/const P = \{[^}]*\};/),
  pick(/function stateFee\(code, n\) \{[\s\S]*?\n\}/),
  pick(/function quote\(s\) \{[\s\S]*?\n\}/),
  "this.STATES = STATES; this.quote = quote;",
].join("\n");
const ctx = {};
vm.runInNewContext(src, ctx);

test("every state, every add-on combo: server total === page total", () => {
  let n = 0;
  for (const st of ctx.STATES) {
    for (let mask = 0; mask < 32; mask++) {
      for (const members of [1, 3, 7]) {
        const d = { stateCode: st.code, members: Array.from({ length: members }, () => ({})), ein: !!(mask & 1), expedited: !!(mask & 2), reminders: !!(mask & 4), command: !!(mask & 8), website: !!(mask & 16), oaPages: 3 + (mask % 5) };
        assert.equal(serverQuote(d).total, ctx.quote(d).due, `${st.code} mask ${mask} members ${members}`);
        n++;
      }
    }
  }
  assert.equal(n, ctx.STATES.length * 32 * 3); // 51 jurisdictions x 32 add-on combos x 3 member counts
});
