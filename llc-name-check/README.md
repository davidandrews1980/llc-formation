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

- **`feesVerified`** (top level): while `false`, every dollar amount is hidden. Fees show "See state site" with the
  `source_url` link, annual-report text has dollar figures stripped, and the CTA reads
  "File it free, pay only the state fee". Set it to `true` once the fees are checked; the CTA then reads
  "File it free, pay only the Michigan fee of $50". A single state can still be held back with `"fee_verified": false`.
- **`deep_link_template_or_null`**: a URL with `{name}` that opens the state's search pre-filled (Florida today).
  It's used only when `api_available` is `false`; open-data API templates (CO, CT, NY, OR, PA) are for the v2
  live lookup and are never shown as links.
- **`restricted_words`**: any word listed gets flagged. Known words (Bank, Trust, Insurance, Corporation, Inc.,
  Incorporated, University, College, Attorney, Engineer, FBI, Treasury, Federal, Olympic) get a specific
  explanation from `WORD_RULES` in `llc-name-check.js`; other words show "Check with the state".
- Optional `slug` per state (defaults to the state name, e.g. `new-york`).

## Per-state pages later

Add `llc-name-check/<slug>/index.html` (e.g. `michigan/`) with its own title, canonical and FAQ, the same
`<div data-llc-name-check data-default-state="MI"></div>` mount and the same script. The script also reads the slug
from the path. Netlify serves the file before the SPA catch-all. Add each page to `/sitemap.xml`.

## Tests

`node --test scripts/llc-name-check.test.mjs` (rule engine, config shape, share URL, CTA URL, fee hiding).
