"""Square, Shopify and Plaid connectors — real endpoints, real auth headers,
offline-testable mappers. Each needs only the credential named in its
constructor; test_connection() tells you precisely what's wrong otherwise.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from .base import Connector, SyncReport, write_csv


def _get_json(url: str, headers: dict) -> dict:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def _post_json(url: str, headers: dict, body: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                 headers={**headers, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def _http_err(e: urllib.error.HTTPError, who: str) -> str:
    if e.code == 401:
        return f"{who} rejected the credential (401) — check the token/key"
    return f"{who} HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:160]}"


# =============================== SQUARE ======================================
class SquareConnector(Connector):
    """Payments API. Sandbox tokens (EAAA…) work against the sandbox host —
    Square gives every developer account a sandbox with a seedable test
    seller, so this is fully exercisable with zero revenue."""

    name = "square"

    def __init__(self, access_token: str, sandbox: bool = True):
        self.token = access_token.strip()
        self.host = "https://connect.squareupsandbox.com" if sandbox else "https://connect.squareup.com"

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}", "Square-Version": "2024-06-04"}

    def test_connection(self) -> tuple[bool, str]:
        try:
            me = _get_json(f"{self.host}/v2/merchants", self._headers())
            biz = (me.get("merchant") or [{}])[0].get("business_name", "merchant")
            return True, f"connected to Square ({biz}, {'sandbox' if 'sandbox' in self.host else 'live'})"
        except urllib.error.HTTPError as e:
            return False, _http_err(e, "Square")
        except Exception as e:  # noqa: BLE001
            return False, f"network error: {e}"

    @staticmethod
    def map_payment(p: dict) -> list | None:
        if p.get("status") != "COMPLETED":
            return None
        amt = (p.get("amount_money") or {}).get("amount", 0) / 100.0
        fee = sum(f.get("amount_money", {}).get("amount", 0) for f in p.get("processing_fee") or []) / 100.0
        return [p["created_at"][:10], p["id"], (p.get("note") or "square-sale")[:60],
                "square", round(amt, 2), 1, round(amt, 2),
                p.get("customer_id") or "guest", round(fee, 2)]

    def sync(self, data_dir: Path) -> SyncReport:
        ok, msg = self.test_connection()
        if not ok:
            return SyncReport(self.name, False, msg)
        rows, cursor, pages = [], None, 0
        while pages < 50:
            qs = "?limit=100" + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else "")
            data = _get_json(f"{self.host}/v2/payments{qs}", self._headers())
            rows += [r for p in data.get("payments", []) if (r := self.map_payment(p))]
            cursor = data.get("cursor")
            if not cursor:
                break
            pages += 1
        rows.sort(key=lambda r: r[0])
        n = write_csv(data_dir / "charges_plus.csv",
                      ["date", "order_id", "product", "channel", "amount", "qty", "unit_price", "customer_id", "fee"], rows)
        write_csv(data_dir / "charges.csv",
                  ["date", "order_id", "product", "channel", "amount", "is_repeat"],
                  [[r[0], r[1], r[2], r[3], r[4], 0] for r in rows])
        return SyncReport(self.name, True, msg, {"charges_plus.csv": n, "charges.csv": n})


# =============================== SHOPIFY =====================================
class ShopifyConnector(Connector):
    """Admin REST API via a custom-app Admin token (shpat_…). Dev stores are
    free and can be seeded with test orders — another zero-revenue path."""

    name = "shopify"

    def __init__(self, shop: str, admin_token: str):
        self.shop = shop.replace("https://", "").split(".")[0]
        self.token = admin_token.strip()
        self.base = f"https://{self.shop}.myshopify.com/admin/api/2024-04"

    def _headers(self) -> dict:
        return {"X-Shopify-Access-Token": self.token}

    def test_connection(self) -> tuple[bool, str]:
        try:
            info = _get_json(f"{self.base}/shop.json", self._headers())
            return True, f"connected to Shopify ({info.get('shop', {}).get('name', self.shop)})"
        except urllib.error.HTTPError as e:
            return False, _http_err(e, "Shopify")
        except Exception as e:  # noqa: BLE001
            return False, f"network error: {e}"

    @staticmethod
    def map_order(o: dict) -> list[list]:
        if o.get("cancelled_at") or o.get("test") is None and o.get("financial_status") not in ("paid", "partially_refunded"):
            if o.get("financial_status") not in ("paid", "partially_refunded"):
                return []
        date = (o.get("processed_at") or o.get("created_at") or "")[:10]
        cust = str((o.get("customer") or {}).get("id") or "guest")
        out = []
        for li in o.get("line_items", []):
            price = float(li.get("price", 0))
            qty = int(li.get("quantity", 1))
            out.append([date, f"{o['id']}-{li['id']}", (li.get("title") or "item")[:60],
                        o.get("source_name", "shopify"), round(price * qty, 2),
                        qty, round(price, 2), cust, 0.0])
        return out

    def sync(self, data_dir: Path) -> SyncReport:
        ok, msg = self.test_connection()
        if not ok:
            return SyncReport(self.name, False, msg)
        rows: list[list] = []
        url = f"{self.base}/orders.json?status=any&limit=250"
        data = _get_json(url, self._headers())
        for o in data.get("orders", []):
            rows += self.map_order(o)
        rows.sort(key=lambda r: r[0])
        n = write_csv(data_dir / "charges_plus.csv",
                      ["date", "order_id", "product", "channel", "amount", "qty", "unit_price", "customer_id", "fee"], rows)
        write_csv(data_dir / "charges.csv",
                  ["date", "order_id", "product", "channel", "amount", "is_repeat"],
                  [[r[0], r[1], r[2], r[3], r[4], 0] for r in rows])
        return SyncReport(self.name, True, msg, {"charges_plus.csv": n, "charges.csv": n})


# =============================== PLAID =======================================
class PlaidConnector(Connector):
    """Bank transactions -> expenses.csv. Plaid's SANDBOX is free and ships
    fake institutions (user_good / pass_good), so the whole flow is testable
    without a bank. Needs client_id + secret + an access_token from Link."""

    name = "plaid"

    def __init__(self, client_id: str, secret: str, access_token: str, env: str = "sandbox"):
        self.client_id, self.secret, self.access_token = client_id.strip(), secret.strip(), access_token.strip()
        self.base = f"https://{env}.plaid.com"

    def test_connection(self) -> tuple[bool, str]:
        try:
            j = _post_json(f"{self.base}/item/get", {}, {
                "client_id": self.client_id, "secret": self.secret, "access_token": self.access_token})
            inst = j.get("item", {}).get("institution_id", "bank")
            return True, f"connected to Plaid ({inst}, {self.base.split('//')[1].split('.')[0]})"
        except urllib.error.HTTPError as e:
            return False, _http_err(e, "Plaid")
        except Exception as e:  # noqa: BLE001
            return False, f"network error: {e}"

    @staticmethod
    def map_transaction(t: dict) -> list | None:
        # Plaid: positive amount = money OUT. Expenses only; deposits skipped.
        if t.get("amount", 0) <= 0 or t.get("pending"):
            return None
        cat = (t.get("personal_finance_category") or {}).get("primary", "other").lower()
        return [t.get("date", ""), (t.get("merchant_name") or t.get("name") or "unknown")[:60],
                round(float(t["amount"]), 2), cat]

    def sync(self, data_dir: Path) -> SyncReport:
        ok, msg = self.test_connection()
        if not ok:
            return SyncReport(self.name, False, msg)
        rows, cursor, guard = [], None, 0
        while guard < 20:
            body = {"client_id": self.client_id, "secret": self.secret,
                    "access_token": self.access_token, "count": 500}
            if cursor:
                body["cursor"] = cursor
            j = _post_json(f"{self.base}/transactions/sync", {}, body)
            rows += [r for t in j.get("added", []) if (r := self.map_transaction(t))]
            cursor = j.get("next_cursor")
            if not j.get("has_more"):
                break
            guard += 1
        rows.sort(key=lambda r: r[0])
        n = write_csv(data_dir / "expenses.csv", ["date", "vendor", "amount", "category"], rows)
        return SyncReport(self.name, True, msg, {"expenses.csv": n})
