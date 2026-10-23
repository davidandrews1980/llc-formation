// Build step (netlify.toml): writes llc-fees/index.html and learn/index.html as copies of index.html
// with page-specific meta and static content in #app, so crawlers see the copy without running JS.
// The SPA script re-renders #app on load as usual.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const src = readFileSync("index.html", "utf8");
const STATES = JSON.parse(src.match(/const STATES = (\[.*?\]);/)[1]);
const money = c => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const year = new Date().getFullYear();
function page(path, title, desc, body) {
  let h = src
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1https://pathwaydevs.software/${path}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1https://pathwaydevs.software/${path}`)
    .replace('<div id="app"></div>', `<div id="app"><main class="wrap pad">${body}<p class="tiny">Not a licensed attorney. Not legal advice.</p></main></div>`);
  mkdirSync(path, { recursive: true });
  writeFileSync(`${path}/index.html`, h);
}
page("llc-fees", `LLC Filing Fees by State (${year}) — Pathway Formation`,
  "State LLC filing fees, documents, agencies and typical processing times for all 50 states. Not a licensed attorney. Not legal advice.",
  `<h1>LLC filing fees by state (${year})</h1><p>What the state charges. Pass-through at cost.</p><table><thead><tr><th>State</th><th>Fee</th><th>Document</th><th>Agency</th><th>Processing</th></tr></thead><tbody>` +
  STATES.map(s => `<tr><td>${esc(s.name)}</td><td>${money(s.feeCents)}</td><td>${esc(s.document)}</td><td>${esc(s.agency)}</td><td>${esc(s.processing)}</td></tr>`).join("") +
  `</tbody></table>`);
page("learn", "How Pathway Formation works — Guides",
  "How we prepare and file your LLC articles and operating agreement. Not a licensed attorney. Not legal advice.",
  `<h1>How we work</h1><ul><li>We prepare your articles and operating agreement and file them with the state.</li><li>You name your own registered agent; we put it on the packet.</li><li>Expedite puts your packet at the front of our queue.</li><li>Compliance reminders keep annual reports and tax dates on your calendar.</li></ul><p><a href="/form">Start the wizard</a></p>`);
console.log("prerendered llc-fees, learn");
