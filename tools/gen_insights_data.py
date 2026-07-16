"""Enriched Kiln & Co. ledger for the Insights Lab (Tier A-C).

Builds per-charge records (product, qty, unit price, customer, processor fee,
channel) whose DAILY SUMS match public/kiln_daily.json exactly — so every
number the app already shows stays consistent — plus an expenses file.

Planted, findable truths (the generator is the answer key; the app must
FIND these, not read them):
  * A1  Sunset Mug price +8% on 2026-02-01; demand responds with elasticity ~ -0.7
  * A2  customer repeat gaps ~ lognormal(median 26d); one-timers exist
  * A3  per-product daily demand distributions (newsvendor quantiles)
  * B5  'CloudInv' subscription creeps +$4/mo; one duplicate charge pair
        (2026-02-14 'KilnParts Co.' $186.40 twice); processor fee rate drifts
        2.9% (Dec) -> 3.4% (Mar)
  * C8/C9 weekday seasonality is already in kiln_daily (Sat strong)
"""
import json
import random
from pathlib import Path

random.seed(41)
ROOT = Path(__file__).resolve().parents[1]
daily = json.loads((ROOT / "public" / "kiln_daily.json").read_text())
DATES, REV = daily["dates"], daily["revenue"]

PRODUCTS = [
    # id, name, base price, unit cost, demand weight
    ("sunset-mug", "Sunset Mug", 24.0, 9.5, 0.34),
    ("ridge-vase", "Ridge Vase", 68.0, 26.0, 0.22),
    ("espresso-pair", "Espresso Cup Pair", 38.0, 14.5, 0.26),
    ("glaze-bowl", "Glaze Bowl", 52.0, 21.0, 0.18),
]
PRICE_CHANGE_DATE = "2026-02-01"
MUG_NEW_PRICE = 25.9   # +7.9%
ELASTICITY = -0.7      # planted: qty multiplier = (1+dp)^elasticity
CHANNELS = ["instagram", "direct", "referral", "unknown"]
CH_W = [0.41, 0.29, 0.18, 0.12]

# --- customers: 60 repeaters (lognormal gaps, median ~26d) + one-timers -----
N_REPEATERS = 900
repeater_ids = [f"c{i:03d}" for i in range(N_REPEATERS)]
next_onetime = [1000]  # mutable counter

def fee_rate(date: str) -> float:
    """Processor rate drift: 2.9% Dec -> 3.4% Mar (planted for B5)."""
    idx = DATES.index(date) if date in DATES else 0
    return 0.029 + 0.005 * (idx / max(1, len(DATES) - 1))

def price_of(pid: str, date: str) -> float:
    if pid == "sunset-mug" and date >= PRICE_CHANGE_DATE:
        return MUG_NEW_PRICE
    return next(p[2] for p in PRODUCTS if p[0] == pid)

def demand_weight(pid: str, date: str) -> float:
    w = next(p[4] for p in PRODUCTS if p[0] == pid)
    if pid == "sunset-mug" and date >= PRICE_CHANGE_DATE:
        w *= (MUG_NEW_PRICE / 24.0) ** ELASTICITY  # planted elasticity
    return w

# customers cycle with lognormal-ish gaps; sample per charge
cust_last: dict[str, int] = {}
def pick_customer(day_idx: int) -> str:
    # ~55% of purchases from the repeat pool when "due" (gap since last buy)
    due = [c for c in repeater_ids if day_idx - cust_last.get(c, -99) >= max(6, int(random.lognormvariate(3.25, 0.55)))]
    if due and random.random() < 0.62:
        c = random.choice(due)
        cust_last[c] = day_idx
        return c
    next_onetime[0] += 1
    return f"g{next_onetime[0]}"

rows = []  # [date, product, qty, unit_price, customer, fee, channel]
for di, (d, target) in enumerate(zip(DATES, REV)):
    remaining = target
    guard = 0
    while remaining > 15 and guard < 200:
        guard += 1
        pid = random.choices([p[0] for p in PRODUCTS], weights=[demand_weight(p[0], d) for p in PRODUCTS])[0]
        price = price_of(pid, d)
        qty = 1 if random.random() < 0.78 else 2
        amt = round(price * qty, 2)
        if amt > remaining + 30:
            continue
        fee = round(amt * fee_rate(d), 2)
        ch = random.choices(CHANNELS, weights=CH_W)[0]
        rows.append([d, pid, qty, price, pick_customer(di), fee, ch])
        remaining -= amt
    # final top-up so the day sums EXACTLY to kiln_daily
    if remaining > 0.5:
        pid = "glaze-bowl"
        fee = round(remaining * fee_rate(d), 2)
        rows.append([d, pid, 1, round(remaining, 2), pick_customer(di), fee, "direct"])

ledger = {
    "products": [{"id": p[0], "name": p[1], "price0": p[2], "cost": p[3]} for p in PRODUCTS],
    "priceChange": {"product": "sunset-mug", "date": PRICE_CHANGE_DATE, "from": 24.0, "to": MUG_NEW_PRICE},
    "cols": ["date", "product", "qty", "price", "customer", "fee", "channel"],
    "rows": rows,
}
(ROOT / "public" / "kiln_ledger.json").write_text(json.dumps(ledger, separators=(",", ":")))

# --- expenses (B5 targets) ---------------------------------------------------
MONTHS = ["2025-12", "2026-01", "2026-02", "2026-03"]
expenses = []
for mi, m in enumerate(MONTHS):
    expenses.append({"d": f"{m}-01", "vendor": "Studio Rent LLC", "amount": 2400.0, "cat": "rent"})
    expenses.append({"d": f"{m}-03", "vendor": "ClayWorks Supply", "amount": round(920 + random.uniform(-60, 60), 2), "cat": "materials"})
    expenses.append({"d": f"{m}-05", "vendor": "CloudInv", "amount": round(49 + 4 * mi, 2), "cat": "software"})  # creep +$4/mo
    expenses.append({"d": f"{m}-05", "vendor": "Shoply Suite", "amount": 79.0, "cat": "software"})
    expenses.append({"d": f"{m}-11", "vendor": "MailLoop", "amount": 29.0, "cat": "software"})
    expenses.append({"d": f"{m}-15", "vendor": "Kiln Electric Co-op", "amount": round(310 + random.uniform(-40, 70), 2), "cat": "utilities"})
# planted duplicate pair
expenses.append({"d": "2026-02-14", "vendor": "KilnParts Co.", "amount": 186.40, "cat": "materials"})
expenses.append({"d": "2026-02-14", "vendor": "KilnParts Co.", "amount": 186.40, "cat": "materials"})
expenses.sort(key=lambda e: e["d"])
(ROOT / "public" / "kiln_expenses.json").write_text(json.dumps({"expenses": expenses}, separators=(",", ":")))

# --- sanity ------------------------------------------------------------------
by_day: dict[str, float] = {}
for r in rows:
    by_day[r[0]] = by_day.get(r[0], 0) + r[2] * r[3] if False else by_day.get(r[0], 0) + round(r[2] * r[3], 2)
worst = max(abs(by_day[d] - t) for d, t in zip(DATES, REV))
mug_pre = sum(1 for r in rows if r[1] == "sunset-mug" and r[0] < PRICE_CHANGE_DATE)
mug_post = sum(1 for r in rows if r[1] == "sunset-mug" and r[0] >= PRICE_CHANGE_DATE)
print(f"charges: {len(rows)} | worst daily mismatch: ${worst:.2f}")
print(f"sunset-mug units pre/post: {mug_pre}/{mug_post} | customers: {len(set(r[4] for r in rows))}")
print(f"expenses: {len(expenses)}")
