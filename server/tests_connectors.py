"""Offline connector tests — prove every mapper against the providers'
DOCUMENTED payload shapes (fixtures below mirror the official API docs),
plus a full end-to-end CSV import. This is "as far as we can get" without
live credentials — the network layer is thin urllib; the mapping logic is
what can silently rot, so that's what we pin.

Run:  python tests_connectors.py
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from connectors.csv_import import CsvImporter  # noqa: E402
from connectors.others import PlaidConnector, ShopifyConnector, SquareConnector  # noqa: E402
from connectors.stripe_conn import StripeConnector  # noqa: E402

FAIL = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global FAIL
    mark = "PASS" if cond else "FAIL"
    if not cond:
        FAIL += 1
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail and not cond else ""))


# ---- Stripe charge (shape per stripe.com/docs/api/charges/object) -----------
stripe_charge = {
    "id": "ch_3PQr2e2eZvKYlo2C1kXyz123", "object": "charge", "amount": 2590,
    "created": 1719849600, "currency": "usd", "customer": "cus_QGh4aBcDeFgHiJ",
    "description": "Sunset Mug", "paid": True, "refunded": False,
    "metadata": {"product": "sunset-mug", "channel": "instagram", "qty": "1", "unit_price": "25.90"},
    "balance_transaction": {"id": "txn_1", "object": "balance_transaction", "fee": 105},
}
row = StripeConnector.map_charge(stripe_charge)
print("Stripe mapper:")
check("maps paid charge", row is not None)
check("date from unix ts", row[0] == "2024-07-01", str(row[0]))
check("amount cents->dollars", row[4] == 25.90, str(row[4]))
check("fee from balance_transaction", row[8] == 1.05, str(row[8]))
check("product from metadata", row[2] == "sunset-mug", str(row[2]))
check("skips refunded", StripeConnector.map_charge({**stripe_charge, "refunded": True}) is None)
check("skips unpaid", StripeConnector.map_charge({**stripe_charge, "paid": False}) is None)

# ---- Square payment (shape per developer.squareup.com Payments API) ---------
square_payment = {
    "id": "hYy9pRFVxpDsO1FB05SunFWUe9JZY", "created_at": "2026-03-04T13:22:41.000Z",
    "amount_money": {"amount": 6855, "currency": "USD"}, "status": "COMPLETED",
    "processing_fee": [{"amount_money": {"amount": 228, "currency": "USD"}, "type": "INITIAL"}],
    "customer_id": "RDX9Z4XTIZR7MRZJUXNY9HUK6I", "note": "Ridge Vase",
}
row = SquareConnector.map_payment(square_payment)
print("Square mapper:")
check("maps completed payment", row is not None)
check("date from RFC3339", row[0] == "2026-03-04", str(row[0]))
check("amount cents->dollars", row[4] == 68.55, str(row[4]))
check("fee summed", row[8] == 2.28, str(row[8]))
check("skips non-completed", SquareConnector.map_payment({**square_payment, "status": "FAILED"}) is None)

# ---- Shopify order (shape per shopify.dev Admin REST orders) ----------------
shopify_order = {
    "id": 450789469, "processed_at": "2026-02-25T16:15:47-05:00",
    "financial_status": "paid", "cancelled_at": None, "source_name": "web",
    "customer": {"id": 207119551},
    "line_items": [
        {"id": 669751112, "title": "Espresso Cup Pair", "price": "38.00", "quantity": 2},
        {"id": 669751113, "title": "Glaze Bowl", "price": "52.00", "quantity": 1},
    ],
}
rows = ShopifyConnector.map_order(shopify_order)
print("Shopify mapper:")
check("one row per line item", len(rows) == 2, str(len(rows)))
check("qty * price amount", rows[0][4] == 76.00, str(rows[0][4]))
check("unit price kept", rows[0][6] == 38.00, str(rows[0][6]))
check("customer id", rows[0][7] == "207119551", str(rows[0][7]))
check("skips unpaid order", ShopifyConnector.map_order({**shopify_order, "financial_status": "pending"}) == [])

# ---- Plaid transaction (shape per plaid.com/docs transactions/sync) ---------
plaid_txn = {
    "amount": 89.4, "date": "2026-03-05", "name": "CLOUDINV SOFTWARE",
    "merchant_name": "CloudInv", "pending": False,
    "personal_finance_category": {"primary": "SOFTWARE", "detailed": "SOFTWARE_SUBSCRIPTIONS"},
}
row = PlaidConnector.map_transaction(plaid_txn)
print("Plaid mapper:")
check("maps outflow", row is not None)
check("vendor prefers merchant_name", row[1] == "CloudInv", str(row[1]))
check("category lowercased", row[3] == "software", str(row[3]))
check("skips inflows (negative)", PlaidConnector.map_transaction({**plaid_txn, "amount": -500}) is None)
check("skips pending", PlaidConnector.map_transaction({**plaid_txn, "pending": True}) is None)

# ---- CSV importer end-to-end -------------------------------------------------
print("CSV importer:")
with tempfile.TemporaryDirectory() as td:
    src = Path(td) / "my_charges.csv"
    src.write_text(
        "Date,Amount,Product,customer_id\n"
        "03/04/2026,$1240.50,Wholesale order,shop-riverstone\n"
        "2026-03-05,88.00,Sunset Mug,c001\n"
        "garbage,not-a-number,x,y\n",
        encoding="utf-8",
    )
    imp = CsvImporter(str(src), "charges")
    ok, msg = imp.test_connection()
    check("schema validates (case-insensitive)", ok, msg)
    rep = imp.sync(Path(td) / "data")
    check("imports 2 good rows, skips 1", rep.files.get("charges_plus.csv") == 2 and "skipped 1" in rep.message, rep.message)
    out = (Path(td) / "data" / "charges_plus.csv").read_text().splitlines()
    check("US date normalized", out[1].startswith("2026-03-04"), out[1][:12])
    check("dollar sign stripped", "1240.5" in out[1], out[1])

    bad = CsvImporter(str(src), "expenses")
    ok, msg = bad.test_connection()
    check("wrong-kind gives precise error", not ok and "vendor" in msg, msg)

print(f"\n{'ALL GREEN' if FAIL == 0 else f'{FAIL} FAILURES'}")
sys.exit(1 if FAIL else 0)
