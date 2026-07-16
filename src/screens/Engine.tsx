// On-device engine demo — aurora-core (Rust → WASM) computing LIVE on this
// device. No server, no mock: the same crate that passes golden parity
// against the Python engine, running the real ledger series in your hand.
// The penalty control re-runs PELT on every tap — that's the point.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ar1Forecast, detectChangepoints, loadCore, welch } from "../engine/auroraCore";
import { getDaily } from "../engine/dataSource";
import { narrate, type Narration } from "../engine/narrator";
import type { BreaklineViz, FanViz } from "../api/counsel";
import { VizView } from "../components/charts";
import { Reveal } from "../components/ui";

interface Ledger { dates: string[]; revenue: number[] }

interface Computed {
  cps: number[];
  breakIdx: number | null;
  breakDate: string | null;
  p: number | null;
  beforeMean: number;
  afterMean: number;
  pct: number;
  msPelt: number;
  msWelch: number;
  msAr1: number;
  breakViz: BreaklineViz | null;
  fanViz: FanViz | null;
  fcLo: number;
  fcHi: number;
}

const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

function downsample(a: number[], k = 8): number[] {
  if (a.length <= k) return a;
  const out: number[] = [];
  const step = a.length / k;
  for (let i = 0; i < k; i++) {
    const seg = a.slice(Math.floor(i * step), Math.floor((i + 1) * step));
    out.push(seg.reduce((s, v) => s + v, 0) / seg.length);
  }
  return out;
}
function svgScale(vals: number[], loPx: number, hiPx: number, vmin: number, vmax: number): number[] {
  const span = vmax - vmin || 1;
  return vals.map((v) => hiPx - ((v - vmin) / span) * (hiPx - loPx));
}

function compute(led: Ledger, penalty: number): Computed {
  const y = led.revenue;

  let t0 = performance.now();
  const cps = detectChangepoints(y, "rbf", penalty);
  const msPelt = performance.now() - t0;

  const breakIdx = cps.length ? cps[cps.length - 1] : null;
  let p: number | null = null;
  let msWelch = 0;
  let beforeMean = 0, afterMean = 0, pct = 0;
  let breakViz: BreaklineViz | null = null;

  if (breakIdx !== null && breakIdx > 8 && y.length - breakIdx > 4) {
    const before = y.slice(0, breakIdx);
    const after = y.slice(breakIdx);
    t0 = performance.now();
    const w = welch(before, after);
    msWelch = performance.now() - t0;
    p = w.p;
    beforeMean = before.reduce((s, v) => s + v, 0) / before.length;
    afterMean = after.reduce((s, v) => s + v, 0) / after.length;
    pct = afterMean / beforeMean - 1;
    const b = downsample(before), a = downsample(after);
    const vmin = Math.min(...b, ...a), vmax = Math.max(...b, ...a);
    breakViz = {
      kind: "breakline",
      before: svgScale(b, 10, 72, vmin, vmax),
      after: svgScale(a, 10, 72, vmin, vmax),
      beforeLabel: `~${money(beforeMean)}/day`,
      afterLabel: `~${money(afterMean)}/day`,
    };
  }

  t0 = performance.now();
  const fc = ar1Forecast(y, 30, 0.05);
  const msAr1 = performance.now() - t0;
  let fanViz: FanViz | null = null;
  let fcLo = 0, fcHi = 0;
  if (fc) {
    fcLo = fc.lo.reduce((s, v) => s + v, 0);
    fcHi = fc.hi.reduce((s, v) => s + v, 0);
    const hist = downsample(y.slice(-40), 5);
    const mid3 = downsample(fc.forecast, 3), hi3 = downsample(fc.hi, 3), lo3 = downsample(fc.lo, 3);
    const all = [...hist, ...mid3, ...hi3, ...lo3];
    const vmin = Math.min(...all), vmax = Math.max(...all);
    fanViz = {
      kind: "fan",
      history: svgScale(hist, 14, 82, vmin, vmax),
      mid: svgScale(mid3, 14, 82, vmin, vmax),
      hi: svgScale(hi3, 14, 82, vmin, vmax),
      lo: svgScale(lo3, 14, 82, vmin, vmax),
      hiLabel: `$${Math.round(fcHi / 1000)}k`,
      loLabel: `$${Math.round(fcLo / 1000)}k`,
    };
  }

  const breakDate = breakIdx !== null
    ? new Date(led.dates[breakIdx] + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })
    : null;

  return { cps, breakIdx, breakDate, p, beforeMean, afterMean, pct, msPelt, msWelch, msAr1, breakViz, fanViz, fcLo, fcHi };
}

const pPlain = (p: number) =>
  p < 0.001 ? "less than a 1-in-1,000 chance this is noise"
  : p < 0.01 ? "less than a 1-in-100 chance this is noise"
  : p < 0.05 ? "less than a 1-in-20 chance this is noise"
  : "within normal variation — not a real break";

