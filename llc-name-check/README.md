# Free LLC Name Check (`/llc-name-check`)

Static page plus one script. No build step, no server code, no login.

| File | What it is |
| --- | --- |
| `index.html` | SEO page: title, meta, canonical, FAQ (copy from `gtm/free-tools/faq-llc-name-check.md`), FAQPage + SoftwareApplication JSON-LD. |
| `llc-name-check.js` | The tool. Name rules run in the browser; checking a name makes no network request. Mounts into any `<div data-llc-name-check>`. |
| `llc-states.json` | Bundled copy of the per-state config (fallback). |

Routing: `netlify.toml` rewrites `/llc-name-check` to `llc-name-check/index.html` ahead of the SPA catch-all.
Results are shareable: `/llc-name-check?state=MI&name=Zephyr%20Bakery&online=1&markets=1&hire=1&owners=1&food=1`
(answers are optional). The CTA opens the Formation wizard at `/#/form?state=MI&name=Zephyr%20Bakery%20LLC&src=llc-name-check`;
`applyNameHandoff()` in `/index.html` puts the state and name into the draft once and opens the Name step.

## Filing fees: one source for the name check, the wizard and the server

`llc-name-check/llc-states.json` (the bundled copy) is the only source of state filing fees:

- `node scripts/sync-state-fees.mjs` writes `filing_fee_usd` into the wizard table (`index.html` STATES.feeCents)
  and the server quote (`netlify/lib/pricing.mjs`), and `typical_yearly_cost_usd` into STATES.annualCents.
- `scripts/state-fees-parity.test.mjs` fails if the JSON, the wizard, the server quote or the name-check CTA differ.
- The name check always takes filing fees from the bundled copy (other fields may come from `llc-config`), so the
  CTA amount always equals what the wizard quotes. A filing-fee change therefore needs the bundled JSON + sync +
  a deploy; everything else can go through `llc-config`.

## Updating the state data without a production deploy

At page load the script tries, in order:

1. `https://raw.githubusercontent.com/davidandrews1980/llc-formation/llc-config/llc-name-check/llc-states.json`
   (branch **`llc-config`**, same path). This is the live source once the branch exists.
2. `/llc-name-check/llc-states.json` from the site deploy (fallback; also used if 1 is missing, slow (>3.5 s) or invalid).

To update: commit a new `llc-name-check/llc-states.json` to the `llc-config` branch (GitHub web editor is fine).
Visitors get it within about 5 minutes (GitHub raw cache). Nothing on Netlify rebuilds for production, so it costs no
production-publish credits. If Netlify branch deploys are set to "all branches", the push makes a free branch deploy;
set branch deploys to "None" or list only the branches you want to avoid even that.

First-time setup: create the `llc-config` branch from `main` (or as an orphan branch holding only this file) and commit
the JSON. Until it exists, the request in step 1 returns 404 and the bundled copy is used.

A config is accepted only if it parses and has all 51 jurisdictions (50 states + DC) with `code` and `state`;
otherwise the next source is used. Links must be `https://`.

### Format

Either the bare array Free Tools sends (`[ {state, code, ...}, ... ]`, treated as `feesVerified: false`) or:

```json
{
  "schema": 1,
  "updated": "2026-10-18",
  "feesVerified": false,
  "states": [
    {
      "state": "Michigan", "code": "MI",
      "filing_fee_usd": 50,
      "annual_report_fee_usd": 25, "annual_report_due": "Feb 15",
      "publication_required": false,
      "search_url": "https://mibusinessregistry.lara.state.mi.us/search/business",
      "deep_link_template_or_null": null,
      "api_available": false,
      "source_url": "https://...",
      "designators_allowed": ["LLC", "L.L.C.", "Limited Liability Company"],
      "restricted_words": ["Bank", "Trust", "Insurance"],
      "fee_verified": true
    }
  ]
}
```

- **`feesVerified`** (top level) is a kill switch: `false` hides every dollar amount ("See state site" + source link,
  generic CTA "File it free, pay only the state fee"). `true` (or a bare array) lets each row decide:
  - `verified: true`: fee shown, CTA "File it free, pay only the Michigan fee of $50".
  - `verified: false` (NM today): fee shown with "Confirm on the official site" and the `source_url` link; generic CTA.
- `typical_yearly_cost_usd` shows as "Yearly cost to keep it active"; `min_annual_tax_usd` (> 0) shows as
  "Minimum annual tax" (CA $800, RI $400). `publication_note` replaces the generic publication text.
