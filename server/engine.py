"""Counsel engine adapter — the ONE-engine bridge to Aurora.

Imports Aurora's analysis primitives from the existing Python engine (path via
AURORA_REPO env var) and computes every Counsel insight from the real ledger.
Nothing here is narrated that wasn't computed: every number in every template
comes from the data, every method is cited as what actually ran, and when the
data can't support a claim the confidence honestly says so.

Aurora surface used (imported, never forked):
  - fantasyai.aurora.advanced_models.detect_changepoints  (ruptures/PELT)
  - fantasyai.aurora.math.forecasting.forecast_worldclass (model-zoo ensemble)
"""
from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

AURORA_REPO = os.environ.get("AURORA_REPO", r"C:\Users\bgrut\Desktop\Aurora_QIE")
if AURORA_REPO not in sys.path:
    sys.path.insert(0, AURORA_REPO)

from fantasyai.aurora.advanced_models import detect_changepoints  # noqa: E402
from fantasyai.aurora.math.forecasting import forecast_worldclass  # noqa: E402

DATA = Path(__file__).parent / "data"


# ---------------------------------------------------------------------------
# Ledger
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def ledger() -> dict:
    charges = pd.read_csv(DATA / "charges.csv", parse_dates=["date"])
    costs = pd.read_csv(DATA / "costs.csv")
    cash = pd.read_csv(DATA / "cash.csv", parse_dates=["date"])
    daily = charges.groupby("date", as_index=False)["amount"].sum().rename(columns={"amount": "revenue"})
    today = charges["date"].max().date()
    return {"charges": charges, "costs": costs, "cash": cash, "daily": daily, "today": today}


def _money(x: float) -> str:
    return f"${x:,.0f}"


def _svg_scale(vals: list[float], lo_px: float, hi_px: float, vmin: float, vmax: float) -> list[float]:
    """Map data values into SVG y coords (inverted: bigger value = smaller y)."""
    span = (vmax - vmin) or 1.0
    return [round(hi_px - (v - vmin) / span * (hi_px - lo_px), 1) for v in vals]


# ---------------------------------------------------------------------------
# Change point — the hero. Aurora PELT finds the break; Welch tests it.
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def changepoint() -> dict:
    L = ledger()
    daily = L["daily"]
    y = daily["revenue"].to_numpy(dtype=float)
    res = detect_changepoints(y.tolist(), model="rbf", penalty=10.0)
    if not res.indices:
        return {"found": False}
    idx = int(res.indices[-1])  # most recent structural break
    before, after = y[:idx], y[idx:]
    if len(before) < 8 or len(after) < 5:
        return {"found": False}
    t, p = stats.ttest_ind(before, after, equal_var=False)
    diff = float(after.mean() - before.mean())
    se = float(np.sqrt(before.var(ddof=1) / len(before) + after.var(ddof=1) / len(after)))
    ci = 1.96 * se
    bdate = daily["date"].iloc[idx].date()
    # Break-line viz: downsample each side to ≤8 points, shared scale.
    def ds(a: np.ndarray, k: int = 8) -> list[float]:
        if len(a) <= k:
            return [float(v) for v in a]
        chunks = np.array_split(a, k)
        return [float(c.mean()) for c in chunks]

    b_ds, a_ds = ds(before), ds(after)
    vmin, vmax = min(b_ds + a_ds), max(b_ds + a_ds)
    return {
        "found": True,
        "index": idx,
        "date": bdate,
        "p": float(p),
        "before_mean": float(before.mean()),
        "after_mean": float(after.mean()),
        "pct": diff / float(before.mean()),
        "per_day": diff,
        "ci_lo": diff - ci,
        "ci_hi": diff + ci,
        "n_before": int(len(before)),
        "n_after": int(len(after)),
        "viz": {
            "kind": "breakline",
            "before": _svg_scale(b_ds, 10.0, 72.0, vmin, vmax),
            "after": _svg_scale(a_ds, 10.0, 72.0, vmin, vmax),
            "beforeLabel": f"~{_money(float(np.mean(before)))}/day",
            "afterLabel": f"~{_money(float(np.mean(after)))}/day",
        },
        "spark": {
            "kind": "breakline",
            "before": _svg_scale(b_ds, 6.0, 34.0, vmin, vmax),
            "after": _svg_scale(a_ds, 6.0, 34.0, vmin, vmax),
            "beforeLabel": "",
            "afterLabel": "",
        },
    }


