# Counsel SEO engine: question guides + calculators + vertical variants,
# generated into site/guides/. Every number comes from the demo-world
# BASELINE constants (src/engine/insights.ts) so the worked examples are
# the same figures the app itself shows. House rules: methods named in
# plain words, no em dashes, honest refusals stated, not tax advice.
import os, html, datetime

OUT = os.path.join(os.path.dirname(__file__), "..", "site", "guides")
SITE = "https://counsel-site.pages.dev"
APP = "https://apps.apple.com/us/app/counsel-honest-ai-cfo/id6802312256"
DEMO = "https://counsel-demo.pages.dev"
TODAY = datetime.date.today().isoformat()

# demo-world monthly figures, mirrored from insights.ts BASELINE
WORLDS = {
    "restaurant": dict(name="Ember & Oak", kind="a full-service restaurant",
                       profit=4100, worst=1900, cash=22800, burn=6000, margin=29),
    "landscaping": dict(name="GreenLine Yards", kind="a landscaping crew",
                        profit=5200, worst=2400, cash=31500, burn=5700, margin=42),
    "etsy": dict(name="Kiln & Co.", kind="a ceramics studio selling online",
                 profit=3050, worst=2050, cash=48300, burn=6900, margin=34),
    "musician": dict(name="The Wren Sessions", kind="a working musician",
                     profit=1450, worst=300, cash=9400, burn=2250, margin=58),
}

CSS = """
:root{--paper:#0f1511;--card:#171f19;--ink:#ecf1e8;--muted:#b7c2b8;--faint:#75827a;
--line:#232d25;--brass:#cdae7e;--accent:#c9f36a;--serif:"Fraunces",Georgia,serif;
--sans:"Inter",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font:16px/1.7 var(--sans);-webkit-font-smoothing:antialiased}
main{max-width:680px;margin:0 auto;padding:32px 20px 80px}
nav.crumb{font:12px var(--mono);color:var(--faint);margin-bottom:26px}
nav.crumb a{color:var(--brass);text-decoration:none}
h1{font-family:var(--serif);font-weight:500;font-size:clamp(28px,5vw,40px);line-height:1.15;
letter-spacing:-.01em;margin-bottom:14px}
.lede{font-size:17px;color:var(--muted);margin-bottom:28px}
h2{font-family:var(--serif);font-weight:500;font-size:22px;margin:34px 0 10px}
p{margin:12px 0;color:var(--muted)} p b,li b{color:var(--ink)}
ul,ol{margin:12px 0 12px 22px;color:var(--muted)} li{margin:6px 0}
.method{border-left:3px solid var(--brass);background:var(--card);padding:14px 16px;
border-radius:0 10px 10px 0;margin:20px 0}
.method .k{font:10px var(--mono);letter-spacing:.18em;color:var(--brass);text-transform:uppercase}
.method p{color:var(--ink);margin:8px 0 0}
.example{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:20px 0}
.example .k{font:10px var(--mono);letter-spacing:.18em;color:var(--accent);text-transform:uppercase}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
th{font:10px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
td{color:var(--muted)} td.num{font-family:var(--mono);color:var(--ink)}
.calc{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:22px 0}
.calc label{display:block;font:11px var(--mono);letter-spacing:.12em;text-transform:uppercase;
color:var(--faint);margin:12px 0 5px}
.calc input{width:100%;background:#0b100c;border:1px solid var(--line);border-radius:8px;
color:var(--ink);font:15px var(--mono);padding:10px 12px}
.calc button{margin-top:16px;background:var(--accent);color:#17240a;border:none;border-radius:100px;
padding:12px 22px;font:600 14px var(--sans);cursor:pointer}
.result{margin-top:16px;padding:14px;border-radius:10px;background:#0b100c;display:none}
.result .big{font-family:var(--serif);font-size:30px;color:var(--ink)}
.result .sub{font-size:13px;color:var(--muted);margin-top:4px}
.honest{font-size:13px;color:var(--faint);border-top:1px dashed var(--line);margin-top:26px;padding-top:12px}
.cta{background:linear-gradient(135deg,#152219,#101a13);border:1px solid #2a3a2c;border-radius:14px;
padding:20px;margin:30px 0;text-align:center}
.cta .t{font-family:var(--serif);font-size:19px;margin-bottom:6px}
.cta p{font-size:14px}
.cta a.btn{display:inline-block;margin-top:12px;background:var(--accent);color:#17240a;
border-radius:100px;padding:12px 24px;font:600 14px var(--sans);text-decoration:none}
.cta a.ghost{display:inline-block;margin-top:12px;margin-left:10px;color:var(--muted);
border:1px solid var(--line);border-radius:100px;padding:12px 24px;font:600 14px var(--sans);text-decoration:none}
.related{margin-top:34px}
.related a{display:block;color:var(--brass);text-decoration:none;padding:8px 0;
border-bottom:1px solid var(--line);font-size:15px}
footer{max-width:680px;margin:0 auto;padding:20px;font:12px var(--mono);color:var(--faint)}
footer a{color:var(--brass);text-decoration:none}
a{color:var(--brass)}
"""

