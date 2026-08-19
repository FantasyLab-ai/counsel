// The Simulations Lab — compose several business decisions and watch them
// hit ONE banded 13-week cash path together. Every move is labeled
// MEASURED or ASSUMED; the graph shows today's path vs the plan.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { displayName } from "../engine/persona";
import { simulate, type SimMove, type SimResult } from "../engine/simulate";
import { money } from "../engine/insights";
import { ActOn, BackBtn, Reveal } from "../components/ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Graph({ r }: { r: SimResult }) {
  if (!r.ok || !r.base || !r.scen) return null;
  const W = 340, H = 150, PX = 6, PT = 14, PB = 20;
  const all = [...r.base.weeks.map((w) => w.cumMid), ...r.scen.weeks.map((w) => w.cumMid), ...r.scen.weeks.map((w) => w.cumLo), 0];
  const min = Math.min(...all), max = Math.max(...all);
  const span = Math.max(1, max - min);
  const x = (i: number) => PX + (i / 12) * (W - 2 * PX);
  const y = (v: number) => PT + (1 - (v - min) / span) * (H - PT - PB);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const baseLine = line(r.base.weeks.map((w) => w.cumMid));
  const scenLine = line(r.scen.weeks.map((w) => w.cumMid));
  const band = r.scen.weeks.map((w, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(w.cumMid).toFixed(1)}`).join(" ")
    + r.scen.weeks.map((w, i) => `L${x(12 - i).toFixed(1)},${y(r.scen!.weeks[12 - i].cumLo).toFixed(1)}`).join("") + "Z";
  const zeroY = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", marginTop: 12 }} aria-label="13-week cash: today's path vs this plan">
      {min < 0 && <line x1={PX} x2={W - PX} y1={zeroY} y2={zeroY} stroke="#c94f4f" strokeWidth="1" strokeDasharray="2 3" />}
      <path d={band} fill="var(--ch1, #61a029)" opacity="0.14" />
      <path d={baseLine} fill="none" stroke="var(--ch2, #3d87d6)" strokeWidth="1.6" strokeDasharray="4 4" strokeLinecap="round" />
      <path d={scenLine} fill="none" stroke="var(--ch1, #61a029)" strokeWidth="2.2" strokeLinecap="round" />
      <text x={PX} y={H - 6} fontSize="8.5" fill="var(--muted, #75827a)" fontFamily="var(--mono)">{r.base.weeks[0].label}</text>
      <text x={W - PX} y={H - 6} fontSize="8.5" fill="var(--muted, #75827a)" textAnchor="end" fontFamily="var(--mono)">{r.base.weeks[12].label}</text>
      <text x={W - PX} y={y(r.base.weeks[12].cumMid) - 4} fontSize="8.5" fill="var(--ch2, #3d87d6)" textAnchor="end" fontFamily="var(--mono)">today's path</text>
      <text x={W - PX} y={y(r.scen.weeks[12].cumMid) + 10} fontSize="8.5" fill="var(--ch1, #61a029)" textAnchor="end" fontFamily="var(--mono)">this plan</text>
    </svg>
  );
}

export default function Simulate() {
  const nav = useNavigate();
  const [moves, setMoves] = useState<SimMove[]>([]);
  const [result, setResult] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  // input scratch
  const [amt, setAmt] = useState("1400");
  const [oneAmt, setOneAmt] = useState("5000");
  const [oneWeek, setOneWeek] = useState(3);
  const [pricePct, setPricePct] = useState("5");
  const [pushPct, setPushPct] = useState("10");
  const [wd, setWd] = useState(1);
  const [dayMode, setDayMode] = useState<"drop" | "add">("drop");
  const [picker, setPicker] = useState<string>("hire");

  const add = () => {
    setResult(null);
    const n = (v: string) => Math.max(0, Math.round(parseFloat(v) || 0));
    if (picker === "hire") setMoves((m) => [...m, { kind: "hire", label: `Hire at ${money(n(amt))}/mo`, amountMo: n(amt) }]);
    if (picker === "draw") setMoves((m) => [...m, { kind: "draw", label: `Owner draw ${money(n(amt))}/mo`, amountMo: n(amt) }]);
    if (picker === "purchase") setMoves((m) => [...m, { kind: "purchase", label: `One-time purchase ${money(n(oneAmt))}`, amount: n(oneAmt), week: oneWeek }]);
    if (picker === "price") setMoves((m) => [...m, { kind: "price", label: `Price ${parseFloat(pricePct) >= 0 ? "+" : ""}${parseFloat(pricePct) || 0}%`, pct: parseFloat(pricePct) || 0 }]);
    if (picker === "push") setMoves((m) => [...m, { kind: "push", label: `Marketing push +${parseFloat(pushPct) || 0}%`, pct: parseFloat(pushPct) || 0 }]);
    if (picker === "day") setMoves((m) => [...m, { kind: "day", label: `${dayMode === "drop" ? "Close" : "Open"} ${DAYS[wd]}s`, weekday: wd, mode: dayMode }]);
  };

  async function run() {
    setBusy(true);
    try { setResult(await simulate(moves)); } finally { setBusy(false); }
  }

  // screenshot rig: ?demoplan=1 stacks a sample plan and runs it once
  const ranDemo = useRef(false);
  useEffect(() => {
    if (ranDemo.current || !window.location.search.includes("demoplan=1")) return;
    ranDemo.current = true;
    const preset: SimMove[] = [
      { kind: "hire", label: "Hire at $1,400/mo", amountMo: 1400 },
      { kind: "price", label: "Price +5%", pct: 5 },
      { kind: "purchase", label: "One-time purchase $5,000", amount: 5000, week: 3 },
    ];
    setMoves(preset);
    (async () => { setBusy(true); try { setResult(await simulate(preset)); } finally { setBusy(false); } })();
  }, []);

  return (
    <div className="app">
      <div className="appbar">
        <BackBtn />
        <div className="titleblock">
          <div className="kicker">{displayName()} · rehearse before you decide</div>
          <h1>Simulations Lab</h1>
        </div>
        <div className="avatar">{displayName()[0]}</div>
      </div>

      <Reveal i={0}>
        <section className="voice">
          <div className="eyebrow on-dark">The rehearsal room</div>
          <div className="said">Stack the moves. <em>See the whole plan land.</em></div>
          <div className="sub">
            A hire, a price move, a big purchase, a marketing push — real plans are several
            decisions at once. Compose them below and I'll run them together against your
            banded 13-week cash path. Measured effects where I have measurements; labeled
            assumptions where I don't.
          </div>
        </section>
      </Reveal>

      <div className="eyebrow">Build the plan</div>
      <Reveal i={1}>
        <article className="mcard open il-card">
          <div className="dropin-row" style={{ alignItems: "center" }}>
            <select className="ps-select" value={picker} aria-label="Move type" onChange={(e) => setPicker(e.target.value)}>
              <option value="hire">Hire / recurring cost</option>
              <option value="draw">Owner draw</option>
              <option value="purchase">One-time purchase</option>
              <option value="price">Price move</option>
              <option value="day">Close / open a day</option>
              <option value="push">Marketing push</option>
            </select>
            {(picker === "hire" || picker === "draw") && (
              <input className="dt-input" style={{ maxWidth: 110 }} inputMode="numeric" value={amt}
                onChange={(e) => setAmt(e.target.value)} aria-label="Dollars per month" placeholder="$/mo" />
            )}
            {picker === "purchase" && (
              <>
                <input className="dt-input" style={{ maxWidth: 100 }} inputMode="numeric" value={oneAmt}
                  onChange={(e) => setOneAmt(e.target.value)} aria-label="Amount" placeholder="$" />
                <select className="ps-select" value={oneWeek} aria-label="Which week" onChange={(e) => setOneWeek(Number(e.target.value))}>
                  {Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>week {i + 1}</option>)}
                </select>
              </>
            )}
            {picker === "price" && (
              <input className="dt-input" style={{ maxWidth: 90 }} inputMode="numeric" value={pricePct}
                onChange={(e) => setPricePct(e.target.value)} aria-label="Percent" placeholder="+%" />
            )}
            {picker === "push" && (
              <input className="dt-input" style={{ maxWidth: 90 }} inputMode="numeric" value={pushPct}
                onChange={(e) => setPushPct(e.target.value)} aria-label="Percent lift" placeholder="+%" />
            )}
            {picker === "day" && (
              <>
                <select className="ps-select" value={dayMode} aria-label="Close or open" onChange={(e) => setDayMode(e.target.value as "drop" | "add")}>
                  <option value="drop">close</option>
                  <option value="add">open</option>
                </select>
                <select className="ps-select" value={wd} aria-label="Weekday" onChange={(e) => setWd(Number(e.target.value))}>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}s</option>)}
                </select>
              </>
            )}
            <button className="dbtn" onClick={add}>+ add</button>
          </div>

          {moves.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {moves.map((m, i) => (
                <span className="pill lite-mod" key={i} style={{ maxWidth: "100%" }}>
                  {m.label}
                  <button aria-label={`Remove ${m.label}`} onClick={() => { setMoves((xs) => xs.filter((_, j) => j !== i)); setResult(null); }}
                    style={{ background: "none", border: 0, color: "inherit", marginLeft: 6, cursor: "pointer" }}>✕</button>
                </span>
              ))}
            </div>
          )}

          <div className="dropin-row" style={{ marginTop: 12 }}>
            <button className="dbtn primary" disabled={busy || moves.length === 0} onClick={run}>
              {busy ? "running the plan…" : `Run the plan${moves.length ? ` · ${moves.length} move${moves.length > 1 ? "s" : ""}` : ""}`}
            </button>
            {moves.length > 0 && (
              <button className="dbtn" onClick={() => { setMoves([]); setResult(null); }}>clear</button>
            )}
          </div>
        </article>
      </Reveal>

      {result && (
        <>
          <div className="eyebrow">The verdict — banded, not promised</div>
          <Reveal i={0}>
            <article className="mcard open il-card">
              {result.ok ? (
                <>
                  <div className="mmean"><b>{result.verdict}</b></div>
                  <Graph r={result} />
                  <div className="il-cite" style={{ marginTop: 4 }}>
                    solid: this plan (mid path, shaded to cautious) · dashed: today's path · {result.scen?.cite}
                  </div>
                  {result.sims && (
                    <div className="pill lite-hi" style={{ marginTop: 10 }}>
                      <span className="dot" />
                      {result.sims.n} simulated quarters · holds in {result.sims.holdPct}% · likely end cash {money(result.sims.endLo)}–{money(result.sims.endHi)}
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <div className="pw-csv-lbl">how each move was counted</div>
                    {result.notes.map((n, i) => (
                      <div className="mmean" key={i} style={{ marginTop: 6, fontSize: 12.5 }}>· {n}</div>
                    ))}
                  </div>
                  <ActOn source="Simulations Lab"
                    action={`Run the plan: ${moves.map((m) => m.label).join(" + ")}`}
                    expected={result.verdict ?? ""}
                    impact={result.endDelta ? Math.round(Math.abs(result.endDelta) / 3) : undefined} />
                </>
              ) : (
                <div className="mmean"><b>I can't rehearse this honestly yet.</b> {result.reason}</div>
              )}
            </article>
          </Reveal>
        </>
      )}

      <Reveal i={2}>
        <div className="reassure" style={{ marginTop: 16 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          Rehearsals never touch your data or your accounts — they're math on a copy of the
          path. When you run a plan for real, track it and I'll grade the rehearsal against
          what actually happened.
        </div>
      </Reveal>
      <div style={{ height: 8 }} />
      {/* deep-link home for the curious */}
      <button className="subbtn" onClick={() => nav("/plan")}>← single-move rehearsals live on Plan</button>
    </div>
  );
}
