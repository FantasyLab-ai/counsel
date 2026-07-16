// Today — the morning brief. The advisor SPEAKS on dark stationery, then
// SHOWS on paper: triaged attention, read tiles (break-line on revenue),
// the honest "watching" section, and connected sources.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBrief, getMetrics, type Brief, type Metric } from "../api/counsel";
import { CitePill, ConfidencePill, CountUp, Html, Reveal } from "../components/ui";
import { BreakSpark } from "../components/charts";

const SHIELD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export default function Today() {
  const nav = useNavigate();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  useEffect(() => {
    let on = true;
    getBrief().then((b) => on && setBrief(b));
    getMetrics("month").then((m) => on && setMetrics(m));
    return () => { on = false; };
  }, []);

  if (!brief) {
    return (
      <div className="app">
        <div className="appbar">
          <div className="wordmark"><b>Counsel</b><span>by Aurora</span></div>
          <div className="avatar">B</div>
        </div>
        <div className="greet">reading your numbers…</div>
      </div>
    );
  }

  // Only the four dashboard tiles (revenue wide, margin, cash, customers wide)
  const dash = metrics.filter((m) => ["revenue", "margin", "runway", "customers"].includes(m.id));

  return (
    <div className="app">
      <div className="appbar">
        <div className="wordmark"><b>Counsel</b><span>by Aurora</span></div>
        <div className="avatar">B</div>
      </div>
      <div className="greet">
        {brief.greeting.date} · <b>{brief.greeting.business}</b>
      </div>

      <Reveal i={0}>
        <section className="voice">
          <div className="eyebrow on-dark">{brief.state.eyebrow}</div>
          <div className="said"><Html text={brief.state.headline} /></div>
          <div className="sub">{brief.state.sub}</div>
          <div className="micro">
            {brief.state.micro.map((m) => (
              <div className="m" key={m.label}>
                <div className="ml">{m.label}</div>
                <div className="mv"><span className={`dot dot-${m.tone}`} />{m.value}</div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <div className="eyebrow">Needs your attention</div>
      <div className="rows">
        {brief.attention.map((a, i) => (
          <Reveal i={i + 1} key={a.id}>
            <article className="row-card">
              <div className="rank">{i + 1}</div>
              <div className="rbody">
                <div className="src">{a.source}</div>
                <div className="txt"><Html text={a.headline} /></div>
                <div className="rfoot">
                  <ConfidencePill confidence={a.confidence} label={a.confidenceLabel ?? a.confidence} />
                  {a.citationChip && <CitePill text={a.citationChip} />}
                </div>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <div className="eyebrow">The numbers, read</div>
      <div className="grid2">
        {dash.map((m, i) => (
          <Reveal i={i + 3} key={m.id} className={m.wide ? "tile wide" : "tile"}>
            <div className="tl">{m.label}</div>
            <div className="tv">
              <CountUp value={m.value} />
              {m.delta && <span className={`dlt ${m.delta.dir}`}>{m.delta.text}</span>}
            </div>
            {m.spark && <BreakSpark viz={m.spark} />}
            <div className="mean"><Html text={m.meaning} /></div>
            {(m.id === "revenue" || m.id === "customers") && (
              <div className="tfoot">
                <ConfidencePill
                  confidence={m.confidence}
                  label={m.id === "customers" ? "Moderate · attribution" : `${m.confidenceLabel} confidence`}
                />
              </div>
            )}
          </Reveal>
        ))}
      </div>

      <div className="eyebrow">Watching · not ready to call</div>
      <Reveal i={7}>
        <div className="watch">
          {brief.watching.map((w) => (
            <div className="w" key={w.id}>
              <span className="pill lite-none"><span className="dot breathe" />{w.pillLabel}</span>
              <div className="wtxt"><Html text={w.text} /></div>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal i={9}>
        <button className="packet-card" onClick={() => nav("/insights")}>
          <div className="pc-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 3v6L4 20a1.5 1.5 0 0 0 1.4 2h13.2a1.5 1.5 0 0 0 1.4-2L15 9V3M7 3h10" /></svg>
          </div>
          <div className="pc-body">
            <div className="pc-title">The Insights Lab</div>
            <div className="pc-sub">Nine deep reads on your business — price power, at-risk customers, the audit, stress-tested runway…</div>
          </div>
          <span className="pc-go">→</span>
        </button>
      </Reveal>

      <div className="sources">
        <div className="srcs">
          {brief.sources.map((s) => (
            <span className="src-chip" key={s.id}><b>◆</b> {s.name}</span>
          ))}
        </div>
        <div className="privacy">{SHIELD} Private</div>
      </div>
    </div>
  );
}
