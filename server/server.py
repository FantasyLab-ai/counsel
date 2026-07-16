"""Counsel backend — a thin Flask service over the Aurora engine adapter.

Serves the exact contract the frontend seam (src/api/counsel.ts) defines.
Run (reusing the Aurora venv, which has every dependency):

    $env:AURORA_REPO = "C:\\Users\\bgrut\\Desktop\\Aurora_QIE"
    C:\\Users\\bgrut\\Desktop\\Aurora_QIE\\.venv\\Scripts\\python.exe server.py

Port: 8100 (COUNSEL_PORT to override).
"""
from __future__ import annotations

import os

from flask import Flask, jsonify, request
from flask_cors import CORS

import engine

app = Flask(__name__)
CORS(app)


@app.route("/api/health")
def health():
    L = engine.ledger()
    return jsonify({"ok": True, "service": "counsel-backend", "orders": len(L["charges"]),
                    "today": L["today"].isoformat(), "aurora_repo": engine.AURORA_REPO})


# ---------------------------------------------------------------------------
# Connectors — the same faucets as connect.py, over HTTP for the app.
# POST /api/connect/<source> with the credential fields; add "sync": true to
# import after a successful test. Credentials are used for the call and NOT
# persisted (bring a token store when accounts land in Phase 2C).
# ---------------------------------------------------------------------------
from pathlib import Path as _Path  # noqa: E402

from connectors.csv_import import CsvImporter  # noqa: E402
from connectors.others import PlaidConnector, ShopifyConnector, SquareConnector  # noqa: E402
from connectors.stripe_conn import StripeConnector  # noqa: E402

_DATA_DIR = _Path(__file__).parent / "data"


def _build_connector(source: str, body: dict):
    if source == "stripe":
        return StripeConnector(body.get("key", ""))
    if source == "square":
        return SquareConnector(body.get("token", ""), sandbox=not body.get("live"))
    if source == "shopify":
        return ShopifyConnector(body.get("shop", ""), body.get("token", ""))
    if source == "plaid":
        return PlaidConnector(body.get("client_id", ""), body.get("secret", ""),
                              body.get("access_token", ""),
                              env="production" if body.get("live") else "sandbox")
    return None


@app.route("/api/connect/<source>", methods=["POST"])
def api_connect(source: str):
    body = request.get_json(silent=True) or {}
    conn = _build_connector(source, body)
    if conn is None:
        return jsonify({"ok": False, "error": f"unknown source '{source}'"}), 400
    ok, msg = conn.test_connection()
    out = {"ok": ok, "source": source, "message": msg}
    if ok and body.get("sync"):
        report = conn.sync(_DATA_DIR)
        out["synced"] = report.ok
        out["files"] = report.files
        if report.ok:
            engine.reset_cache() if hasattr(engine, "reset_cache") else None
            out["message"] = f"{msg} · imported {sum(report.files.values())} rows — engines now run on this data"
    return jsonify(out), (200 if ok else 422)


@app.route("/api/import/csv", methods=["POST"])
def api_import_csv():
    """Multipart CSV upload: fields `kind` + `file`. The server-side twin of
    the app's on-device drop-in (useful once the backend is hosted)."""
    kind = request.form.get("kind", "charges")
    f = request.files.get("file")
    if f is None:
        return jsonify({"ok": False, "error": "no file"}), 400
    tmp = _DATA_DIR / f"_upload_{kind}.csv"
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    f.save(tmp)
    imp = CsvImporter(str(tmp), kind)
    ok, msg = imp.test_connection()
    if not ok:
        tmp.unlink(missing_ok=True)
        return jsonify({"ok": False, "error": msg}), 422
    report = imp.sync(_DATA_DIR)
    tmp.unlink(missing_ok=True)
    return jsonify({"ok": report.ok, "message": report.message, "files": report.files})


@app.route("/api/brief")
def brief():
    return jsonify(engine.compute_brief())


@app.route("/api/metrics")
def metrics():
    # period is accepted for contract-compatibility; the demo ledger is one
    # continuous window, so period currently selects nothing different.
    _ = request.args.get("period", "month")
    return jsonify(engine.compute_metrics())


@app.route("/api/ask", methods=["POST"])
def ask():
    body = request.get_json(silent=True) or {}
    q = str(body.get("question") or "")
    if not q.strip():
        return jsonify({"error": "question required"}), 400
    return jsonify(engine.answer(q))


@app.route("/api/connections")
def conns():
    return jsonify(engine.connections())


if __name__ == "__main__":
    port = int(os.environ.get("COUNSEL_PORT", "8100"))
    print(f"Counsel backend on http://127.0.0.1:{port} · Aurora at {engine.AURORA_REPO}")
    # Warm the caches so the first request is instant.
    engine.compute_metrics()
    app.run(host="127.0.0.1", port=port)