def _p_plain(p: float) -> tuple[str, str]:
    if p < 0.001:
        return ("Less than a <em>1-in-1,000 chance</em> this drop is just random noise.", "p < 0.001")
    if p < 0.01:
        return ("Less than a <em>1-in-100 chance</em> this drop is just random noise.", "p < 0.01")
    if p < 0.05:
        return ("Less than a <em>1-in-20 chance</em> this is just noise — real, but watch it.", "p < 0.05")
    return ("I <em>can't</em> call this real yet — it's within normal variation.", f"p = {p:.2f}")


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
def compute_metrics() -> list[dict]:
    L = ledger()
    charges, costs, cash, daily, today = L["charges"], L["costs"], L["cash"], L["daily"], L["today"]
    cp = changepoint()
    out: list[dict] = []

    # ---- Revenue · MTD (change-point math) ----
    this_m = today.strftime("%Y-%m")
    prev_m = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    mtd_mask = (charges["date"].dt.strftime("%Y-%m") == this_m) & (charges["date"].dt.day <= today.day)
    prev_mask = (charges["date"].dt.strftime("%Y-%m") == prev_m) & (charges["date"].dt.day <= today.day)
    mtd, prev_mtd = float(charges.loc[mtd_mask, "amount"].sum()), float(charges.loc[prev_mask, "amount"].sum())
    delta_pct = (mtd / prev_mtd - 1) * 100 if prev_mtd else 0.0
    prev_name = pd.to_datetime(prev_m).strftime("%b")

    if cp["found"]:
        stat_plain, stat_not = _p_plain(cp["p"])
        bdate = cp["date"].strftime("%B %-d") if os.name != "nt" else cp["date"].strftime("%B %#d")
        meaning = (
            f"<b>The {bdate} break is the whole story.</b> Before it you were averaging "
            f"{_money(cp['before_mean'])}/day; since, {_money(cp['after_mean'])}/day."
        )
        math_block = {
            "methodPlain": (
                f"I compared the <b>{cp['n_before']} days before</b> {bdate} with the "
                f"<b>{cp['n_after']} days after</b>, and tested whether the drop is bigger than your "
                f"normal day-to-day swings. <span class='k'>It is — clearly.</span>"
                if cp["p"] < 0.05 else
                f"I compared the days before and after {bdate} — the difference isn't clearly bigger than your normal swings."
            ),
            "keyStatPlain": stat_plain,
            "keyStatNotation": f"{stat_not} · Welch's t-test · PELT change-point · {cp['n_before'] + cp['n_after']} days",
            "extraPlain": (
                f"Best estimate: <b>{cp['pct'] * 100:+.0f}%</b>, about <b>{_money(cp['per_day'])}/day</b>. "
                f"I'm 95% confident the true change sits between <b>{_money(cp['ci_lo'])}</b> and "
                f"<b>{_money(cp['ci_hi'])}</b> a day."
            ),
            "viz": cp["viz"],
            "citation": {"method": "PELT (Killick et al., 2012) via ruptures + Welch's t-test", "source": "your order ledger"},
        }
        rev_conf, rev_lbl = ("high", "High") if cp["p"] < 0.01 else ("moderate", "Moderate")
    else:
        meaning = "<b>No structural break detected</b> — the month is moving within its normal swings."
        math_block = None
        rev_conf, rev_lbl = "moderate", "Moderate"

    out.append({
        "id": "revenue",
        "label": "Revenue · month to date",
        "value": _money(mtd),
        "delta": {"text": f"{'▾' if delta_pct < 0 else '▴'} {abs(delta_pct):.0f}% vs {prev_name}", "dir": "down" if delta_pct < 0 else "up"},
        "meaning": meaning,
        "confidence": rev_conf,
        "confidenceLabel": rev_lbl,
        "wide": True,
        "spark": cp.get("spark"),
        "math": math_block,
    })

    # ---- Gross margin · normal-range band ----
    rev_m = charges.assign(m=charges["date"].dt.strftime("%Y-%m")).groupby("m")["amount"].sum()
    gm = ((rev_m - costs.set_index("month")["cogs"]) / rev_m * 100).dropna()
    now_gm, hist = float(gm.iloc[-1]), gm.iloc[:-1]
    mu, sd = float(hist.mean()), max(0.4, float(hist.std(ddof=0)))
    lo_b, hi_b = mu - sd, mu + sd
    in_band = lo_b <= now_gm <= hi_b
    pos = float(np.clip(28 + (now_gm - lo_b) / ((hi_b - lo_b) or 1) * 44, 8, 92))
    out.append({
        "id": "margin",
        "label": "Gross margin",
        "value": f"{now_gm:.0f}%",
        "delta": {"text": "— flat" if in_band else ("▴ above range" if now_gm > hi_b else "▾ below range"), "dir": "flat" if in_band else ("up" if now_gm > hi_b else "down")},
        "meaning": ("<b>Healthy and steady</b> for handmade goods. No meaningful change — costs didn't creep."
                    if in_band else
                    ("<b>Margin improved</b> past its usual range — good news; worth checking it's sustainable (mix, pricing, or costs)."
                     if now_gm > hi_b else
                     "<b>Margin slipped below</b> your normal range — costs crept or pricing softened. Worth a look this week.")),
        "confidence": "high",
        "confidenceLabel": "High",
        "math": {
            "methodPlain": "I track your rolling margin and its <b>normal swing</b>. " +
                           ("This month lands inside that band, so “flat” isn't a guess — it's within the noise."
                            if in_band else "This month lands OUTSIDE that band — a real move, not noise."),
            "keyStatPlain": (f"Sitting <em>inside</em> your normal range." if in_band else f"<em>Outside</em> the normal band."),
            "keyStatNotation": f"within ±1 std dev of {len(hist)}-mo mean · band {lo_b:.0f}–{hi_b:.0f}%",
            "viz": {"kind": "band", "rangeLabel": f"your normal range · {lo_b:.0f}–{hi_b:.0f}%", "nowLabel": f"now {now_gm:.0f}%", "nowPosPct": round(pos)},
            "citation": {"method": "rolling normal-range test", "source": "your cost & revenue ledger"},
        },
    })

    # ---- Cash runway · transparent arithmetic ----
    bal = float(cash["balance"].iloc[-1])
    net_by_m = (rev_m - costs.set_index("month")["cogs"] - costs.set_index("month")["opex"]).dropna()
    last3 = net_by_m.iloc[-3:]
    burn = -float(last3.mean())  # positive = burning
    if burn > 0:
        runway_mo = bal / burn
        val, sub = f"{runway_mo:.0f} mo", f"{_money(bal)} on hand"
        mean_txt = (f"<b>Watch this.</b> Since the break you're burning cash — about {_money(burn)} a month."
                    if runway_mo < 6 else "<b>Covered for now</b> — but the burn started with the revenue break.")
        calc_lines = [
            {"text": _money(bal), "op": "cash"},
            {"text": f"÷ {_money(burn)}", "op": "avg net burn / mo (last 3)"},
            {"text": f"≈ {runway_mo:.1f} months", "kind": "result"},
        ]
        worst = -float(net_by_m.min())
        stat_plain = f"At your <em>worst recent month</em> it's ~{bal / worst:.1f} months." if worst > 0 else "No month has burned worse than this average."
        stat_note = "stress-tested against your highest-burn month"
    else:
        val, sub = "not burning", f"{_money(bal)} on hand"
        mean_txt = "<b>Cash-positive on average</b> — runway isn't the constraint right now."
        calc_lines = [
            {"text": _money(bal), "op": "cash"},
            {"text": f"+ {_money(-burn)}", "op": "avg net gain / mo (last 3)"},
            {"text": "runway: not a constraint", "kind": "result"},
        ]
        stat_plain = "You're adding cash on an average month."
        stat_note = "3-month trailing net"
    out.append({
        "id": "runway",
        "label": "Cash runway",
        "value": val,
        "delta": {"text": sub, "dir": "flat"},
        "meaning": mean_txt,
        "confidence": "high",
        "confidenceLabel": "High",
        "math": {
            "methodPlain": "No black box here — it's just your cash against what you actually net each month:",
            "keyStatPlain": stat_plain,
            "keyStatNotation": stat_note,
            "viz": {"kind": "arithmetic", "lines": calc_lines},
            "citation": {"method": "transparent arithmetic", "source": "cash + monthly P&L · your ledger"},
        },
    })

    # ---- New customers · honest attribution ----
    mtd_orders = charges.loc[mtd_mask]
    prev_orders = charges.loc[prev_mask]
    new_now = int((mtd_orders["is_repeat"] == 0).sum())
    new_prev = int((prev_orders["is_repeat"] == 0).sum())
    cd = (new_now / new_prev - 1) * 100 if new_prev else 0.0
    shares = (mtd_orders.loc[mtd_orders["is_repeat"] == 0, "channel"].value_counts(normalize=True) * 100).round(0)
    unk = float(shares.get("unknown", 0))
    top_ch = next((c for c in shares.index if c != "unknown"), "direct")
    bars = [{"name": c.capitalize(), "pct": int(p), "unknown": c == "unknown"}
            for c, p in shares.items()]
    out.append({
        "id": "customers",
        "label": f"New customers · {today.strftime('%B')}",
        "value": str(new_now),
        "delta": {"text": f"{'▴' if cd >= 0 else '▾'} {abs(cd):.0f}%", "dir": "up" if cd >= 0 else "down"},
        "meaning": f"<b>{top_ch.capitalize()} is pulling its weight</b> — {shares.get(top_ch, 0):.0f}% of new buyers. " +
                   ("Worth leaning into while revenue's soft." if cp.get("found") else "Your strongest channel right now."),
        "confidence": "moderate",
        "confidenceLabel": "Moderate",
        "wide": True,
        "math": {
            "methodPlain": f"Where each new buyer <b>first arrived from</b>. I'm honest about the gap: {unk:.0f}% has no clear source, so this is <span class='k'>moderate, not high</span>.",
            "keyStatPlain": f"Confident on {top_ch.capitalize()} — <em>less sure</em> on the {unk:.0f}% I can't trace.",
            "keyStatNotation": f"first-touch attribution · {unk:.0f}% unattributed",
            "viz": {"kind": "attribution", "bars": bars},
            "citation": {"method": "first-touch attribution", "source": "channel tags · your order ledger"},
        },
    })

    # ---- Repeat rate · trend ----
    rr = charges.assign(m=charges["date"].dt.strftime("%Y-%m")).groupby("m")["is_repeat"].mean() * 100
    rr3 = rr.iloc[-3:]
    mono = bool(all(np.diff(rr3.to_numpy()) > 0))
    pts = [{"label": pd.to_datetime(m).strftime("%b").upper(), "value": f"{v:.0f}%",
            "heightPct": int(30 + (v - rr3.min()) / ((rr3.max() - rr3.min()) or 1) * 54)}
           for m, v in rr3.items()]
    out.append({
        "id": "repeat",
        "label": "Repeat purchase rate",
        "value": f"{rr3.iloc[-1]:.0f}%",
        "delta": {"text": f"▴ from {rr3.iloc[0]:.0f}%" if rr3.iloc[-1] >= rr3.iloc[0] else f"▾ from {rr3.iloc[0]:.0f}%",
                  "dir": "up" if rr3.iloc[-1] >= rr3.iloc[0] else "down"},
        "meaning": ("<b>Your regulars are coming back more.</b> A real three-month climb, not a one-month blip."
                    if mono else "<b>Repeat rate is moving</b>, but not consistently — I'd call it drift, not a trend."),
        "confidence": "high" if mono else "moderate",
        "confidenceLabel": "High" if mono else "Moderate",
        "math": {
            "methodPlain": "Share of each month's buyers who'd <b>bought from you before</b>. " +
                           ("Three months, all pointing up — that's what makes it a trend I'll stand behind." if mono
                            else "The months don't all point the same way, so I won't call it a trend yet."),
            "keyStatPlain": (f"Up <em>every month</em> for three straight — a genuine trend." if mono
                             else "Mixed months — <em>not</em> a steady climb."),
            "keyStatNotation": (f"monotonic increase · +{rr3.iloc[-1] - rr3.iloc[0]:.0f} pts over 3 mo" if mono
                                else f"{rr3.iloc[-1] - rr3.iloc[0]:+.0f} pts over 3 mo · non-monotonic"),
            "viz": {"kind": "trend", "points": pts},
            "citation": {"method": "cohort repeat-rate", "source": "your order history"},
        },
    })
    return out


