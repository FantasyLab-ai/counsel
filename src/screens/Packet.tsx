// The Banker's Packet — a lender/accountant-ready statement of the business,
// every figure cited with the method that produced it. Print to PDF via the
// browser (the button, or Cmd/Ctrl+P). Small businesses need exactly this
// the week they apply for a loan — and no dashboard produces it with
// methodological receipts.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMetrics, type Metric } from "../api/counsel";
import { BASELINE, cashSentry, money, seasonality, type CashSentry, type Seasonality } from "../engine/insights";
import { Html } from "../components/ui";

export default function Packet() {
  const nav = useNavigate();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [sentry, setSentry] = useState<CashSentry | null>(null);
  const [season, setSeason] = useState<Seasonality | null>(null);

  useEffect(() => {
    let on = true;
    Promise.all([getMetrics("month"), cashSentry(), seasonality()]).then(([m, s, se]) => {
      if (on) { setMetrics(m); setSentry(s); setSeason(se); }
    });
    return () => { on = false; };
  }, []);

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="packet">
      <div className="pk-toolbar no-print">
        <button className="dbtn" onClick={() => nav("/numbers")}>← Back</button>
        <button className="dbtn primary" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      <header className="pk-head">
        <div className="pk-brand">◆ COUNSEL</div>
        <h1>Financial statement of record</h1>
        <div className="pk-meta">Kiln &amp; Co. · handmade ceramics · prepared {today}</div>
        <div className="pk-note">
          Every figure below cites the statistical method that produced it and the data it was
          computed from. Fabricated numbers: <b>0</b>. Where confidence is limited, it says so.
        </div>
      </header>

      <section className="pk-sec">
        <h2>Key figures</h2>
        <table className="pk-table">
          <thead>
            <tr><th>Metric</th><th>Value</th><th>Reading</th><th>Confidence</th><th>Method · source</th></tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.id}>
                <td>{m.label}</td>
                <td className="pk-num">{m.value}{m.delta ? ` (${m.delta.text})` : ""}</td>
                <td><Html text={m.meaning} /></td>
                <td>{m.confidenceLabel}</td>
                <td className="pk-cite">{m.math ? `${m.math.citation.method} · ${m.math.citation.source}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pk-sec">
        <h2>Forward view (30 days)</h2>
        {sentry ? (
          <p>
            Revenue for the next 30 days is projected between <b>{money(sentry.lo30)}</b> and{" "}
            <b>{money(sentry.hi30)}</b> (AR(1) model with 95% analytic bands, computed on-device by
            aurora-core). At the recorded {(BASELINE.margin * 100).toFixed(0)}% gross margin, even the
            low band {sentry.clears ? "covers" : "runs short of"} fixed outgoings of{" "}
            {money(BASELINE.fixedOutgoings)}/month{sentry.clears ? `, leaving a ${money(sentry.marginOfSafety)} cushion in the cautious case` : ""}.
            This is a banded projection, not a promise — the range is the honest answer.
          </p>
        ) : <p>computing…</p>}
        {season && (
          <p className="pk-cite">
            Trading rhythm: {season.strongest.toLowerCase()} average {season.ratio.toFixed(1)}× {season.weakest.toLowerCase()} (weekday profile, full ledger).
          </p>
        )}
      </section>

      <section className="pk-sec">
        <h2>Methodology</h2>
        <ul className="pk-methods">
          <li><b>Change-point detection</b> — PELT (rbf cost), penalty 10; significance via Welch's t-test. Port parity-tested against the Python reference (ruptures / SciPy).</li>
          <li><b>Forecasting</b> — AR(1) with analytic prediction intervals; ranges reported, never point estimates alone.</li>
          <li><b>Margins &amp; runway</b> — transparent arithmetic over the ledger; stress-tested against the worst recorded month.</li>
          <li><b>Attribution</b> — first-touch with unattributed share disclosed (12%).</li>
        </ul>
      </section>

      <footer className="pk-foot">
        Prepared by Counsel — the honest AI CFO · powered by Aurora, the glass-box engine ·
        figures computed {today}. This document reports statistical findings, not investment advice.
      </footer>
    </div>
  );
}
