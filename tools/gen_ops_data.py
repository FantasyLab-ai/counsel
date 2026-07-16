"""Inventory + shipments demo data for the Ops section.

Planted truths the Ops engine must surface:
  * Sunset Mug stock is LOW vs its demand rate -> reorder alert
  * Glaze Bowl is OVERSTOCKED -> cash tied up
  * two shipments are stalled in transit (>6 days, no scan)
"""
import json
import random
from pathlib import Path

random.seed(7)
ROOT = Path(__file__).resolve().parents[1]

inventory = [
    # on_hand planted against ledger demand rates (~29, ~8, ~14, ~10 units/day)
    {"product": "sunset-mug", "on_hand": 96, "incoming": 60, "incoming_eta": "2026-03-30"},
    {"product": "ridge-vase", "on_hand": 140, "incoming": 0, "incoming_eta": None},
    {"product": "espresso-pair", "on_hand": 210, "incoming": 0, "incoming_eta": None},
    {"product": "glaze-bowl", "on_hand": 420, "incoming": 0, "incoming_eta": None},
]

CARRIERS = ["USPS", "UPS", "FedEx"]
CITIES = ["Austin TX", "Portland OR", "Chicago IL", "Brooklyn NY", "Denver CO",
          "Nashville TN", "Seattle WA", "Ann Arbor MI", "Savannah GA", "Boise ID"]
STATUSES = ["delivered"] * 11 + ["in_transit"] * 4 + ["label_created"] * 1

shipments = []
for i in range(16):
    st = STATUSES[i]
    shipped_day = random.randint(1, 20)
    days = random.randint(2, 5) if st == "delivered" else random.randint(1, 4)
    shipments.append({
        "id": f"sh_{1200 + i}",
        "order": f"ord_{8200 + i}",
        "carrier": random.choice(CARRIERS),
        "tracking": f"9400 1{random.randint(100,999)} {random.randint(1000,9999)} {random.randint(1000,9999)}",
        "dest": random.choice(CITIES),
        "shipped": f"2026-03-{shipped_day:02d}",
        "status": st,
        "days_in_transit": days,
    })
# planted: two stalled shipments (in transit, no scan for 7-9 days)
shipments.append({"id": "sh_1216", "order": "ord_8216", "carrier": "USPS",
                  "tracking": "9400 1361 8842 0071", "dest": "Taos NM",
                  "shipped": "2026-03-16", "status": "in_transit", "days_in_transit": 9})
shipments.append({"id": "sh_1217", "order": "ord_8217", "carrier": "UPS",
                  "tracking": "1Z 884 A02 6690", "dest": "Missoula MT",
                  "shipped": "2026-03-18", "status": "in_transit", "days_in_transit": 7})
shipments.sort(key=lambda s: s["shipped"], reverse=True)

(ROOT / "public" / "kiln_ops.json").write_text(
    json.dumps({"inventory": inventory, "shipments": shipments}, separators=(",", ":")))
print(f"inventory: {len(inventory)} products | shipments: {len(shipments)} (2 stalled planted)")
