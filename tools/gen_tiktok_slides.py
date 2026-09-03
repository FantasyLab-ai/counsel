# TikTok carousel slides: 1080x1920 (9:16), caption inside the safe zone.
# TikTok's chrome covers the top ~120px and the bottom ~380px, so all text
# sits between y=190 and y=440 and the phone stops well above y=1540.
import base64, io, os, subprocess, tempfile

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "store", "screenshots")
OUT = os.path.join(ROOT, "store", "tiktok")
os.makedirs(OUT, exist_ok=True)

# slide order is hook-first, not App Store order
SLIDES = [
    ("01-today.png",         "you own the business", "and still don't know what to pay yourself"),
    ("03-insights.png",      "tap any number",       "it shows you the math behind it"),
    ("07-money.png",         "it flags the thin day","before you book something expensive on it"),
    ("02-simulations-lab.png","rehearse the hire",   "against your own history, before you make it"),
    ("09-connect-guide.png", "plugs into your tools","square, stripe, shopify, quickbooks, your bank"),
    ("10-pro.png",           "the math is free",     "every receipt, every honest refusal, forever"),
]

TPL = """<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden}
body{background:#0f1511;background-image:radial-gradient(760px 520px at 50% 120px,rgba(205,174,126,.13),transparent 72%);
position:relative}
.cap{position:absolute;top:190px;left:90px;right:90px;text-align:center}
.k{font:500 20px "JetBrains Mono",monospace;letter-spacing:.34em;color:#cdae7e;text-transform:uppercase}
.h{margin-top:20px;font:500 74px/1.1 "Fraunces",Georgia,serif;color:#ece9df;letter-spacing:-.015em}
.s{margin-top:18px;font:400 31px/1.4 "Fraunces",Georgia,serif;font-style:italic;color:#9fb59a}
.shot{position:absolute;top:470px;left:50%;transform:translateX(-50%);width:700px;height:1070px;
overflow:hidden;border-radius:38px;box-shadow:0 40px 100px rgba(0,0,0,.6),0 0 0 1px rgba(205,174,126,.22)}
.shot img{width:700px;display:block}

</style></head><body>
<div class="cap"><div class="k">COUNSEL</div><div class="h">__H__</div><div class="s">__S__</div></div>
<div class="shot"><img src="data:image/png;base64,__IMG__"></div>
</body></html>"""

# HTML only; rendering runs from PowerShell (headless Edge dies silently under bash)
for i, (fn, head, sub) in enumerate(SLIDES, 1):
    src = os.path.join(SRC, fn)
    if not os.path.exists(src):
        print("MISSING", fn); continue
    b64 = base64.b64encode(open(src, "rb").read()).decode("ascii")
    html = TPL.replace("__H__", head).replace("__S__", sub).replace("__IMG__", b64)
    open(os.path.join(OUT, f"slide-{i:02d}.html"), "w", encoding="utf-8").write(html)
    print("wrote slide-%02d.html" % i)
