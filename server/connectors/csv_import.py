"""CSV drop-in — the zero-account faucet. Validates a user file against the
schemas Power Up documents, normalizes it, writes the canonical file. This is
how Brandon (or anyone with no Stripe history) fuels Counsel with any real
dataset today: a bank export, an Etsy CSV, Kaggle's Olist/UCI retail sets
mapped to these columns, or a spreadsheet.
"""
from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path

from .base import Connector, SyncReport, write_csv

SCHEMAS: dict[str, dict] = {
    "charges": {
        "required": ["date", "amount"],
        "optional": ["order_id", "product", "channel", "qty", "unit_price", "customer_id", "fee"],
        "out": "charges_plus.csv",
        "header": ["date", "order_id", "product", "channel", "amount", "qty", "unit_price", "customer_id", "fee"],
    },
    "expenses": {
        "required": ["date", "vendor", "amount"],
        "optional": ["category"],
        "out": "expenses.csv",
        "header": ["date", "vendor", "amount", "category"],
    },
    "invoices": {
        "required": ["issued", "due", "amount", "client"],
        "optional": ["id", "paid_date"],
        "out": "invoices.csv",
        "header": ["id", "client", "issued", "due", "amount", "paid"],
    },
    "inventory": {
        "required": ["product", "on_hand"],
        "optional": ["incoming", "incoming_eta"],
        "out": "inventory.csv",
        "header": ["product", "on_hand", "incoming", "incoming_eta"],
    },
    "shipments": {
        "required": ["order_id", "carrier", "tracking_id", "shipped_date"],
        "optional": [],
        "out": "shipments.csv",
        "header": ["order_id", "carrier", "tracking_id", "shipped_date"],
    },
}

DATE_FORMATS = ["%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d-%m-%Y", "%Y/%m/%d"]


def _norm_date(v: str) -> str | None:
    v = v.strip()[:19]
    for f in DATE_FORMATS:
        try:
            return datetime.strptime(v.split(" ")[0].split("T")[0], f).date().isoformat()
        except ValueError:
            continue
    return None


class CsvImporter(Connector):
    name = "csv"

    def __init__(self, file: str, kind: str):
        self.file = Path(file)
        self.kind = kind.lower()

    def test_connection(self) -> tuple[bool, str]:
        if self.kind not in SCHEMAS:
            return False, f"unknown kind '{self.kind}' — one of {', '.join(SCHEMAS)}"
        if not self.file.exists():
            return False, f"file not found: {self.file}"
        with self.file.open(encoding="utf-8-sig") as fh:
            cols = [c.strip().lower() for c in (next(csv.reader(fh), []) or [])]
        missing = [c for c in SCHEMAS[self.kind]["required"] if c not in cols]
        if missing:
            return False, f"missing required column(s): {', '.join(missing)} (found: {', '.join(cols) or 'none'})"
        return True, f"schema OK ({', '.join(cols)})"

    def sync(self, data_dir: Path) -> SyncReport:
        ok, msg = self.test_connection()
        if not ok:
            return SyncReport(self.name, False, msg)
        spec = SCHEMAS[self.kind]
        rows, skipped = [], 0
        with self.file.open(encoding="utf-8-sig") as fh:
            for rec in csv.DictReader(fh):
                rec = {k.strip().lower(): (v or "").strip() for k, v in rec.items()}
                if self.kind == "charges":
                    date = _norm_date(rec.get("date", ""))
                    try:
                        amount = round(float(rec["amount"].replace("$", "").replace(",", "")), 2)
                    except (ValueError, KeyError):
                        amount = None
                    if not date or amount is None:
                        skipped += 1
                        continue
                    qty = int(float(rec.get("qty") or 1))
                    rows.append([date, rec.get("order_id") or f"row{len(rows)+1}",
                                 (rec.get("product") or "sale")[:60], rec.get("channel") or "import",
                                 amount, qty,
                                 round(float(rec.get("unit_price") or amount / max(1, qty)), 2),
                                 rec.get("customer_id") or "guest",
                                 round(float(rec.get("fee") or 0), 2)])
                elif self.kind == "expenses":
                    date = _norm_date(rec.get("date", ""))
                    try:
                        amount = round(float(rec["amount"].replace("$", "").replace(",", "")), 2)
                    except (ValueError, KeyError):
                        amount = None
                    if not date or amount is None:
                        skipped += 1
                        continue
                    rows.append([date, rec.get("vendor", "unknown")[:60], amount,
                                 rec.get("category") or "other"])
                elif self.kind == "invoices":
                    issued, due = _norm_date(rec.get("issued", "")), _norm_date(rec.get("due", ""))
                    if not issued or not due:
                        skipped += 1
                        continue
                    rows.append([rec.get("id") or f"inv-{len(rows)+1}", rec.get("client", "client"),
                                 issued, due, round(float(rec.get("amount", 0) or 0), 2),
                                 _norm_date(rec.get("paid_date", "")) or ""])
                elif self.kind == "inventory":
                    rows.append([rec.get("product", ""), int(float(rec.get("on_hand", 0) or 0)),
                                 int(float(rec.get("incoming", 0) or 0)), rec.get("incoming_eta") or ""])
                elif self.kind == "shipments":
                    d = _norm_date(rec.get("shipped_date", ""))
                    if not d:
                        skipped += 1
                        continue
                    rows.append([rec.get("order_id", ""), rec.get("carrier", ""),
                                 rec.get("tracking_id", ""), d])
        if self.kind == "charges":
            rows.sort(key=lambda r: r[0])
        n = write_csv(data_dir / spec["out"], spec["header"], rows)
        if self.kind == "charges":
            write_csv(data_dir / "charges.csv",
                      ["date", "order_id", "product", "channel", "amount", "is_repeat"],
                      [[r[0], r[1], r[2], r[3], r[4], 0] for r in rows])
        note = f"imported {n} rows" + (f" · skipped {skipped} malformed" if skipped else "")
        return SyncReport(self.name, True, note, {spec["out"]: n})