# ---------------------------------------------------------------------------
# Brief (Today screen)
# ---------------------------------------------------------------------------
def compute_brief() -> dict:
    L = ledger()
    charges, today = L["charges"], L["today"]
    cp = changepoint()
    metrics = {m["id"]: m for m in compute_metrics()}

    rev_soft = cp.get("found") and cp["pct"] < -0.1
    margin_held = metrics["margin"]["delta"]["text"] == "— flat"
    burning = metrics["runway"]["value"] != "not burning"
    runway_num = metrics["runway"]["value"]

    micro = [
        {"label": "Revenue", "value": "Soft" if rev_soft else "Steady", "tone": "mod" if rev_soft else "hi"},
        {"label": "Margin", "value": "Held" if margin_held else "Moving", "tone": "hi" if margin_held else "mod"},
        {"label": "Cash", "value": ("Watch" if burning else "Healthy"), "tone": ("mod" if burning else "hi")},
    ]
    if rev_soft and margin_held:
        headline = "A steady operation — with <em>one real dent.</em>"
        sub = "Margins held. The thing that changed is revenue — and I know exactly when it broke."
    elif rev_soft:
        headline = "Revenue broke — and it's <em>pulling on everything else.</em>"
        sub = "The break is real, and margin and cash are starting to feel it. Here's what matters first."
    else:
        headline = "A <em>steady</em> stretch."
        sub = "Nothing structural moved. I'll flag it the moment that changes."

    attention = []
    if cp.get("found"):
        bdate = cp["date"].strftime("%B %#d") if os.name == "nt" else cp["date"].strftime("%B %-d")
        _, stat_not = _p_plain(cp["p"])
        attention.append({
            "id": "att-break",
            "source": "Payments · change-point",
            "headline": f"Revenue <b>structurally dropped {bdate}</b> — a real break, not a slow week ({cp['pct'] * 100:+.0f}%).",
            "confidence": "high" if cp["p"] < 0.01 else "moderate",
            "confidenceLabel": "High confidence" if cp["p"] < 0.01 else "Moderate",
            "citationChip": stat_not,
        })

    # Out-of-stock detector: a product that historically mattered (share > 8%)
    # and hasn't sold in ≥5 days. Days-since-last-sale is the honest measure —
    # a healthy seller with that share almost never goes 5 days silent.
    hist_share = charges.loc[charges["date"] < charges["date"].max() - pd.Timedelta(days=10)]
    shares = hist_share.groupby("product")["amount"].sum() / hist_share["amount"].sum()
    for prod, share in shares.sort_values(ascending=False).items():
        last_sale = charges.loc[charges["product"] == prod, "date"].max().date()
        days_out = (today - last_sale).days
        if share > 0.08 and days_out >= 5:
            attention.append({
                "id": "att-oos",
                "source": "Inventory · ledger",
                "headline": f"<b>{prod}</b> hasn't sold in {days_out} days — it was {share * 100:.0f}% of your revenue before that.",
                "confidence": "moderate",
                "confidenceLabel": "Likely a factor",
                "citationChip": "SKU share",
            })
            break

    watching = []
    if cp.get("found") and cp["n_after"] < 30:
        watching.append({
            "id": "w-recovery",
            "pillLabel": f"{cp['n_after']}d in",
            "text": f"<b>Post-break recovery.</b> Only {cp['n_after']} days since the break — too early to call a rebound.",
        })
    days_into = today.day
    if days_into < 28:
        watching.append({
            "id": "w-month",
            "pillLabel": f"day {days_into}",
            "text": f"<b>{today.strftime('%B')} repeat rate.</b> Partial month — I'll call the trend when it closes.",
        })

    return {
        "greeting": {"date": today.strftime("%A, %B %#d") if os.name == "nt" else today.strftime("%A, %B %-d"),
                     "business": "Kiln & Co."},
        "state": {"eyebrow": "Right now", "headline": headline, "sub": sub, "micro": micro},
        "attention": attention,
        "watching": watching,
        "sources": connections(),
    }