def cta(kind="app"):
    return f"""
<div class="cta">
  <div class="t">Counsel does this math on your real numbers</div>
  <p>Connect Square, Stripe, Shopify, Etsy, QuickBooks, or your bank. Every answer
  carries a receipt: the method, the sample size, and the confidence. When the math
  is not conclusive, it says so.</p>
  <a class="btn" href="{APP}">Get Counsel on the App Store</a>
  <a class="ghost" href="{DEMO}">Try the web demo</a>
</div>"""

def page(slug, title, desc, h1, lede, body, faqs=None, related=None):
    faq_ld = ""
    faq_html = ""
    if faqs:
        items = ",".join(
            '{"@type":"Question","name":%s,"acceptedAnswer":{"@type":"Answer","text":%s}}'
            % (jstr(q), jstr(a)) for q, a in faqs)
        faq_ld = f'<script type="application/ld+json">{{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{items}]}}</script>'
        faq_html = "<h2>Common questions</h2>" + "".join(
            f"<p><b>{html.escape(q)}</b><br>{html.escape(a)}</p>" for q, a in faqs)
    rel_html = ""
    if related:
        rel_html = '<div class="related"><h2>Keep reading</h2>' + "".join(
            f'<a href="/guides/{r}">{GUIDE_TITLES[r]}</a>' for r in related) + "</div>"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{SITE}/guides/{slug}">
<meta name="apple-itunes-app" content="app-id=6802312256">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="{SITE}/guides/{slug}">
<meta property="og:image" content="{SITE}/guides/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{DEMO}/icon-192.png">
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{{"@type":"ListItem","position":1,"name":"Counsel","item":"{SITE}/"}},{{"@type":"ListItem","position":2,"name":"Guides","item":"{SITE}/guides/"}},{{"@type":"ListItem","position":3,"name":{jstr(h1)}}}]}}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"Article","headline":{jstr(h1)},"datePublished":"{TODAY}","author":{{"@type":"Person","name":"Brandon Grutkowski"}},"publisher":{{"@type":"Organization","name":"Counsel"}}}}</script>
{faq_ld}
<style>{CSS}</style>
</head>
<body>
<main>
<nav class="crumb"><a href="/">Counsel</a> / <a href="/guides/">guides</a> / {slug}</nav>
<h1>{h1}</h1>
<p class="lede">{lede}</p>
{body}
{faq_html}
{cta()}
{rel_html}
<p class="honest">Counsel's rule, applied to its own content: every figure above is computed,
sourced from our demo businesses or your own inputs, never invented. This is cash math,
not tax or legal advice. Written and maintained by the founder.</p>
</main>
<footer>Counsel · the honest AI CFO for small business · <a href="/">home</a> · <a href="/guides/">all guides</a> · <a href="{APP}">App Store</a></footer>
</body>
</html>"""

def jstr(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

def world_table(metric):
    rows = ""
    for w in WORLDS.values():
        if metric == "pay":
            rows += f'<tr><td>{w["name"]} ({w["kind"]})</td><td class="num">${w["profit"]:,}/mo</td><td class="num">${w["worst"]:,}</td></tr>'
        else:
            months = w["cash"] / w["burn"]
            rows += f'<tr><td>{w["name"]} ({w["kind"]})</td><td class="num">${w["cash"]:,}</td><td class="num">${w["burn"]:,}/mo</td><td class="num">{months:.1f} mo</td></tr>'
    if metric == "pay":
        head = "<tr><th>Demo business</th><th>Median monthly profit</th><th>Worst honest month</th></tr>"
    else:
        head = "<tr><th>Demo business</th><th>Cash</th><th>Burn</th><th>Runway</th></tr>"
    return f"<table>{head}{rows}</table>"

GUIDE_TITLES = {
    "how-much-to-pay-yourself": "How much should you pay yourself from your small business?",
    "cash-runway": "How many months of cash does your business actually have?",
    "revenue-drop-real-or-noise": "Revenue dipped. Is it real, or just a slow week?",
    "can-i-afford-to-hire": "Can your business actually afford that hire?",
    "should-i-raise-prices": "What did your last price change actually do to sales?",
    "which-invoice-to-chase": "Which late invoice should you chase first?",
    "pay-yourself-calculator": "Pay yourself calculator: median and worst honest month",
    "runway-calculator": "Cash runway calculator with a thin-months warning",
    "hire-calculator": "Hire affordability calculator with a slow-month stress test",
}

PAGES = {}

# ---------------- core guides ----------------
PAGES["how-much-to-pay-yourself"] = page(
    "how-much-to-pay-yourself",
    "How Much Should You Pay Yourself? The Honest Math | Counsel",
    "The median-and-worst-month method for setting an owner draw that survives slow months, with worked examples from four real business types.",
    GUIDE_TITLES["how-much-to-pay-yourself"],
    "Most owners pick a number by feel, then panic in a slow month. Here is the method that survives the slow month, computable by hand in ten minutes.",
    f"""
