"""Generate the Kiln & Co. demo ledger — REAL data with a REAL planted break.

Seeded and reproducible. The structural break (revenue level shift around
2026-03-04) is planted in the generator, then genuinely *re-discovered* by
Aurora's change-point detector at request time — the math is never faked.

Outputs (this directory):
  charges.csv  — order-level: date, order_id, product, channel, amount, is_repeat
  costs.csv    — monthly: month, cogs, opex
  cash.csv     — daily: date, balance
"""
from __future__ import annotations

import csv
from datetime import date, timedelta
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
rng = np.random.default_rng(41)

START = date(2025, 12, 1)
TODAY = date(2026, 3, 25)          # the app's "today"
BREAK = date(2026, 3, 4)           # the planted structural break
OOS_START = date(2026, 3, 19)      # Sunset Mug goes out of stock (6 days to TODAY)

PRODUCTS = [
    ("Sunset Mug", 0.18, 38.0),
    ("Speckled Bowl", 0.16, 44.0),
    ("Ridge Vase", 0.14, 62.0),
    ("Butter Dish", 0.12, 34.0),
    ("Dinner Plate Set", 0.11, 120.0),
    ("Espresso Cup Pair", 0.10, 42.0),
    ("Planter", 0.10, 48.0),
    ("Serving Platter", 0.09, 88.0),
]
CHANNELS = [("instagram", 0.41), ("direct", 0.29), ("referral", 0.18), ("unknown", 0.12)]


def month_frac(d: date) -> float:
    """0..1 through Dec→Mar, for the slowly-rising repeat rate."""
    total = (TODAY - START).days
    return (d - START).days / total


def main() -> None:
    days = [(START + timedelta(days=i)) for i in range((TODAY - START).days + 1)]
    prod_names = [p[0] for p in PRODUCTS]
    prod_w = np.array([p[1] for p in PRODUCTS])
    chan_names = [c[0] for c in CHANNELS]
    chan_w = np.array([c[1] for c in CHANNELS])

    charges = []
    oid = 1000
    for d in days:
        # Daily revenue target: ~N(4200, 380) before the break, ~N(2850, 300) after.
        target = rng.normal(4200, 380) if d < BREAK else rng.normal(2850, 300)
        # Weekend lift (craft business): Sat/Sun +12%.
        if d.weekday() >= 5:
            target *= 1.12
        target = max(600.0, target)

        pw = prod_w.copy()
        if d >= OOS_START:  # Sunset Mug out of stock — genuinely zero sales
            pw[0] = 0.0
        pw = pw / pw.sum()

        # Repeat share drifts up 0.31 → 0.38 across the window.
        repeat_p = 0.31 + 0.07 * month_frac(d)

        total = 0.0
        while total < target:
            prod_i = int(rng.choice(len(prod_names), p=pw))
            base = PRODUCTS[prod_i][2]
            amount = round(float(base * rng.uniform(0.85, 1.35)), 2)
            chan = str(rng.choice(chan_names, p=chan_w / chan_w.sum()))
            is_rep = int(rng.random() < repeat_p)
            charges.append([d.isoformat(), f"ord_{oid}", prod_names[prod_i], chan, amount, is_rep])
            oid += 1
            total += amount

    with (HERE / "charges.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "order_id", "product", "channel", "amount", "is_repeat"])
        w.writerows(charges)

    # Monthly costs: COGS ≈ 66% of revenue (±1.2pt) → gross margin ~34% (32–36 band).
    # Opex fixed-ish; total burn shapes the runway math.
    by_month: dict[str, float] = {}
    for row in charges:
        by_month[row[0][:7]] = by_month.get(row[0][:7], 0.0) + row[4]
    with (HERE / "costs.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["month", "cogs", "opex"])
        for m, rev in sorted(by_month.items()):
            # COGS ≈ 66% of revenue → gross margin ~34% (32–36 band).
            # Opex sized so the business runs ~+$3k/mo pre-break and goes
            # net-negative after it — the hire-affordability caveat and the
            # runway story are then TRUE in the data, not narrated fiction.
            cogs = round(rev * float(rng.normal(0.66, 0.012)), 2)
            opex = round(float(rng.normal(41_500, 800)), 2)
            w.writerow([m, cogs, opex])

    # Daily cash balance: start high enough to land ≈ $48k today.
    daily_rev: dict[str, float] = {}
    for row in charges:
        daily_rev[row[0]] = daily_rev.get(row[0], 0.0) + row[4]
    months = sorted(by_month)
    cost_rate = {}
    with (HERE / "costs.csv").open() as f:
        for r in csv.DictReader(f):
            days_in = sum(1 for d in days if d.isoformat()[:7] == r["month"])
            cost_rate[r["month"]] = (float(r["cogs"]) + float(r["opex"])) / max(1, days_in)

    balance = 46_000.0
    rows = []
    for d in days:
        iso = d.isoformat()
        balance += daily_rev.get(iso, 0.0) - cost_rate[iso[:7]]
        rows.append([iso, round(balance, 2)])
    with (HERE / "cash.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "balance"])
        w.writerows(rows)

    print(f"charges: {len(charges)} orders across {len(days)} days")
    print(f"final cash balance: ${balance:,.0f}")
    pre = [daily_rev[d.isoformat()] for d in days if d < BREAK]
    post = [daily_rev[d.isoformat()] for d in days if d >= BREAK]
    print(f"rev/day pre-break: ${np.mean(pre):,.0f} · post-break: ${np.mean(post):,.0f} ({(np.mean(post)/np.mean(pre)-1)*100:+.0f}%)")


if __name__ == "__main__":
    main()