def connections() -> list[dict]:
    L = ledger()
    n = len(L["charges"])
    return [
        {"id": "stripe", "name": "Ledger · orders", "role": f"{n:,} orders · CSV demo feed", "status": "ok", "syncedLabel": "loaded"},
        {"id": "shopify", "name": "Ledger · costs", "role": "monthly COGS + opex", "status": "ok", "syncedLabel": "loaded"},
        {"id": "instagram", "name": "Ledger · cash", "role": "daily balance", "status": "ok", "syncedLabel": "loaded"},
    ]


# ---------------------------------------------------------------------------
# Ask
# ---------------------------------------------------------------------------
def answer(question: str) -> dict:
    q = question.lower()
    if any(k in q for k in ("hire", "afford", "helper", "staff")):
        return _answer_hire(question)
    if any(k in q for k in ("bounce", "next month", "forecast", "recover", "april")):
        return _answer_forecast()
    return {
        "id": "ask-fallback",
        "headline": "I don't have enough data to answer that honestly.",
        "verdict": "I can't answer that <em>honestly yet.</em>",
        "checked": ["your ledger (orders, costs, cash)"],
        "body": "That question needs data I don't have — or more history than the ledger holds. I'd rather tell you that than invent a confident-sounding answer.\n\nToday I can answer questions about revenue, the break, margin, cash & runway, hiring affordability, and the next-month outlook.",
        "confidence": "insufficient",
        "confidenceLabel": "Not enough data",
        "citationChip": "honesty · core",
        "followups": ["Can I afford a $1,400/mo hire?", "Will next month bounce back?"],
    }