<h2>Why the average lies to you</h2>
<p>If your last six months of profit were $2,000, $2,200, $1,900, $2,100, $9,000, and $2,300,
your average is about $3,250. Pay yourself off that number and five months out of six you are
draining cash. One great month drags the average up; your bills arrive every month regardless.</p>
<div class="method"><span class="k">The method, plainly</span>
<p>Take your last 6 to 8 months of profit after every cost. Use the <b>median</b>, the middle
value, as your ceiling. Then look at your <b>worst honest month</b>, the lowest real month with
no excuses attached. A draw is safe when the worst month could still cover it, or when your
cash cushion absorbs the gap without touching your runway floor.</p></div>
<h2>Worked examples from four real business shapes</h2>
<p>These are the demo businesses inside Counsel, and the same numbers the app shows:</p>
{world_table("pay")}
<p>Notice the spread: the musician's median is $1,450 but the worst month is $300. That gap is
the whole story. A draw set at the median without seeing the floor is a draw that breaks in
February.</p>
<h2>Do it by hand</h2>
<ol>
<li>Export your last 6 to 8 months of deposits and expenses (your POS or bank has this).</li>
<li>Profit per month = deposits minus every expense, including the ones you forget: software, fees, quarterly bills divided by three.</li>
<li>Sort the months. Middle value = median. Lowest = worst honest month.</li>
<li>Set the draw at or below the median. Know exactly how a worst month gets covered before it happens.</li>
</ol>
<p>Or use the <a href="/guides/pay-yourself-calculator">pay yourself calculator</a> and let it sort for you.</p>""",
    faqs=[
        ("What if my income is completely irregular?",
         "Irregular income is exactly why the median beats the average. The median ignores your outlier months in both directions. If even the median feels unstable, widen the window to 12 months and let the worst honest month set the draw."),
        ("Is the owner draw the same as a salary?",
         "No. This is the cash-math layer: what the business can hand you without starving itself. How you structure that payment for taxes is a separate question for your accountant."),
        ("How often should I recompute it?",
         "Monthly is plenty. The number should be boring; if it swings a lot month to month, that swing is the finding."),
    ],
    related=["pay-yourself-calculator", "cash-runway", "can-i-afford-to-hire"])

PAGES["cash-runway"] = page(
    "cash-runway",
    "Cash Runway for Small Business: The Honest Calculation | Counsel",
    "Runway is cash divided by burn, but honest runway accounts for burn that varies. How to compute yours and where the four-month line comes from.",
    GUIDE_TITLES["cash-runway"],
    "Runway is the one number that turns money stress into a plan: how many months you survive if revenue stopped tomorrow. It will not stop tomorrow. Compute it anyway.",
    f"""
<div class="method"><span class="k">The method, plainly</span>
<p><b>Runway = cash on hand ÷ monthly burn.</b> Burn is every dollar that leaves in a month:
rent, payroll, subscriptions, supplies, loan payments, your own draw. The honest version uses
your highest recent burn month, not your best one, because runway built on your cheapest month
is a story, not a plan.</p></div>
<h2>The four demo businesses</h2>
{world_table("runway")}
<p>The restaurant is at 3.8 months. That is not an emergency, but it is under the four-month
line where a watchlist should be lit: one slow season plus one surprise repair and choices
start being made for you. The ceramics studio at 7 months can think in seasons instead of weeks.</p>
<h2>Why four months is the line</h2>
<p>Not magic, just arithmetic: most small-business shocks (a slow season, an equipment failure,
a late-paying anchor client) take one to two months to hit fully and one to two months to fix.
Four months means a shock and its repair fit inside your cash without borrowing at the worst
possible moment.</p>
<h2>What to do when runway is thin</h2>
<ul>
<li><b>Under 3 months:</b> act this week. Chase every late invoice, pause every subscription you cannot name the value of, and move your draw to the worst-month floor.</li>
<li><b>3 to 4 months:</b> watch weekly. No new fixed costs. Anything that turns inventory or receivables into cash moves first.</li>
<li><b>Over 6 months:</b> your risk flips. The question stops being survival and becomes whether idle cash should be working: equipment, inventory for the season, or a hire you have rehearsed.</li>
</ul>
<p>The <a href="/guides/runway-calculator">runway calculator</a> does this with your numbers, including the thin-months warning.</p>""",
    faqs=[
        ("Should my own pay count in the burn?",
         "Yes. Runway that only works because you stopped paying yourself is not runway, it is a countdown with extra steps."),
        ("Is more runway always better?",
         "No. Past six months or so, cash sitting idle has a cost too. The point of the number is to know which side of the line you are on, so the rest of your decisions have a floor under them."),
    ],
    related=["runway-calculator", "how-much-to-pay-yourself", "can-i-afford-to-hire"])

PAGES["revenue-drop-real-or-noise"] = page(
    "revenue-drop-real-or-noise",
    "Revenue Dropped: Real Problem or Normal Noise? | Counsel",
    "How to tell a real revenue change from ordinary day-to-day swing, using weekday norms and the change-point logic analysts use, in plain words.",
    GUIDE_TITLES["revenue-drop-real-or-noise"],
    "Every business has slow Tuesdays. The expensive mistake is reacting to noise like it is a trend, or ignoring a trend because it looks like noise. There is real math for telling them apart.",
    """
