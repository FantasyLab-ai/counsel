"""Counsel connect CLI — plug a source in, test it, sync it.

Examples (any Python 3.10+, no extra deps):

    # Stripe (free account, TEST key, sandbox data — zero revenue needed)
    python connect.py stripe --key sk_test_xxx
    python connect.py stripe --key sk_test_xxx --sync

    # Square sandbox / Shopify dev store / Plaid sandbox
    python connect.py square  --token EAAAxxx --sync
    python connect.py shopify --shop kiln-and-co --token shpat_xxx --sync
    python connect.py plaid   --client-id xxx --secret xxx --access-token access-sandbox-xxx --sync

    # The zero-account path: drop in any CSV matching the Power Up schemas
    python connect.py csv --file my_charges.csv --kind charges --sync

Without --sync it only tests the connection and reports honestly.
After a sync, restart server.py — the engines pick up the new data.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from connectors.base import Connector  # noqa: E402
from connectors.csv_import import CsvImporter  # noqa: E402
from connectors.others import PlaidConnector, ShopifyConnector, SquareConnector  # noqa: E402
from connectors.stripe_conn import StripeConnector  # noqa: E402

DATA_DIR = Path(__file__).parent / "data"


def build(args: argparse.Namespace) -> Connector:
    if args.source == "stripe":
        return StripeConnector(args.key)
    if args.source == "square":
        return SquareConnector(args.token, sandbox=not args.live)
    if args.source == "shopify":
        return ShopifyConnector(args.shop, args.token)
    if args.source == "plaid":
        return PlaidConnector(args.client_id, args.secret, args.access_token,
                              env="production" if args.live else "sandbox")
    if args.source == "csv":
        return CsvImporter(args.file, args.kind)
    raise SystemExit(f"unknown source {args.source}")


def main() -> None:
    p = argparse.ArgumentParser(description="Counsel data connectors")
    sub = p.add_subparsers(dest="source", required=True)

    s = sub.add_parser("stripe"); s.add_argument("--key", required=True)
    q = sub.add_parser("square"); q.add_argument("--token", required=True); q.add_argument("--live", action="store_true")
    h = sub.add_parser("shopify"); h.add_argument("--shop", required=True); h.add_argument("--token", required=True)
    pl = sub.add_parser("plaid")
    pl.add_argument("--client-id", required=True); pl.add_argument("--secret", required=True)
    pl.add_argument("--access-token", required=True); pl.add_argument("--live", action="store_true")
    c = sub.add_parser("csv"); c.add_argument("--file", required=True)
    c.add_argument("--kind", required=True, choices=["charges", "expenses", "invoices", "inventory", "shipments"])

    for sp in (s, q, h, pl, c):
        sp.add_argument("--sync", action="store_true", help="import after a successful test")

    args = p.parse_args()
    conn = build(args)
    ok, msg = conn.test_connection()
    print(f"[{conn.name}] {'OK' if ok else 'FAILED'} — {msg}")
    if not ok:
        sys.exit(1)
    if args.sync:
        report = conn.sync(DATA_DIR)
        print(report.pretty())
        if report.ok:
            print("\nNow restart server.py — every Counsel engine runs on the new data.")
        sys.exit(0 if report.ok else 1)


if __name__ == "__main__":
    main()