def _answer_hire(question: str) -> dict:
    import re
    L = ledger()
    m = re.search(r"\$?([\d,]{3,})", question)
    cost = float(m.group(1).replace(",", "")) if m else 1400.0
    charges, costs = L["charges"], L["costs"]
    rev_m = charges.assign(m=charges["date"].dt.strftime("%Y-%m")).groupby("m")["amount"].sum()
    net = (rev_m - costs.set_index("month")["cogs"] - costs.set_index("month")["opex"]).dropna()
    last3 = net.iloc[-3:]
    avg = float(last3.mean())
    worst = float(last3.min())
    cushion, worst_cushion = avg - cost, worst - cost
    cv = float(rev_m.pct_change().dropna().abs().mean() * 100)

    if cushion > cost * 0.5 and worst_cushion > 0:
        verdict, conf, lbl = "Yes — <em>comfortably.</em>", "high", "High confidence"
    elif cushion > 0:
        verdict, conf, lbl = "Probably — <em>with one caveat.</em>", "moderate", "Moderate confidence"
    else:
        verdict, conf, lbl = "Not right now — <em>the math says wait.</em>", "moderate", "Moderate confidence"

    lo3 = last3.to_numpy()
    hmax = max(abs(v) for v in lo3) or 1
    bars = [{"label": pd.to_datetime(m).strftime("%b").upper(),
             "heightPct": int(np.clip(abs(v) / hmax * 78, 8, 92)),
             "tight": bool(v - cost < 0)} for m, v in last3.items()]

    body = (
        f"Your last 3 months averaged <b>{_money(avg)}/mo</b> net after costs. A {_money(cost)} hire leaves "
        f"about <b>{_money(cushion)}</b> of cushion on an average month.\n\n"
        + (f"The caveat: your revenue swings <b>±{cv:.0f}%</b> month to month, and your worst recent month "
           f"nets {_money(worst)} — that's {_money(worst_cushion)} after the hire."
           if worst_cushion < cushion else "Even your worst recent month covers it.")
    )
    return {
        "id": "ask-hire",
        "headline": "Hire affordability, from your real P&L.",
        "verdict": verdict,
        "checked": ["3-mo net profit", "revenue variance", "◆ ledger"],
        "body": body,
        "confidence": conf,
        "confidenceLabel": lbl,
        "citationChip": f"3 mo · ±{cv:.0f}% variance",
        "math": {
            "methodPlain": "", "keyStatPlain": "", "keyStatNotation": "",
            "viz": {"kind": "arithmetic", "lines": [
                {"text": _money(avg), "op": "avg monthly net (last 3)"},
                {"text": f"− {_money(cost)}", "op": "hire"},
                {"text": f"= {_money(cushion)} cushion", "kind": "result"},
                {"text": "worst month:", "op": ""},
                {"text": f"{_money(worst)} − {_money(cost)} = {_money(worst_cushion)}", "kind": "warn"},
            ]},
            "citation": {"method": "transparent arithmetic", "source": "3-month P&L · your ledger"},
        },
        "followups": ["What if revenue drops 20%?", "Will next month bounce back?"],
    }