export default function Engine() {
  const nav = useNavigate();
  const [led, setLed] = useState<Ledger | null>(null);
  const [ready, setReady] = useState(false);
  const [penalty, setPenalty] = useState(10);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    Promise.all([loadCore(), getDaily()])
      .then(([, l]) => { if (on) { setLed(l); setReady(true); } })
      .catch((e) => on && setErr(String(e)));
    return () => { on = false; };
  }, []);

  const c = useMemo(() => (ready && led ? compute(led, penalty) : null), [ready, led, penalty]);
  const totalMs = c ? (c.msPelt + c.msWelch + c.msAr1) : 0;

  // Part B live: narrate the computed break — always on-device. Uses the
  // browser's built-in model when one exists, bounded templates otherwise.
  const [narr, setNarr] = useState<Narration | null>(null);
  useEffect(() => {
    if (!c || c.breakIdx === null || c.p === null) { setNarr(null); return; }
    let on = true;
    narrate({
      kind: "break",
      dateLabel: c.breakDate ?? "recently",
      beforePerDay: money(c.beforeMean),
      afterPerDay: money(c.afterMean),
      pctText: `${(c.pct * 100).toFixed(0)}%`,
      pPlain: pPlain(c.p),
    }).then((n) => on && setNarr(n));
    return () => { on = false; };
  }, [c]);

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">aurora-core · Rust → WebAssembly</div>
          <h1>The engine, in your hand</h1>
        </div>
        <button className="avatar" onClick={() => nav("/settings")} aria-label="Back to settings">✕</button>
      </div>

      {err && <div className="reassure">Couldn't load the engine: {err}</div>}
      {!c && !err && <div className="demo-loading" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>loading the Rust core…</div>}

      {c && led && (
        <>
          <Reveal i={0}>
            <section className="voice">
              <div className="eyebrow on-dark">Computed on this device</div>
              <div className="said">No server. No cloud. <em>Just math, here.</em></div>
              <div className="sub">
                Aurora's change-point, significance test and forecast just ran inside this page —
                on {led.revenue.length} days of ledger data, in <b style={{ color: "#d8c19a" }}>{totalMs.toFixed(1)} ms</b>.
                Airplane mode would not stop it.
              </div>
              <div className="micro">
                <div className="m"><div className="ml">PELT break</div><div className="mv">{c.msPelt.toFixed(1)} ms</div></div>
                <div className="m"><div className="ml">Welch test</div><div className="mv">{c.msWelch.toFixed(2)} ms</div></div>
                <div className="m"><div className="ml">AR(1) + bands</div><div className="mv">{c.msAr1.toFixed(2)} ms</div></div>
              </div>
            </section>
          </Reveal>

          <div className="eyebrow">Change point · live</div>
          <Reveal i={1}>
            <article className="mcard open">
              <div className="mhead">
                <div>
                  <div className="mlabel">Sensitivity (PELT penalty) — tap to recompute</div>
                  <div className="period" style={{ marginBottom: 0, marginTop: 6 }}>
                    {[5, 10, 25].map((pen) => (
                      <button key={pen} className={`seg ${penalty === pen ? "on" : ""}`} onClick={() => setPenalty(pen)}>
                        {pen === 5 ? "Sensitive · 5" : pen === 10 ? "Balanced · 10" : "Strict · 25"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mmean" style={{ marginTop: 14 }}>
                {c.breakIdx !== null ? (
                  <>
                    <b>Break found: {c.breakDate}</b> — revenue moved from ~{money(c.beforeMean)}/day to ~{money(c.afterMean)}/day
                    ({(c.pct * 100).toFixed(0)}%). {c.p !== null && <>Welch says {pPlain(c.p)} (p {c.p < 0.001 ? "< 0.001" : `= ${c.p.toFixed(3)}`}).</>}
                    {c.cps.length > 1 && <> {c.cps.length} change points at this sensitivity.</>}
                  </>
                ) : (
                  <><b>No structural break</b> at this sensitivity — the series reads as one regime.</>
                )}
              </div>
              {c.breakViz && <div style={{ marginTop: 12 }}><VizView viz={c.breakViz} /></div>}
              {narr && (
                <div className="narr-box">
                  <div className="narr-text">“{narr.text}”</div>
                  <div className="narr-badge">
                    narrated on-device · {narr.narrator === "gemini-nano" ? "browser model (Gemini Nano)" : "bounded template"} — the model never computes, only phrases
                  </div>
                </div>
              )}
              <div className="cite" style={{ marginTop: 10 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>
                <span>Method: PELT (rbf) + Welch's t-test · aurora-core, golden-parity vs the Python engine</span>
              </div>
            </article>
          </Reveal>

          <div className="eyebrow">30-day outlook · live</div>
          <Reveal i={2}>
            <article className="mcard open">
              <div className="mmean">
                Next 30 days, honestly: between <b>${Math.round(c.fcLo / 1000)}k and ${Math.round(c.fcHi / 1000)}k</b> —
                an AR(1) fit with analytic 95% bands, computed just now on this device.
              </div>
              {c.fanViz && <VizView viz={c.fanViz} />}
              <div className="cite" style={{ marginTop: 10 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>
                <span>Method: AR(1) + residual bands · same math as the desktop engine, ported & parity-tested</span>
              </div>
            </article>
          </Reveal>

          <Reveal i={3}>
            <div className="reassure" style={{ marginTop: 18 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              This is the privacy story made literal: the 65&nbsp;KB Rust core in this page is the same code headed
              for the native iOS/Android apps — where your books never leave the phone.
            </div>
          </Reveal>
        </>
      )}
    </div>
  );
}
