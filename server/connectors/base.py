"""Connector contract — every source (Stripe, Square, Shopify, Plaid, CSV)
normalizes into the SAME canonical files under server/data/, which is exactly
what engine.py + the Aurora methods consume. One schema, many faucets.

Canonical schemas (the same ones Power Up shows users):
  charges.csv   date, order_id, product, channel, amount, is_repeat
                (+ optional qty, unit_price, customer_id, fee -> charges_plus.csv)
  expenses.csv  date, vendor, amount, category
  invoices.csv  id, client, issued, due, amount, paid
  inventory.csv product, on_hand, incoming, incoming_eta
  shipments.csv order_id, carrier, tracking_id, shipped_date
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class SyncReport:
    connector: str
    ok: bool
    message: str
    files: dict[str, int] = field(default_factory=dict)  # filename -> rows written

    def pretty(self) -> str:
        lines = [f"[{self.connector}] {'OK' if self.ok else 'FAILED'} — {self.message}"]
        for f, n in self.files.items():
            lines.append(f"    wrote {n:>5} rows -> {f}")
        return "\n".join(lines)


class Connector:
    """Subclass per source. test_connection() must be cheap and honest —
    a precise error beats a vague success."""

    name = "base"

    def test_connection(self) -> tuple[bool, str]:
        raise NotImplementedError

    def sync(self, data_dir: Path) -> SyncReport:
        raise NotImplementedError


def write_csv(path: Path, header: list[str], rows: list[list]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    return len(rows)