<h2>Step one: compare like with like</h2>
<p>A Tuesday can only be judged against Tuesdays. Compute the typical value for each weekday
from the last couple of months (the median again, not the average), and how much that weekday
normally swings. A $700 Tuesday against a $900 typical Tuesday with normal swings of $250 is
a shrug, not a signal.</p>
<div class="method"><span class="k">The method, plainly</span>
<p>Analysts call the serious version <b>change-point detection</b>: compare the stretch of days
before a suspected change with the stretch after, and test whether the difference is bigger
than your normal day-to-day variation. If twenty days after March 4 average 32% below the
twenty days before, and your normal swing is a fraction of that, the drop is real with high
confidence. If the difference sits inside your usual chop, the honest verdict is
<b>not ready to call</b>.</p></div>
<h2>The three-question triage</h2>
<ol>
<li><b>Is it one day or a run of days?</b> One bad day means nothing. Six days in a row under their weekday norms is a streak worth watching even if no single day broke a record.</li>
<li><b>Did the mix change or the volume?</b> Fewer sales, smaller baskets, and lower prices are three different diseases with three different treatments. Split revenue into those three drivers before acting.</li>
<li><b>Did anything real happen?</b> A menu change, a road closure, a platform fee change on a specific date turns a statistics question into a story question. Check the calendar before the math.</li>
</ol>
<h2>What honest software should say</h2>
<p>When the evidence is thin, the only correct answer is that there is not enough evidence yet.
Any tool (or consultant) that hands you a confident story for every wiggle is manufacturing
certainty you will pay for later. Waiting three more days for a clear verdict is cheaper than
reacting to noise today.</p>""",
    faqs=[
        ("How many days until a drop is confirmable?",
         "It depends on how noisy your business is. A steady shop can confirm a real shift in a week or two; a spiky one needs three or four. The math widens with your noise, which is exactly what it should do."),
        ("What is a change-point in plain words?",
         "The day your numbers stopped behaving like the old numbers and started behaving like new ones. Not a dip, a regime change."),
    ],
    related=["should-i-raise-prices", "cash-runway", "which-invoice-to-chase"])

PAGES["can-i-afford-to-hire"] = page(
    "can-i-afford-to-hire",
    "Can You Afford to Hire? The Slow-Month Stress Test | Counsel",
    "The cushion math for a first or next hire: monthly cost against median profit, stress-tested against your real slow months instead of your average.",
    GUIDE_TITLES["can-i-afford-to-hire"],
    "The average month says yes. The question is what February says.",
    """
<div class="method"><span class="k">The method, plainly</span>
<p>Take your median monthly profit and subtract the full monthly cost of the hire: wage,
taxes, and the software seat or gear that rides along. What is left is your <b>cushion</b>.
Then re-run the same subtraction on your <b>worst honest month</b>. If the cushion survives
the worst month, the hire is affordable. If it survives only the median, the hire is
affordable on average, and average is where hiring mistakes live.</p></div>
<h2>A worked example</h2>
<div class="example"><span class="k">From the demo ceramics studio</span>
<p>Kiln &amp; Co. clears a median $3,050 a month with a worst honest month of $2,050. A part-time
hire at $1,400 all-in leaves a $1,650 cushion in a normal month, and $650 in a bad one. That
is a real yes, with a visible floor. If the worst month had been $1,200, the same hire would
be a coin flip wearing a yes costume.</p></div>
<h2>Three honest add-ons</h2>
<ul>
<li><b>Ramp time is a cost.</b> Budget 4 to 8 weeks where the hire costs full price and produces half value. Your cushion pays for that gap.</li>
<li><b>Revenue swing belongs in the test.</b> If your months swing 30%, stress the cushion at median minus 30%, not just at the historical worst.</li>
<li><b>Rehearse it before you sign it.</b> Stack the hire against your actual history: how many of your last 12 months would have carried it? Eight of twelve is a different answer than twelve of twelve, and both are better known in advance.</li>
</ul>
<p>The <a href="/guides/hire-calculator">hire calculator</a> runs this exact test with your numbers.</p>""",
    faqs=[
        ("Should I hire before or after the growth?",
         "The honest framing: a hire is affordable when your existing months can carry it, and strategic when the work it unlocks is already being turned away. You want both true at once, not either alone."),
        ("What about contractors instead?",
         "Same math, better exit. A contractor converts the fixed cost into a variable one, which effectively raises your worst-month cushion in exchange for a higher hourly price."),
    ],
    related=["hire-calculator", "how-much-to-pay-yourself", "cash-runway"])

PAGES["should-i-raise-prices"] = page(
    "should-i-raise-prices",
    "Did Your Price Change Actually Work? Elasticity in Plain Words | Counsel",
    "How to measure what a price change did to demand using your own before-and-after windows, and why an honest analysis sometimes says it cannot tell.",
    GUIDE_TITLES["should-i-raise-prices"],
    "You raised the price. Revenue looks fine. But do you actually know what happened, or does it just feel fine? This one is measurable, and the measurement has a trap in it.",
    """
