"""Golden-reference generator — the parity contract for aurora-core (Rust).

Runs the PYTHON Aurora engine (the single source of truth) over a corpus of
seeded series and records exact outputs. The Rust crate's test suite loads
golden.json and must match:

  - change points:  exact index equality (ruptures PELT, rbf + l2)
  - Welch t-test:   t and p to 1e-9 relative (vs scipy)
  - AR(1) forecast: coefficients/points/resid_std to 1e-9 relative;
                    bands within Monte-Carlo sampling error (Python uses
                    an 800-draw MC; Rust computes the analytic quantiles
                    the MC approximates)

Never edit golden.json by hand. Regenerate with:
  AURORA_REPO=<aurora checkout> python gen_golden.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np

AURORA_REPO = os.environ.get("AURORA_REPO", r"C:\Users\bgrut\Desktop\Aurora_QIE")
sys.path.insert(0, AURORA_REPO)

from scipy import stats  # noqa: E402
from fantasyai.aurora.advanced_models import detect_changepoints  # noqa: E402
from fantasyai.aurora.math.forecasting import _fit_forecast_ar1, _resid_bands  # noqa: E402

HERE = Path(__file__).parent
rng = np.random.default_rng(20260715)


def series_corpus() -> dict[str, np.ndarray]:
    out: dict[str, np.ndarray] = {}
    # single clean level shift
    out["single_break"] = np.concatenate([rng.normal(10, 1, 80), rng.normal(6, 1, 40)])
    # two breaks
    out["double_break"] = np.concatenate(
        [rng.normal(0, 1, 60), rng.normal(4, 1, 50), rng.normal(1.5, 1.2, 45)])
    # no break — pure noise
    out["no_break"] = rng.normal(5, 2, 120)
    # trend + noise (PELT on rbf segments trends too — whatever it says IS the reference)
    out["trend"] = np.linspace(0, 8, 150) + rng.normal(0, 0.8, 150)
    # heavy-tailed noise with a shift
    out["heavy_tail"] = np.concatenate(
        [rng.standard_t(2, 70) * 1.5 + 3, rng.standard_t(2, 50) * 1.5 + 7])
    # short series
    out["short"] = np.concatenate([rng.normal(2, 0.5, 25), rng.normal(4, 0.5, 15)])
    # variance change only
    out["var_change"] = np.concatenate([rng.normal(0, 0.5, 70), rng.normal(0, 2.5, 50)])
    # the real Kiln & Co. daily revenue (the actual product path)
    try:
        import pandas as pd
        charges = pd.read_csv(HERE.parent.parent / "server" / "data" / "charges.csv",
                              parse_dates=["date"])
        out["kiln_daily_revenue"] = (
            charges.groupby("date")["amount"].sum().to_numpy(dtype=float))
    except Exception as e:  # pragma: no cover
        print("warn: kiln series skipped:", e)
    return out


def main() -> None:
    corpus = series_corpus()

    changepoint_cases = []
    for name, y in corpus.items():
        for model in ("rbf", "l2"):
            for pen in (5.0, 10.0, 25.0):
                res = detect_changepoints(y.tolist(), model=model, penalty=pen)
                changepoint_cases.append({
                    "name": f"{name}/{model}/pen{pen:g}",
                    "values": [float(v) for v in y],
                    "model": model,
                    "penalty": pen,
                    "expected_indices": [int(i) for i in res.indices],
                })

    welch_cases = []
    welch_specs = [
        ("clear_diff", rng.normal(10, 1, 40), rng.normal(6, 1, 35)),
        ("subtle_diff", rng.normal(5, 2, 60), rng.normal(5.5, 2, 55)),
        ("no_diff", rng.normal(3, 1, 50), rng.normal(3, 1, 50)),
        ("uneven_n", rng.normal(0, 1, 12), rng.normal(1.2, 3, 90)),
        ("tiny_p", rng.normal(0, 0.2, 80), rng.normal(4, 0.2, 80)),
        ("kiln_break", None, None),  # filled below from the real ledger series
    ]
    kiln = corpus.get("kiln_daily_revenue")
    for name, a, b in welch_specs:
        if name == "kiln_break":
            if kiln is None:
                continue
            cp = detect_changepoints(kiln.tolist(), model="rbf", penalty=10.0)
            if not cp.indices:
                continue
            idx = cp.indices[-1]
            a, b = kiln[:idx], kiln[idx:]
        t, p = stats.ttest_ind(np.asarray(a), np.asarray(b), equal_var=False)
        welch_cases.append({
            "name": name,
            "a": [float(v) for v in a],
            "b": [float(v) for v in b],
            "expected_t": float(t),
            "expected_p": float(p),
        })

    ar1_cases = []
    for name in ("single_break", "no_break", "trend", "kiln_daily_revenue"):
        y = corpus.get(name)
        if y is None:
            continue
        h, alpha = 30, 0.05
        fit = _fit_forecast_ar1(np.asarray(y, dtype=float), h)
        bands = _resid_bands(fit["forecast"], fit["resid_std"], alpha=alpha, seed=0)
        ar1_cases.append({
            "name": name,
            "values": [float(v) for v in y],
            "horizon": h,
            "alpha": alpha,
            "expected_a": fit["a"],
            "expected_b": fit["b"],
            "expected_forecast": [float(v) for v in fit["forecast"]],
            "expected_resid_std": fit["resid_std"],
            "mc_lo": bands["lo"],
            "mc_hi": bands["hi"],
        })

    golden = {
        "generator": "gen_golden.py",
        "engine": "python-aurora (ruptures 1.1.10 · scipy · numpy)",
        "changepoint": changepoint_cases,
        "welch": welch_cases,
        "ar1": ar1_cases,
    }
    (HERE / "golden.json").write_text(json.dumps(golden), encoding="utf-8")
    print(f"golden.json: {len(changepoint_cases)} changepoint · {len(welch_cases)} welch · {len(ar1_cases)} ar1 cases")


if __name__ == "__main__":
    main()
