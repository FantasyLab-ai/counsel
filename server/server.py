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