<div class="method"><span class="k">The method, plainly</span>
<p>Compare a clean window before the change with a clean window after, 28 days each if you can.
Compute units per day in both windows. The <b>elasticity</b> is the percent change in units
divided by the percent change in price. If a +10% price cost you 4% of unit demand, elasticity
is about -0.4 and the change made you money. If it cost you 15%, the price ate its own gain.</p></div>
<h2>The trap: small samples lie confidently</h2>
<p>Here is the part most write-ups skip. With a few dozen sales per window, the measured number
comes with a wide uncertainty band. If that band includes zero, the honest conclusion is that
you <b>cannot rule out no effect</b>, and any projected gain built on the point estimate is a
story. We enforce this in our own product: Counsel's price card computed an impressive
elasticity on demo data, its own confidence interval included zero, and so the headline reads
"not conclusive" instead. If a tool never tells you that, it is not measuring, it is flattering.</p>
<h2>Run a fair test</h2>
<ul>
<li>Change one product family at a time, so the comparison is clean.</li>
<li>Avoid windows containing a holiday, a closure, or a promotion on either side.</li>
<li>Judge units, not revenue, first. Revenue confounds the price with the demand response.</li>
<li>Decide the judgment date before you start, then actually wait for it.</li>
</ul>""",
    faqs=[
        ("What is a good elasticity number?",
         "For most small businesses anything between 0 and about -1 means demand held well enough that the raise paid. Steeper than -1 means units fell faster than price rose. But the honest answer depends on the uncertainty band around your measurement, not the point number alone."),
        ("How long before I can judge a price change?",
         "Two clean comparable windows. For most shops that is 4 to 8 weeks total. Judging in week one is how good changes get reverted and bad ones get kept."),
    ],
    related=["revenue-drop-real-or-noise", "how-much-to-pay-yourself", "pay-yourself-calculator"])

PAGES["which-invoice-to-chase"] = page(
    "which-invoice-to-chase",
    "Which Late Invoice Should You Chase First? | Counsel",
    "A five-minute priority method for late receivables: age times amount, the polite escalation ladder, and when a client becomes a cash-flow risk.",
    GUIDE_TITLES["which-invoice-to-chase"],
    "Chasing money is unpaid work, so it should be aimed. Not at the biggest invoice, and not at the oldest one. At the one where age and amount multiply into the biggest risk.",
    """