- **`deep_link_template`** / **`deep_link_template_or_null`**: a URL with `{name}` that opens the state's search pre-filled (Florida today).
  It's used only when `api_available` is `false`; open-data API templates (CO, CT, NY, OR, PA) are for the v2
  live lookup and are never shown as links.
- **`restricted_words`**: any word listed gets flagged. Known words (Bank, Trust, Insurance, Corporation, Inc.,
  Incorporated, University, College, Attorney, Engineer, FBI, Treasury, Federal, Olympic) get a specific
  explanation from `WORD_RULES` in `llc-name-check.js`; other words show "Check with the state".
- Optional `slug` per state (defaults to the state name, e.g. `new-york`).

### Name endings, cadence and link rules (added 2026-10-18)

- `allowed_endings` lists the endings the state accepts, taken from its statute or SOS page. `allowed_endings_cite` and `allowed_endings_source` record where it came from. `allowed_endings_verified: false` means the state uses the generic list (Limited Liability Company, LLC, L.L.C.) and the page tells the visitor to confirm on the official site. `designators_allowed` mirrors `allowed_endings`. `scripts/sync-state-fees.mjs` copies the endings into the wizard (`const LLC_ENDINGS` in `/index.html`), so both name checks use the same list.
- `annual_report_every_years: 2` marks a biennial report. The page shows "every 2 years", and `typical_yearly_cost_usd` counts half the report fee each year. The wizard keeps the per-filing fee next to its "biennial" label.
- `registry_note` shows under the availability button (for example, TX SOSDirect charges $1 per search). `publication_status` overrides the "Required" label (AZ: "Required unless waived").
- `restricted_words_scope: "common"` means the page checks the common word list in every state and tells the visitor the state may restrict others.
- **Validation of the runtime file:** every `search_url`, `source_url`, `allowed_endings_source`, deep-link template and need-rules source must be https on a `.gov` or `.us` host, or on an allowlisted state domain (`sunbiz.org`, `njportal.com`). Endings must be letters, periods, spaces or hyphens. If the remote file fails any check, the whole file is ignored and the bundled copy is used. Fees always come from the bundled copy.

## "Do I need an LLC?" verdict

The form's second button, **Do I need an LLC?**, returns one of three verdicts from the yes/no answers. It runs in
the browser like the name check. State and name are optional for it; when they are filled in they carry into the
filing hand-off. Once any answer is Yes, the name-check result card shows the same verdict too.

- Rules live in `llc-need-rules.json`. Live copy: the `llc-config` branch, `llc-name-check/llc-need-rules.json`
  (same GitHub raw path and ~5 minute cache as `llc-states.json`, no Netlify build). The copy bundled with the
  deploy is the fallback. If neither loads, the name check still works and the verdict is left out.
- `questions`: the extra checkboxes (`liability`, `bank`, `separate`, `investors`). The name check's five
  (`online`, `markets`, `hire`, `owners`, `food`) are always there; "sole owner" is `owners` = No.
- `verdicts` are checked top to bottom. The first whose `when_any` has a Yes answer wins; the one with
  `"default": true` covers the rest. Today: `should` (owners, investors, liability, food) → `better` (separate,
  bank, hire, online, markets) → `operate`.
- `reasons` (per verdict, keyed by the answer that triggered it), `facts`, and `benefits` each need `sources`:
  keys into the top-level `sources` map, each with an https URL (IRS and SBA pages today). An entry without a
  valid source is dropped at load, so every line on the page links to where it comes from.
- `benefits` show for the verdicts in `benefits_for` when `always` is true or a `when_any` answer is Yes. A benefit
  with the same id as a listed reason is skipped.
- `disclaimer` ends with "Not a licensed attorney. Not legal advice."
- Hand-off: verdict (a) offers **Check a business name**; (b) and (c) add the filing CTA (`File it free, pay only
  the [State] fee of $X` when a verified state is chosen). Share link: `/llc-name-check?bank=1&separate=1&view=need`.

## Per-state pages later

Add `llc-name-check/<slug>/index.html` (e.g. `michigan/`) with its own title, canonical and FAQ, the same
`<div data-llc-name-check data-default-state="MI"></div>` mount and the same script. The script also reads the slug
from the path. Netlify serves the file before the SPA catch-all. Add each page to `/sitemap.xml`.

## Tests

`scripts/llc-preview1-fixes.test.mjs` covers the llc-preview-1 report fixes: flagged words, endings, biennial cost, search term, config validation and SEO.

`node --test scripts/llc-name-check.test.mjs scripts/llc-need.test.mjs scripts/state-fees-parity.test.mjs` (rule engine, config shape, share URL, CTA URL, fee display, the verdict rules and their sources, fee parity with the wizard and server).
