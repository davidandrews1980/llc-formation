# Generates privacy/, terms/, contact/ and 404.html static pages. Run: python3 scripts/static-pages.py
HEAD = '''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{title} — Pathway Formation</title><meta name="description" content="{desc}"/>
<meta name="robots" content="{robots}"/>{canon}
<link rel="icon" href="/public/favicon.svg" type="image/svg+xml"/>
<meta property="og:type" content="website"/><meta property="og:site_name" content="Pathway Formation"/>
<meta property="og:title" content="{title} — Pathway Formation"/><meta property="og:description" content="{desc}"/>
<meta property="og:image" content="https://pathwaydevs.software/public/og-1200x630.jpg"/><meta name="twitter:card" content="summary_large_image"/>
<style>body{{margin:0;background:#f3efe6;color:#161b1e;font-family:Figtree,system-ui,sans-serif;line-height:1.6}}main,header,footer{{max-width:46rem;margin:0 auto;padding:1rem}}
h1,h2{{font-family:Fraunces,Georgia,serif;font-weight:500}}a{{color:#2c4a3e}}header a{{text-decoration:none;font-weight:600;margin-right:1rem}}footer{{font-size:.85rem;color:#6b6560;border-top:1px solid #d5ccbc;margin-top:2rem}}</style>
</head><body><header><a href="/">Pathway Formation</a><a href="/form">Wizard</a><a href="/llc-fees">Fees</a><a href="/contact">Contact</a></header><main>'''
FOOT = '''</main><footer><p>Not a licensed attorney. Not legal advice.</p>
<p>Pathway Formation · Pathway Devs, a department of John Gault &amp; Sons · 3933 S Lotz Rd, Suite 219, Canton, MI 48188 · <a href="mailto:support@pathwaydevs.org">support@pathwaydevs.org</a> · © 2026 John Gault &amp; Sons</p>
<p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="/contact">Contact</a></p></footer></body></html>
'''
ID = 'John Gault &amp; Sons, 3933 S Lotz Rd, Suite 219, Canton, MI 48188, <a href="mailto:support@pathwaydevs.org">support@pathwaydevs.org</a>'

PRIVACY = f'''<h1>Privacy Policy</h1><p><em>Effective October 22, 2026.</em></p>
<p>This policy explains how Pathway Formation, a product of Pathway Devs, a department of John Gault &amp; Sons ("we", "us"), collects and uses information on pathwaydevs.software. Operator and contact: {ID}.</p>
<h2>Information we collect</h2><ul>
<li><strong>Order information you enter:</strong> company name, purpose and management type; principal office, mailing and registered agent addresses; member and organizer names, titles and ownership percentages; your name and email address; add-ons you select.</li>
<li><strong>Payment information:</strong> payments are processed by Stripe on Stripe's own page. Card details go to Stripe, not to us. We receive payment confirmation details such as amount, date and the order reference.</li>
<li><strong>Browser storage:</strong> the site stores your wizard progress and a random customer ID in your browser's local storage so your draft and orders stay available on that device.</li>
<li><strong>Analytics (only with your consent):</strong> if you click Accept on the cookie notice, Google Analytics 4 collects usage data such as pages viewed, device and approximate location. If you decline or make no choice, the analytics script is not loaded.</li>
<li><strong>Messages:</strong> anything you send to support@pathwaydevs.org.</li></ul>
<h2>How we use it</h2><ul>
<li>To prepare, review and file your formation documents and any add-ons you order.</li>
<li>To send order confirmations and service messages, and to answer questions.</li>
<li>To record payments and keep business and tax records.</li>
<li>To understand site usage and improve the site (analytics, with consent).</li></ul>
<h2>Public records</h2><p>Documents filed with a state agency, such as articles of organization, become public records under that state's law. Information you put on a filing (for example the company name, addresses, registered agent and, in some states, organizer or member names) will be available to the public through the state.</p>
<h2>Service providers we share with</h2><ul>
<li><strong>State filing agencies</strong>, to file the documents you order.</li>
<li><strong>Stripe</strong> (payments) — <a href="https://stripe.com/privacy">stripe.com/privacy</a>.</li>
<li><strong>Netlify</strong> (website hosting and order storage) — <a href="https://www.netlify.com/privacy/">netlify.com/privacy</a>.</li>
<li><strong>Our email provider</strong>, to deliver order emails.</li>
<li><strong>Google</strong> (Analytics, only with consent) — <a href="https://policies.google.com/privacy">policies.google.com/privacy</a>.</li></ul>
<p>We may also disclose information when required by law, such as in response to a valid subpoena or court order.</p>
<h2>Retention</h2><p>We keep order and payment records for as long as needed to provide the service and to meet tax and recordkeeping requirements, including the IRS guidance that records supporting income and expenses be kept for the applicable period of limitations (<a href="https://www.irs.gov/businesses/small-businesses-self-employed/how-long-should-i-keep-records">IRS: How long should I keep records?</a>).</p>
<h2>Your choices</h2><ul>
<li>You can decline analytics on the cookie notice, or clear your browser's local storage to reset your choice.</li>
<li>You can ask to see, correct or delete your information by emailing support@pathwaydevs.org. Records we must keep by law, and information already filed with a state, stay as required.</li>
<li>California residents: this policy is posted as required by the California Online Privacy Protection Act (Cal. Bus. &amp; Prof. Code §§ 22575–22579). Our site takes no special action in response to browser "Do Not Track" signals; the analytics consent choice above controls tracking.</li></ul>
<h2>Children</h2><p>The service is for people forming a business and is intended for adults. Under the Children's Online Privacy Protection Act (15 U.S.C. § 6501 et seq.), contact us if you believe a child under 13 has given us personal information and we will delete it.</p>
<h2>Security</h2><p>The site is served over HTTPS and payments are handled by Stripe. Order records are stored with our hosting provider and staff access requires a key.</p>
<h2>Changes</h2><p>We will post any changes on this page with a new effective date.</p>
<h2>Contact</h2><p>{ID}</p>'''