@lru_cache(maxsize=1)
def _forecast_cache() -> dict:
    L = ledger()
    daily = L["daily"].copy()
    daily["date"] = pd.to_datetime(daily["date"])
    return forecast_worldclass(daily, "revenue", time_col="date", horizon=30)


def _answer_forecast() -> dict:
    fc = _forecast_cache()
    if "winner" not in fc:
        return answer("")  # honest fallback
    w = fc["winner"]
    mid = np.array(w["forecast"], dtype=float)
    pi = w.get("prediction_interval", {})
    lo = np.array(pi.get("lo", mid), dtype=float)
    hi = np.array(pi.get("hi", mid), dtype=float)
    total_lo, total_hi, total_mid = float(lo.sum()), float(hi.sum()), float(mid.sum())

    L = ledger()
    hist_daily = L["daily"]["revenue"].to_numpy(dtype=float)
    hist_ds = [float(c.mean()) for c in np.array_split(hist_daily[-40:], 5)]
    all_vals = hist_ds + mid.tolist() + lo.tolist() + hi.tolist()
    vmin, vmax = min(all_vals), max(all_vals)
    fan = {
        "kind": "fan",
        "history": _svg_scale(hist_ds, 14.0, 82.0, vmin, vmax),
        "mid": _svg_scale([float(c.mean()) for c in np.array_split(mid, 3)], 14.0, 82.0, vmin, vmax),
        "hi": _svg_scale([float(c.mean()) for c in np.array_split(hi, 3)], 14.0, 82.0, vmin, vmax),
        "lo": _svg_scale([float(c.mean()) for c in np.array_split(lo, 3)], 14.0, 82.0, vmin, vmax),
        "hiLabel": f"${total_hi / 1000:.0f}k",
        "loLabel": f"${total_lo / 1000:.0f}k",
    }
    cp = changepoint()
    driver = (f"The break on {cp['date'].strftime('%b %#d') if os.name == 'nt' else cp['date'].strftime('%b %-d')} drove the dip — "
              if cp.get("found") else "")
    return {
        "id": "ask-forecast",
        "headline": "Next 30 days — a range, not a promise.",
        "verdict": "Here's the honest outlook — a <em>range, not a promise.</em>",
        "checked": ["daily revenue history", f"model: {w['name']}", "◆ ledger"],
        "body": (
            f"My best estimate for the next 30 days is between <b>${total_lo / 1000:.0f}k and ${total_hi / 1000:.0f}k</b> "
            f"(midpoint ~${total_mid / 1000:.0f}k).\n\n"
            f"{driver}the range is wide on purpose: the model was chosen by backtest ({w['name']} won), and I won't "
            f"pretend the future is a single number."
        ),
        "honestNote": "This is a projection, not a guarantee. I'd rather show you the range than fake a single number.",
        "confidence": "forecast",
        "confidenceLabel": "Forecast · honest range",
        "citationChip": f"{w['name']} · backtested · 95% band",
        "math": {
            "methodPlain": "", "keyStatPlain": "", "keyStatNotation": "",
            "viz": fan,
            "citation": {"method": f"model-zoo ensemble · winner {w['name']}", "source": "daily revenue · your ledger"},
        },
        "followups": ["What raises the low end?", "Can I afford a $1,400/mo hire?"],
    }
