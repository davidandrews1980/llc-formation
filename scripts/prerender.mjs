// Build step (netlify.toml): writes llc-fees.html and learn.html as copies of index.html
// with page-specific meta and static content in #app, so crawlers see the copy without running JS.
// The SPA script re-renders #app on load as usual.
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync("index.html", "utf8");
const STATES = JSON.parse(src.match(/const STATES = (\[.*?\]);/)[1]);
const money = c => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const year = new Date().getFullYear();
if (!src.includes('<div id="app"></div>')) { console.log("index.html already prerendered; skipping"); process.exit(0); }
function build(path, title, desc, body, robots = "index,follow") {
  const url = `https://pathwaydevs.software/${path}`;
  return src
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta name="twitter:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta name="robots" content=")[^"]*/, `$1${robots}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
    .replace('<div id="app"></div>', `<div id="app"><main class="wrap pad">${body}<p class="tiny">Not a licensed attorney. Not legal advice.</p>
<p class="tiny">Pathway Formation · Pathway Devs, a department of John Gault &amp; Sons · 3933 S Lotz Rd, Suite 219, Canton, MI 48188 · <a href="mailto:support@pathwaydevs.org">support@pathwaydevs.org</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="/contact">Contact</a></p></main></div>`);
}
function page(path, ...a) { writeFileSync(`${path}.html`, build(path, ...a)); }
page("llc-fees", `LLC Filing Fees by State (${year}) — Pathway Formation`,
  "State LLC filing fees, documents, agencies and typical processing times for all 50 states. Not a licensed attorney. Not legal advice.",
  `<h1>LLC filing fees by state (${year})</h1><p>What the state charges. Pass-through at cost.</p><table><thead><tr><th>State</th><th>Fee</th><th>Document</th><th>Agency</th><th>Processing</th></tr></thead><tbody>` +
  STATES.map(s => `<tr><td>${esc(s.name)}</td><td>${money(s.feeCents)}</td><td>${esc(s.document)}</td><td>${esc(s.agency)}</td><td>${esc(s.processing)}</td></tr>`).join("") +
  `</tbody></table>`);
page("learn", "How Pathway Formation works — Guides",
  "How we prepare and file your LLC articles and operating agreement. Not a licensed attorney. Not legal advice.",
  `<h1>How we work</h1><ul><li>We prepare your articles and operating agreement and file them with the state.</li><li>You name your own registered agent; we put it on the packet.</li><li>Expedite puts your packet at the front of our queue.</li><li>Compliance reminders keep annual reports and tax dates on your calendar.</li></ul><p><a href="/form">Start the wizard</a></p>`);
console.log("prerendered llc-fees, learn");
page("form", "Form an LLC: Formation wizard — Pathway Formation",
  "Answer a few questions to prepare your articles of organization. You pay only for the filing and the add-ons you choose.",
  `<h1>Articles of organization</h1><p>Formation wizard: state, name, office, registered agent, members, company, add-ons, review. You pay only for the filing and the add-ons you choose.</p>`, "noindex,follow");
const cheap = [...STATES].sort((a, b) => a.feeCents - b.feeCents).slice(0, 4);
// Home last: it overwrites index.html, the template for the pages above.
writeFileSync("index.html", build("", "Pathway Formation — LLC filing desk",
  "Prepare your LLC articles of organization and file in any state. You pay only for the filing and the add-ons you choose. Not a licensed attorney. Not legal advice.",
  `<h1>Make the company official. Keep the fees clear.</h1>
<p>The wizard prepares your articles. You pay the state what the state charges. We file. Plain pricing, real timelines.</p>
<p><a href="/form">Start the wizard</a> · <a href="/llc-fees">50-state fee table</a></p>
<h2>Formation, itemized</h2><ul><li>Articles of organization: free + state fee</li><li>Operating agreement: $0 through 3 pages, then $2 a page</li><li>EIN assistance: $99</li><li>Expedite handling: state + $100</li><li>Command desk: $10 / month (optional)</li><li>Compliance reminders: $99 / year</li></ul>
<h2>How it works</h2><ol><li>Answer the wizard: state, name, address, your own registered agent, members.</li><li>Pay for the filing. You pay only for the filing and the add-ons you choose.</li><li>We file. Your documents are on your desk.</li></ol>
<h2>Cheapest states to file in ${year}</h2><ul>${cheap.map(s => `<li><a href="/form?state=${s.code}">${esc(s.name)}</a>: ${money(s.feeCents)} (${esc(s.processing)})</li>`).join("")}</ul>`));
console.log("prerendered form, home");