<div class="method"><span class="k">The method, plainly</span>
<p>Score each open invoice as <b>amount × weeks late</b>. A $1,180 invoice at 19 days late
outranks a $2,000 invoice at 4 days, because risk compounds with age: the odds of an invoice
paying drop meaningfully once it crosses 30 days, and again at 60. Chase the top score first,
and always chase before the 30-day cliff, not after it.</p></div>
<h2>The escalation ladder</h2>
<ol>
<li><b>Day 3 past due:</b> a friendly re-send with the invoice attached. Most lateness is disorganization, not refusal.</li>
<li><b>Day 10:</b> a direct note naming the amount and the date, plus the easiest possible way to pay. Remove every step between them and the payment.</li>
<li><b>Day 20:</b> a phone call. Voices collect what emails cannot.</li>
<li><b>Day 30:</b> new terms for this client going forward: deposit up front or card on file. This is not punishment, it is pricing their risk.</li>
</ol>
<h2>The pattern matters more than the invoice</h2>
<p>One late invoice is weather. The same client late three times is climate: you are functioning
as their line of credit, interest-free. Price it, require deposits, or plan their replacement.
Your receivables list, sorted by that score once a week, is one of the highest-paid five
minutes in your business.</p>""",
    faqs=[
        ("Should I charge late fees?",
         "A stated late fee changes behavior even when you waive it. What it mostly buys you is a reason for the day-10 email to exist. Deposits and card-on-file work better than fees for repeat offenders."),
    ],
    related=["cash-runway", "revenue-drop-real-or-noise", "runway-calculator"])

# ---------------- calculators ----------------
CALC_JS = {
"pay-yourself-calculator": """
function run(){
  var raw=document.getElementById('months').value.split(/[\\s,]+/).filter(Boolean).map(Number).filter(function(x){return !isNaN(x)});
  if(raw.length<3){alert('Enter at least 3 monthly profit numbers');return}
  var s=raw.slice().sort(function(a,b){return a-b});
  var med=s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;
  var worst=s[0];
  document.getElementById('r-med').textContent='$'+Math.round(med).toLocaleString();
  document.getElementById('r-worst').textContent='$'+Math.round(worst).toLocaleString();
  var verdict = worst>=med*0.6 ? 'Steady months. A draw at the median is defensible; the worst month is your floor.'
    : 'Wide swing between median and worst. Set the draw nearer the worst honest month, or hold cash to bridge the gap.';
  document.getElementById('r-verdict').textContent=verdict;
  document.getElementById('res').style.display='block';
}
""",
"runway-calculator": """
function run(){
  var cash=Number(document.getElementById('cash').value), burn=Number(document.getElementById('burn').value);
  if(!(cash>0)||!(burn>0)){alert('Enter cash on hand and monthly burn');return}
  var m=cash/burn;
  document.getElementById('r-months').textContent=m.toFixed(1)+' months';
  var v = m<3 ? 'Thin. Act this week: chase receivables, cut unnamed subscriptions, floor the draw.'
    : m<4 ? 'Under the four-month line. Watch weekly and add no new fixed costs.'
    : m<6 ? 'Workable. A shock and its repair fit inside your cash.'
    : 'Comfortable. The question flips to whether idle cash should be working.';
  document.getElementById('r-verdict').textContent=v;
  document.getElementById('res').style.display='block';
}
""",
"hire-calculator": """
function run(){
  var p=Number(document.getElementById('profit').value), c=Number(document.getElementById('cost').value),
      sw=Number(document.getElementById('swing').value||0);
  if(!(p>0)||!(c>0)){alert('Enter median monthly profit and monthly hire cost');return}
  var normal=p-c, slow=p*(1-sw/100)-c;
  document.getElementById('r-normal').textContent='$'+Math.round(normal).toLocaleString();
  document.getElementById('r-slow').textContent='$'+Math.round(slow).toLocaleString();
  var v = slow>0 ? 'The hire survives your slow months. That is a real yes with a visible floor.'
    : normal>0 ? 'Affordable on average only. Average is where hiring mistakes live: build cash first or start with a contractor.'
    : 'The hire costs more than a normal month clears. Not yet.';
  document.getElementById('r-verdict').textContent=v;
  document.getElementById('res').style.display='block';
}
""",
}

def calc_page(slug, title, desc, h1, lede, inputs_html, results_html, method_html, related):
    body = f"""
{method_html}
<div class="calc">
{inputs_html}
<button onclick="run()">Compute</button>
<div class="result" id="res">{results_html}</div>
</div>
<p>This calculator runs entirely in your browser with the numbers you type; nothing is sent
anywhere. The app computes the same answer from your actual deposits, which is both lazier
and more honest than typing.</p>"""
    p = page(slug, title, desc, h1, lede, body, related=related)
    return p.replace("</main>", f"</main>\n<script>{CALC_JS[slug]}</script>")

PAGES["pay-yourself-calculator"] = calc_page(
    "pay-yourself-calculator",
    "Pay Yourself Calculator for Small Business Owners | Counsel",
    "Type your recent monthly profits; get your median, your worst honest month, and a plain verdict on a safe owner draw. Runs in your browser.",
    GUIDE_TITLES["pay-yourself-calculator"],
    "Type your last 6 to 8 months of profit after costs, separated by spaces or commas. The middle value and the floor tell you what a safe draw looks like.",
    """<label for="months">Monthly profits (e.g. 4100 3800 1900 4400 3950 4200)</label>
<input id="months" inputmode="numeric" placeholder="4100 3800 1900 4400 3950 4200">""",
    """<div class="big" id="r-med"></div><div class="sub">median month · your ceiling</div>
<div class="big" id="r-worst" style="margin-top:10px"></div><div class="sub">worst honest month · your floor</div>
<p class="sub" id="r-verdict" style="margin-top:10px"></p>""",
    """<div class="method"><span class="k">What it computes</span>
<p>The median of the months you enter (the middle value, immune to one great month) and the
worst honest month. The full reasoning lives in the
<a href="/guides/how-much-to-pay-yourself">pay yourself guide</a>.</p></div>""",
    ["how-much-to-pay-yourself", "runway-calculator", "hire-calculator"])

PAGES["runway-calculator"] = calc_page(
    "runway-calculator",
    "Cash Runway Calculator for Small Business | Counsel",
    "Cash on hand divided by monthly burn, with the four-month watch line explained. Runs in your browser; nothing is uploaded.",
    GUIDE_TITLES["runway-calculator"],
    "Two numbers in, one number out, and a verdict calibrated to the four-month line.",
    """<label for="cash">Cash on hand ($)</label>
<input id="cash" inputmode="numeric" placeholder="22800">
<label for="burn">Monthly burn, everything included ($)</label>
<input id="burn" inputmode="numeric" placeholder="6000">""",
    """<div class="big" id="r-months"></div><div class="sub">of runway at current burn</div>
<p class="sub" id="r-verdict" style="margin-top:10px"></p>""",
    """<div class="method"><span class="k">What it computes</span>
<p>Runway = cash ÷ burn. Use your highest recent burn month, not your cheapest. Why four
months is the line: the <a href="/guides/cash-runway">runway guide</a>.</p></div>""",
    ["cash-runway", "pay-yourself-calculator", "hire-calculator"])

PAGES["hire-calculator"] = calc_page(
    "hire-calculator",
    "Can I Afford to Hire? Calculator with Slow-Month Stress Test | Counsel",
    "Median profit minus full hire cost, stress-tested at your real revenue swing. The cushion in a normal month and in a bad one, in your browser.",
    GUIDE_TITLES["hire-calculator"],
    "The average month always says yes. This runs the February test too.",
    """<label for="profit">Median monthly profit ($)</label>
