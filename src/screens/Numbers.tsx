// Numbers — every metric can show its work. Each card's math is a DIFFERENT
// shape (stat test / band / arithmetic / attribution / trend): the engine
// picks the right method per question. That variety IS the glass box.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMetrics, type Metric, type Period } from "../api/counsel";
import { ConfidencePill, CountUp, Html, Reveal } from "../components/ui";
import { MathView } from "../components/charts";

const PERIODS: { id: Period; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "quarter", label: "Quarter" },
];

export default function Numbers() {
  const nav = useNavigate();
  const [period, setPeriod] = useState<Period>("month");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({ revenue: true });

  useEffect(() => {
    let on = true;
    getMetrics(period).then((m) => on && setMetrics(m));
    return () => { on = false; };
  }, [period]);

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">Kiln &amp; Co. · March</div>
          <h1>The numbers, read</h1>
        </div>
        <button className="export-btn" onClick={() => nav("/packet")}
          title="Banker's Packet — lender-ready, every figure cited">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          Packet
        </button>
      </div>

      <div className="period" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={period === p.id}
            className={`seg ${period === p.id ? "on" : ""}`}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="reassure">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        Every number below can show its work. Tap “show the math” on any card.
      </div>

      {metrics.map((m, i) => (
        <Reveal i={i} key={m.id}>
          <article className={`mcard ${open[m.id] ? "open" : ""}`}>
            <div className="mhead">
              <div>
                <div className="mlabel">{m.label}</div>
                <div className="mval">
                  <CountUp value={m.value} />
                  {m.delta && <span className={`dlt ${m.delta.dir}`}>{m.delta.text}</span>}
                </div>
              </div>
              <ConfidencePill confidence={m.confidence} label={m.confidenceLabel} />
            </div>
            <div className="mmean"><Html text={m.meaning} /></div>
            {m.math && (
              <>
                <button
                  className="mtoggle"
                  aria-expanded={!!open[m.id]}
                  onClick={() => setOpen((o) => ({ ...o, [m.id]: !o[m.id] }))}
                >
                  <span>Show the math</span>
                  <span className="chev">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 9l6 6 6-6" /></svg>
                  </span>
                </button>
                <div className="mmath">
                  <div className="mmath-inner">{open[m.id] && <MathView math={m.math} />}</div>
                </div>
              </>
            )}
          </article>
        </Reveal>
      ))}
    </div>
  );
}
