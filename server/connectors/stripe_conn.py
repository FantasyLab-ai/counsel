"""Stripe connector — works the moment you paste a key, test mode included.

Zero-revenue path (Brandon's case): create a free Stripe account, grab the
TEST secret key (sk_test_...), seed sandbox data with the Stripe CLI
(`stripe fixtures` / dashboard test payments), then:

    python connect.py stripe --key sk_test_xxx --sync

Uses the plain REST API over urllib — no SDK dependency. Fees come inline via
`expand[]=data.balance_transaction` so one paginated pass yields everything
the engines need.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .base import Connector, SyncReport, write_csv

API = "https://api.stripe.com/v1"


class StripeConnector(Connector):
    name = "stripe"

    def __init__(self, secret_key: str):
        self.key = secret_key.strip()

    # -- plumbing -------------------------------------------------------------
    def _get(self, path: str, params: dict | None = None) -> dict:
        qs = ("?" + urllib.parse.urlencode(params, doseq=True)) if params else ""
        req = urllib.request.Request(
            f"{API}{path}{qs}",
            headers={"Authorization": f"Bearer {self.key}",
                     "Stripe-Version": "2024-06-20"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))

    # -- contract --------------------------------------------------------------
    def test_connection(self) -> tuple[bool, str]:
        if not self.key.startswith(("sk_test_", "sk_live_", "rk_test_", "rk_live_")):
            return False, "that doesn't look like a Stripe secret key (sk_test_… / sk_live_…)"
        try:
            bal = self._get("/balance")
            mode = "TEST mode" if self.key.startswith(("sk_test_", "rk_test_")) else "LIVE mode"
            cur = (bal.get("available") or [{}])[0].get("currency", "usd").upper()
            return True, f"connected ({mode}, {cur})"
        except urllib.error.HTTPError as e:
            if e.code == 401:
                return False, "Stripe rejected the key (401) — check it's the SECRET key, not publishable"
            return False, f"Stripe HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:160]}"
        except Exception as e:  # noqa: BLE001 — network errors reported verbatim
            return False, f"network error: {e}"

    @staticmethod
    def map_charge(ch: dict) -> list | None:
        """One Stripe charge object -> one canonical charges_plus row.
        Pure + offline-testable (tests_connectors.py feeds it fixture JSON)."""
        if not ch.get("paid") or ch.get("refunded"):
            return None
        ts = datetime.fromtimestamp(ch["created"], tz=timezone.utc)
        amount = ch["amount"] / 100.0
        bt = ch.get("balance_transaction")
        fee = (bt.get("fee", 0) / 100.0) if isinstance(bt, dict) else 0.0
        meta = ch.get("metadata") or {}
        return [
            ts.date().isoformat(),
            ch["id"],
            meta.get("product") or (ch.get("description") or "charge")[:60],
            meta.get("channel", "stripe"),
            round(amount, 2),
            int(meta.get("qty", 1) or 1),
            round(float(meta.get("unit_price", amount) or amount), 2),
            ch.get("customer") or "guest",
            round(fee, 2),
        ]

    def sync(self, data_dir: Path) -> SyncReport:
        ok, msg = self.test_connection()
        if not ok:
            return SyncReport(self.name, False, msg)
        rows: list[list] = []
        params: dict = {"limit": 100, "expand[]": "data.balance_transaction"}
        pages = 0
        while pages < 50:  # safety: 5,000 charges per sync
            data = self._get("/charges", params)
            for ch in data.get("data", []):
                row = self.map_charge(ch)
                if row:
                    rows.append(row)
            if not data.get("has_more"):
                break
            params["starting_after"] = data["data"][-1]["id"]
            pages += 1
        rows.sort(key=lambda r: r[0])
        n = write_csv(
            data_dir / "charges_plus.csv",
            ["date", "order_id", "product", "channel", "amount", "qty", "unit_price", "customer_id", "fee"],
            rows,
        )
        # Also refresh the engine's simpler charges.csv view.
        simple = [[r[0], r[1], r[2], r[3], r[4], 0] for r in rows]
        write_csv(data_dir / "charges.csv",
                  ["date", "order_id", "product", "channel", "amount", "is_repeat"], simple)
        return SyncReport(self.name, True, msg, {"charges_plus.csv": n, "charges.csv": n})