<input id="profit" inputmode="numeric" placeholder="3050">
<label for="cost">Monthly cost of the hire, all-in ($)</label>
<input id="cost" inputmode="numeric" placeholder="1400">
<label for="swing">How much do slow months dip? (%)</label>
<input id="swing" inputmode="numeric" placeholder="30">""",
    """<div class="big" id="r-normal"></div><div class="sub">cushion in a normal month</div>
<div class="big" id="r-slow" style="margin-top:10px"></div><div class="sub">cushion in a slow month</div>
<p class="sub" id="r-verdict" style="margin-top:10px"></p>""",
    """<div class="method"><span class="k">What it computes</span>
<p>Cushion = median profit minus the hire's full monthly cost, then again with profit reduced
by your slow-month swing. The reasoning, with a worked example:
<a href="/guides/can-i-afford-to-hire">the hire guide</a>.</p></div>""",
    ["can-i-afford-to-hire", "pay-yourself-calculator", "runway-calculator"])

# ---------------- vertical variants ----------------
VERT_SPECIFIC = {}
VERT_SPECIFIC["restaurant"] = ("Seasonality means the median should be computed across a full year when you can; a summer-only median flatters a patio. Watch the margin line as hard as the profit line, because plate-cost creep hides inside good revenue months, and the watchlist should light up the moment margin crosses your floor, not the quarter you notice it.")
VERT_SPECIFIC["landscaping"] = ("Your median only means something computed across the whole season cycle: a June median is a fantasy in January. Trades businesses should hold a bigger cash cushion than the four-month default, because your equipment can convert a good month into a bad one with a single hydraulic failure.")
VERT_SPECIFIC["etsy"] = ("Compute profit after platform fees, payment fees, shipping, and materials, not after the ones you remember. Makers systematically overdraw because material buys are lumpy: the month you bought no clay looks richer than it is. A 12-month median smooths the lumps.")
VERT_SPECIFIC["musician"] = ("The $1,450 to $300 spread above is the honest picture of creative income: the floor is the number that plans your life. Set fixed personal costs against the floor, let everything above it accumulate toward runway, and the feast months stop being a trap.")

VERTICALS = {
    "restaurant": ("restaurant owners", "Plate costs creep, weekends carry weekdays, and one slow season eats a year of margin. The math below uses Ember & Oak, the demo restaurant inside Counsel."),
    "landscaping": ("landscaping and trades businesses", "Feast in June, famine in January, and gear that breaks in between. The math below uses GreenLine Yards, the demo crew inside Counsel."),
    "etsy": ("Etsy sellers and makers", "Fees nibble every order, materials are bought in lumps, and December pays for March. The math below uses Kiln & Co., the demo studio inside Counsel."),
    "musician": ("working musicians", "Gig money, royalties, merch, and teaching, none of it on a schedule. The math below uses The Wren Sessions, the demo musician inside Counsel."),
}

for vslug, (aud, vintro) in VERTICALS.items():
    w = WORLDS[vslug]
    months = w["cash"] / w["burn"]
    slug = f"pay-yourself-{vslug}"
    GUIDE_TITLES[slug] = f"How much should {aud.split(' and ')[0]} pay themselves?"
    PAGES[slug] = page(
        slug,
        f"How Much Should {aud.title()} Pay Themselves? | Counsel",
        f"The median-and-worst-month draw method applied to {aud}, with a worked example: ${w['profit']:,} median, ${w['worst']:,} worst month, {w['margin']}% margin.",
        f"How much should {aud} pay themselves?",
        vintro,
        f"""
