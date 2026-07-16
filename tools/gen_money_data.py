"""Wholesale invoices for the AR-aging demo (Kiln & Co. sells to shops too).

Planted truths:
  * Riverstone Gifts is 71 days late on $1,840 -> top of the chase list
  * Fern & Clay is 44 days late on $960
  * healthy current invoices + paid history for DSO
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# "today" in ledger time is 2026-03-25
invoices = [
    {"id": "inv-041", "client": "Riverstone Gifts", "issued": "2025-12-30", "due": "2026-01-13", "amount": 1840.00, "paid": None},
    {"id": "inv-046", "client": "Fern & Clay", "issued": "2026-01-26", "due": "2026-02-09", "amount": 960.00, "paid": None},
    {"id": "inv-052", "client": "North Loop Mercantile", "issued": "2026-02-20", "due": "2026-03-06", "amount": 620.00, "paid": None},
    {"id": "inv-055", "client": "Hearth Home Goods", "issued": "2026-03-04", "due": "2026-03-18", "amount": 1120.00, "paid": None},
    {"id": "inv-057", "client": "Prairie Table Co.", "issued": "2026-03-12", "due": "2026-03-26", "amount": 780.00, "paid": None},
    {"id": "inv-058", "client": "Golden Hour Decor", "issued": "2026-03-18", "due": "2026-04-01", "amount": 1410.00, "paid": None},
    # paid history (for DSO)
    {"id": "inv-047", "client": "North Loop Mercantile", "issued": "2026-01-28", "due": "2026-02-11", "amount": 540.00, "paid": "2026-02-14"},
    {"id": "inv-049", "client": "Hearth Home Goods", "issued": "2026-02-05", "due": "2026-02-19", "amount": 990.00, "paid": "2026-02-17"},
    {"id": "inv-050", "client": "Prairie Table Co.", "issued": "2026-02-10", "due": "2026-02-24", "amount": 705.00, "paid": "2026-03-02"},
    {"id": "inv-053", "client": "Golden Hour Decor", "issued": "2026-02-24", "due": "2026-03-10", "amount": 860.00, "paid": "2026-03-09"},
]
(ROOT / "public" / "kiln_money.json").write_text(json.dumps({"asof": "2026-03-25", "invoices": invoices}, separators=(",", ":")))
print(f"invoices: {len(invoices)} (2 seriously late planted)")