TERMS = f'''<h1>Terms of Service</h1><p><em>Effective October 22, 2026.</em></p>
<p>These terms govern your use of pathwaydevs.software and the Pathway Formation service, operated by John Gault &amp; Sons (Pathway Devs), {ID}. By placing an order you agree to these terms and the <a href="/privacy">Privacy Policy</a>.</p>
<h2>The service</h2><p>Pathway Formation is a document preparation and filing service. We prepare articles of organization and an operating agreement from the information you provide, file the articles with the state agency you select, and provide the optional add-ons you order (such as EIN application preparation, expedite handling, compliance reminders, the Command desk and website services).</p>
<h2>Not a law firm</h2><p>Not a licensed attorney. Not legal advice. Information on the site is general. For advice about your situation, consult a licensed attorney or tax professional.</p>
<h2>Your information</h2><p>You are responsible for the accuracy and completeness of the information you enter, including the company name, addresses, registered agent and members. You confirm that you are authorized to form the company and that the registered agent you name has agreed to serve. Name availability and acceptance of a filing are decided by the state.</p>
<h2>Fees and payment</h2><p>You pay only for the filing and the add-ons you choose. The order total shown on the Review step lists each state fee and add-on. State fees are set by each state and passed through at cost; if a state changes its fee before we file, we will contact you before filing. Payment is processed by Stripe. We file after we confirm your payment.</p>
<h2>Subscriptions</h2><p>Recurring add-ons (Command desk, website services, compliance reminders) renew at the listed price for each period until you cancel. You can cancel by emailing support@pathwaydevs.org; cancellation takes effect at the end of the current paid period.</p>
<h2>Refunds</h2><p>If you cancel before we submit your filing, we refund the order total. Once a filing is submitted, state fees are paid to the state and are refunded only if the state refunds them. Contact support@pathwaydevs.org with your order ID.</p>
<h2>EIN</h2><p>The IRS issues EINs free of charge (<a href="https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number">IRS: Get an EIN</a>). Our optional EIN add-on is a paid preparation service for the SS-4 application.</p>
<h2>Ongoing obligations</h2><p>After formation, state law may require annual or periodic reports, fees and a registered agent. These remain your responsibility; compliance reminders are a calendar service.</p>
<h2>Limitation of liability</h2><p>To the extent permitted by law, our total liability for any claim related to an order is limited to the amount you paid us for that order, excluding state fees.</p>
<h2>Governing law</h2><p>These terms are governed by the laws of the State of Michigan.</p>
<h2>Changes</h2><p>We may update these terms by posting a new version on this page. The terms in effect when you place an order apply to that order.</p>
<h2>Contact</h2><p>{ID}</p>'''

CONTACT = f'''<h1>Contact</h1>
<p>Pathway Formation is a product of Pathway Devs, a department of John Gault &amp; Sons.</p>
<p><strong>Email:</strong> <a href="mailto:support@pathwaydevs.org">support@pathwaydevs.org</a><br/>
<strong>Mail:</strong> John Gault &amp; Sons, 3933 S Lotz Rd, Suite 219, Canton, MI 48188</p>
<p>For a question about an order, include your order ID and the email you used.</p>
<p><a href="/form">Start the formation wizard</a> · <a href="/llc-fees">50-state fee table</a></p>'''

NF = '''<h1>Page not found</h1><p>That page is not here. Try the <a href="/">home page</a>, the <a href="/form">formation wizard</a> or the <a href="/llc-fees">50-state fee table</a>.</p>'''

import os
def page(path, title, desc, body, robots="index,follow"):
    canon = f'<link rel="canonical" href="https://pathwaydevs.software/{path}"/><meta property="og:url" content="https://pathwaydevs.software/{path}"/>' if path else ""
    html = HEAD.format(title=title, desc=desc, robots=robots, canon=canon) + body + FOOT
    out = f"{path}/index.html" if path else "404.html"
    if path: os.makedirs(path, exist_ok=True)
    open(out, "w").write(html)
page("privacy", "Privacy Policy", "How Pathway Formation (John Gault & Sons) collects and uses information.", PRIVACY)
page("terms", "Terms of Service", "Terms for the Pathway Formation LLC document preparation and filing service.", TERMS)
page("contact", "Contact", "Contact Pathway Formation, a product of Pathway Devs, a department of John Gault & Sons, Canton, MI.", CONTACT)
page("", "Page not found", "Page not found.", NF, robots="noindex")