<div class="example"><span class="k">The worked example</span>
<p>{w['name']}, {w['kind']}, runs a <b>{w['margin']}% margin</b> and clears a median
<b>${w['profit']:,} a month</b> after every cost. Its worst honest month is
<b>${w['worst']:,}</b>. With ${w['cash']:,} in the bank against ${w['burn']:,} of monthly burn,
it holds <b>{months:.1f} months of runway</b>.</p>
<p>The safe draw sits at or below the ${w['profit']:,} median, with a written answer for how a
${w['worst']:,} month gets bridged. A draw set above the median here would quietly spend the
runway one month at a time.</p></div>
<div class="method"><span class="k">The method, plainly</span>
<p>Median of the last 6 to 8 months of profit as the ceiling; worst honest month as the floor;
cash runway as the referee. The full method, including how to compute it by hand in ten
minutes, is in the <a href="/guides/how-much-to-pay-yourself">main pay-yourself guide</a>, and
the <a href="/guides/pay-yourself-calculator">calculator</a> sorts your months for you.</p></div>
<h2>What is specific to {aud}</h2>
<p>{VERT_SPECIFIC[vslug]}</p>""",
        related=["how-much-to-pay-yourself", "pay-yourself-calculator", "cash-runway"])

RUNWAY_SPECIFIC = {
  "restaurant": "Restaurant burn is lumpy: rent and payroll are fixed but food cost rides revenue, so compute burn from your heaviest recent month. A slow January against December burn is how 3.8 months becomes 2 in practice.",
  "landscaping": "Seasonal businesses should read runway at the season trough, not the annual average. The question is never whether June survives; it is whether the cash on October 1 carries the crew to March.",
  "etsy": "Inventory is cash wearing a costume. A materials buy converts runway into shelf stock, so count planned buys as burn in the month you place them, and remember December revenue lands after December bills.",
  "musician": "With a $2,250 monthly burn against $9,400 of cash, the demo musician holds about four months, and that is the healthy version of creative income. Irregular earners should target six months, because the gap between paydays is the business model.",
}
for vslug, (aud, _vi) in VERTICALS.items():
    w = WORLDS[vslug]
    months = w["cash"] / w["burn"]
    slug = f"cash-runway-{vslug}"
    GUIDE_TITLES[slug] = f"Cash runway for {aud.split(' and ')[0]}: how many months do you really have?"
    PAGES[slug] = page(
        slug,
        f"Cash Runway for {aud.title()}: The Honest Number | Counsel",
        f"Runway math applied to {aud}: a worked example with ${w['cash']:,} cash against ${w['burn']:,} monthly burn, and the four-month watch line explained.",
        f"Cash runway for {aud}: how many months do you really have?",
        f"Runway turns money stress into a plan. For {aud} the calculation has one twist worth knowing.",
        f"""
<div class="example"><span class="k">The worked example</span>
<p>{w['name']}, {w['kind']}, holds <b>${w['cash']:,}</b> in cash against a monthly burn of
<b>${w['burn']:,}</b>, everything included: rent, gear, software, and the owner draw. That is
<b>{months:.1f} months of runway</b> at current burn. {'Under the four-month line, so the watchlist stays lit.' if months < 4 else 'Above the four-month line, which buys the freedom to think in seasons instead of weeks.'}</p></div>
<div class="method"><span class="k">The method, plainly</span>
<p>Runway = cash on hand ÷ monthly burn, using your heaviest recent burn month rather than
your cheapest. The full reasoning, including what to do at each runway level, lives in the
<a href="/guides/cash-runway">main runway guide</a>; the
<a href="/guides/runway-calculator">calculator</a> runs it with your numbers in your browser.</p></div>
<h2>The twist for {aud}</h2>
<p>{RUNWAY_SPECIFIC[vslug]}</p>""",
        related=["cash-runway", "runway-calculator", f"pay-yourself-{vslug}"])

# ---------------- hub ----------------
def hub():
    groups = [
        ("The core questions", ["how-much-to-pay-yourself", "cash-runway",
                                "revenue-drop-real-or-noise", "can-i-afford-to-hire",
                                "should-i-raise-prices", "which-invoice-to-chase"]),
        ("Calculators", ["pay-yourself-calculator", "runway-calculator", "hire-calculator"]),
        ("By business type", [f"pay-yourself-{v}" for v in VERTICALS] + [f"cash-runway-{v}" for v in VERTICALS]),
    ]
    body = ""
    for gname, slugs in groups:
        body += f"<h2>{gname}</h2><div class='related' style='margin-top:0'>"
        body += "".join(f'<a href="/guides/{s}">{GUIDE_TITLES[s]}</a>' for s in slugs)
        body += "</div>"
    return page("", "Small Business Money Guides, With the Math Shown | Counsel",
                "Honest guides to the questions owners actually ask: pay yourself, runway, hiring, pricing, late invoices. Every method named, every example computed.",
                "The money questions, answered with the math shown",
                "Every guide here names its method, works a real example, and says so when the honest answer is that it depends. No listicles, no invented statistics.",
                body).replace(f'href="{SITE}/guides/"', f'href="{SITE}/guides/"')

os.makedirs(OUT, exist_ok=True)
for slug, content in PAGES.items():
    with open(os.path.join(OUT, f"{slug}.html"), "w", encoding="utf-8") as f:
        f.write(content)
with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
    f.write(hub())

# sitemap + robots at site root
site_root = os.path.join(os.path.dirname(__file__), "..", "site")
urls = [f"{SITE}/"] + [f"{SITE}/guides/"] + [f"{SITE}/guides/{s}" for s in PAGES]
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
sm += "".join(f"  <url><loc>{u}</loc><lastmod>{TODAY}</lastmod></url>\n" for u in urls)
sm += "</urlset>\n"
open(os.path.join(site_root, "sitemap.xml"), "w", encoding="utf-8").write(sm)
open(os.path.join(site_root, "robots.txt"), "w", encoding="utf-8").write(
    f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")

print(f"generated {len(PAGES)} guide pages + hub + sitemap ({len(urls)} urls) + robots.txt")
em = sum(("—" in c) for c in PAGES.values())
print("em-dash check:", "CLEAN" if em == 0 else f"{em} PAGES CONTAIN EM DASHES")
