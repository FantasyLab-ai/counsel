// Plan — the decision room. Tier 1 of the roadmap, live:
//   * Cash sentry — on-device band forecast vs your outgoings
//   * What-If planner — hire / price / purchase, rehearsed with honest bands
//   * "Was it worth it?" — before/after significance around YOUR decision date
//   * The Watchlist — Sentinel contracts, quiet by design
//   * The Decisions Log — Counsel grades its own advice
// Math: aurora-core (WASM) on the real ledger + the P&L baseline. Every card
// says which is which — that's the glass box.

import { useEffect, useMemo, useState } from "react";
import { displayName } from "../engine/persona";
import { useNavigate } from "react-router-dom";
import {
  BASELINE, cashSentry, evaluateContracts, hireScenario, money,
  priceScenario, purchaseScenario, seasonality, wasItWorthIt,
  type CashSentry, type ContractStatus, type Seasonality, type WorthIt,
} from "../engine/insights";
import { listDecisions, logDecision, type Decision } from "../engine/decisions";
import { clearGoal, getGoal, goalPace, setGoal, suggestTarget, type GoalPace } from "../engine/goals";
import { getPayFloor, payYourself, setPayFloor, type PayPlan, type PayRefusal } from "../engine/paySelf";
import { rehearseDay, type DayChangeOut } from "../engine/dayChange";
import { ActOn, Html, Receipt, Reveal, ShareCard, ProGate } from "../components/ui";

// Pay Yourself — the number nobody computes. The safe draw is the largest
// monthly salary the 13-week simulator carries on the cautious path without
// breaching the floor; refusals are part of the feature.
function PayCard() {
  const [plan, setPlan] = useState<PayPlan | PayRefusal | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const load = () => { payYourself().then(setPlan).catch(() => setPlan(null)); };
  useEffect(() => { load(); }, []);

  if (!plan) return <article className="mcard open il-card"><div className="il-loading">▶ asking the 13-week view what it can carry…</div></article>;

  if (!plan.ok) {
    return (
      <article className="mcard open il-card awaiting">
        <div className="il-head"><span className="il-kick">pay yourself</span>
          <span className="pill lite-fc"><span className="dot" />{plan.reason === "posture" ? "after the first move" : "awaiting"}</span></div>
        <div className="mmean" style={{ fontFamily: "var(--serif)", fontSize: 17 }}><Html text={plan.headline} /></div>
        <div className="il-row-sub">{plan.sub}</div>
      </article>
    );
  }

  const mathBlock = {
    methodPlain: `I injected a salary into the same 13-week simulator behind the Money screen — half on the 1st, half on the 15th, tax set-aside included — and binary-searched for the largest draw where even the CAUTIOUS path (p15 revenue every single week) keeps cash above your floor.`,
    keyStatPlain: `Safe: ${money(plan.safeMonthly)}/mo. If the mid path holds: ${money(plan.midMonthly)}. Floor: ${money(plan.floor)}.`,
    keyStatNotation: `D* = max{D : min₁₃ᵥᵥ cumLo(D) ≥ floor} · split 1st & 15th`,
    citation: { method: "13-week cautious-path capacity search", source: "your ledger + recorded bills + the tax pot" },
  };

  return (
    <article className="mcard open il-card pay-card">
      <div className="il-head"><span className="il-kick">pay yourself · the number nobody computes</span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <ShareCard kicker="pay yourself" headline={plan.headline} sub={plan.sub} cite={plan.cite} business={displayName()} />
          <span className="pill lite-hi"><span className="dot" />cautious-case safe</span>
        </span></div>
      <div className="mmean" style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.3 }}>
        <Receipt math={mathBlock} title="pay yourself — the math"><Html text={plan.headline} /></Receipt>
      </div>
      <div className="il-row-sub" style={{ marginTop: 6 }}>{plan.sub}</div>
      {plan.warChest && (
        <div className="il-row-sub" style={{ marginTop: 8 }}><b style={{ color: "var(--ink)" }}>War chest:</b> {plan.warChest}</div>
      )}
      <div className="il-row-sub" style={{ marginTop: 8 }}>
        <span className="de-cost">
          <b style={{ color: "var(--ink)" }}>The floor</b> (cash never dips below):
          {editing ? (
            <>
              <input type="number" inputMode="decimal" value={draft} autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { setPayFloor(parseFloat(draft)); setEditing(false); load(); } }} />
              <button className="dt-btn" onClick={() => { if (draft.trim()) { setPayFloor(parseFloat(draft)); load(); } setEditing(false); }}>save</button>
            </>
          ) : (
            <button className="dt-btn" onClick={() => { setDraft(String(plan.floor)); setEditing(true); }}>
              {money(plan.floor)}{plan.floorIsDefault ? " · two weeks of bills — set yours" : " · your number"}
            </button>
          )}
        </span>
      </div>
      <ActOn source="Pay Yourself engine"
        action={`Pay yourself ${money(plan.safeMonthly / 2)} on ${plan.payday}`}
        expected={`cash stays above the ${money(plan.floor)} floor on the cautious path — revisit when the engines re-check`}
        impact={plan.safeMonthly} />
      <div className="il-cite">{plan.cite}</div>
    </article>
  );
}

// Goal contract — the steering wheel. Set a monthly target; Counsel tracks
// weekday-weighted pace with an honest variability band, and only calls
// you behind when it's beyond your normal weekly swing.
function GoalCard() {
  const [pace, setPace] = useState<GoalPace | null>(null);
  const [editing, setEditing] = useState(!getGoal());
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<number | null>(null);

  const refresh = () => { goalPace().then((p) => setPace(p.ok ? p : null)).catch(() => setPace(null)); };
  useEffect(() => {
    refresh();
    suggestTarget().then(setHint).catch(() => undefined);
  }, []);

  if (editing || !getGoal()) {
    return (
      <article className="mcard open il-card">
        <div className="il-head"><span className="il-kick">the goal contract</span>
          <span className="pill lite-fc"><span className="dot" />pace, honestly measured</span></div>
        <div className="mmean">
          Name the month's revenue target. I'll track <b>weekday-weighted pace</b> against it —
          your big days count for more — and only call you behind when it's beyond your normal weekly swing.
        </div>
        <div className="dropin-row">
          <input className="dt-input" style={{ flex: 1 }} type="number" inputMode="decimal" aria-label="Monthly revenue target, dollars"
            placeholder={hint ? `suggested: ${hint} (median month +8%)` : "monthly target, $"}
            value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="dbtn primary" disabled={!draft.trim() && !hint}
            onClick={() => { setGoal(draft.trim() ? parseFloat(draft) : hint!); setEditing(false); setDraft(""); refresh(); }}>
            Set the goal
          </button>
        </div>
        {getGoal() && (
          <div className="dropin-row">
            <button className="dbtn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        )}
      </article>
    );
  }

  if (!pace) {
    return (
      <article className="mcard open il-card awaiting">
        <div className="mmean">Goal set ({money(getGoal()!.monthlyTarget)}/mo) — pace math needs ~2 weeks of history.</div>
        <div className="dropin-row"><button className="dbtn" onClick={() => setEditing(true)}>Change target</button></div>
      </article>
    );
  }

  const mathBlock = {
    methodPlain: `Pace is weekday-weighted: each elapsed day contributes its weekday's average share of a month, so a slow Monday doesn't read as "behind" and a big Saturday doesn't read as "ahead". The on-pace band is your own last-8-weeks weekly variability.`,
    keyStatPlain: `${money(pace.actualMTD)} so far vs ${money(pace.expectedMTD)} expected by now — pace ratio ${pace.paceRatio.toFixed(2)} against a ${pace.bandLo.toFixed(2)}–${pace.bandHi.toFixed(2)} band.`,
    keyStatNotation: `expectedMTD = target × Σ(elapsed weekday weights)/Σ(month weekday weights)`,
    citation: { method: "weekday-weighted pace vs target", source: "your ledger + your stated target" },
  };
  const pct = Math.min(100, (pace.actualMTD / pace.target) * 100);
  const expPct = Math.min(100, (pace.expectedMTD / pace.target) * 100);

  return (
    <article className="mcard open il-card">
      <div className="il-head"><span className="il-kick">the goal contract · {pace.monthLabel}</span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <ShareCard kicker={`goal pace · ${pace.monthLabel}`} headline={pace.headline} cite={pace.cite} business={displayName()} />
          <span className={`pill ${pace.status === "behind" ? "lite-none" : pace.status === "ahead" ? "lite-hi" : "lite-mod"}`}>
            <span className="dot" />{pace.status} · target {money(pace.target)}</span>
        </span></div>
      <div className="mmean">
        <Receipt math={mathBlock} title="goal pace — the math"><Html text={pace.headline} /></Receipt>
      </div>
      <div className="goal-track">
        <span className="goal-fill" style={{ width: `${pct}%` }} />
        <span className="goal-exp" style={{ left: `${expPct}%` }} title="expected by now (weekday-weighted)" />
      </div>
      <div className="il-row-sub">▮ actual {money(pace.actualMTD)} · | expected-by-now marker · projection {money(pace.projected)}</div>
      {pace.status === "behind" && (
        <ActOn source="Goal contract" action={`Close the ${money(pace.expectedMTD - pace.actualMTD)} pace gap`}
          expected="ONE lever this week — the price test, the win-back, or a spotlight post — judged against pace in 14 days"
          impact={Math.max(0, pace.target - pace.projected)} />
      )}
      <div className="dropin-row">
        <button className="dbtn" onClick={() => setEditing(true)}>Change target</button>
        <button className="dbtn" onClick={() => { clearGoal(); setPace(null); setEditing(true); }}>Drop the goal</button>
      </div>
      <div className="il-cite">{pace.cite}</div>
    </article>
  );
}

export default function Plan() {
  const nav2 = useNavigate();
  const [sentry, setSentry] = useState<CashSentry | null>(null);
  const [contracts, setContracts] = useState<ContractStatus[]>([]);
  const [season, setSeason] = useState<Seasonality | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    Promise.all([cashSentry(), evaluateContracts(), seasonality()])
      .then(([s, c, se]) => { if (on) { setSentry(s); setContracts(c); setSeason(se); } })
      .catch((e) => on && setErr(String(e)));
    return () => { on = false; };
  }, []);

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">{displayName()}</div>
          <h1>Plan</h1>
        </div>
        <div className="avatar">{displayName()[0]}</div>
      </div>

      {err && <div className="reassure">Engine unavailable: {err}</div>}

      {/* ---- cash sentry ---- */}
      <Reveal i={0}>
        <section className="voice">
          <div className="eyebrow on-dark">Cash sentry · computed on this device</div>
          {sentry ? (
            <>
              <div className="said">
                {sentry.clears
                  ? <>Even my <em>low estimate</em> clears your bills.</>
                  : <>My low estimate runs <em>thin against your bills.</em></>}
              </div>
              <div className="sub">
                Next 30 days of revenue, honestly banded: {money(sentry.lo30)}–{money(sentry.hi30)}.
                At your {(BASELINE.margin * 100).toFixed(0)}% margin, the <b style={{ color: "#d8c19a" }}>low</b> end
                yields {money(sentry.lo30 * BASELINE.margin)} against {money(BASELINE.fixedOutgoings)} of
                outgoings — {sentry.clears
                  ? `a ${money(sentry.marginOfSafety)} cushion even in the cautious case.`
                  : `${money(-sentry.marginOfSafety)} short in the cautious case — worth watching.`}
              </div>
              <div className="micro">
                <div className="m"><div className="ml">low band</div><div className="mv">{money(sentry.lo30)}</div></div>
                <div className="m"><div className="ml">high band</div><div className="mv">{money(sentry.hi30)}</div></div>
                <div className="m"><div className="ml">computed in</div><div className="mv">{sentry.ms.toFixed(1)} ms</div></div>
              </div>
            </>
          ) : (
            <div className="sub">running the band forecast…</div>
          )}
        </section>
      </Reveal>

      {/* ---- pay yourself ---- */}
      <div className="eyebrow">Pay yourself — what the business owes its owner</div>
      <Reveal i={1}><ProGate feature="Pay Yourself" line="the largest owner draw your cash floor can support, computed from your own 13-week outlook."><PayCard /></ProGate></Reveal>

      {/* ---- goal contract ---- */}
      <div className="eyebrow">The goal — a target with a steering wheel</div>
      <Reveal i={1}><GoalCard /></Reveal>

      {/* ---- what-if planner ---- */}
      <div className="eyebrow">Rehearse a decision — before you make it</div>
      <Reveal i={1}><HireCard /></Reveal>
      <Reveal i={2}><PriceCard /></Reveal>
      <Reveal i={3}><PurchaseCard /></Reveal>
      <Reveal i={4}><DayCard /></Reveal>

      {/* ---- was it worth it ---- */}
      <div className="eyebrow">Was it worth it?</div>
      <Reveal i={4}><WorthItCard /></Reveal>

      {/* ---- watchlist ---- */}
      <div className="eyebrow">The watchlist — quiet by design</div>
      <Reveal i={5}>
        <article className="mcard open">
          <div className="mmean" style={{ marginBottom: 10 }}>
            I watch these <b>so you don't have to</b>. No pings unless something structurally changes.
          </div>
          {contracts.map((c) => (
            <div className="wl-row" key={c.id}>
              <span className={`wl-dot ${c.fired ? "fired" : ""}`} />
              <div className="wl-body">
                <div className="wl-title">{c.title}</div>
                <div className="wl-rule">{c.rule}</div>
              </div>
              <div className={`wl-status ${c.fired ? "fired" : ""}`}>{c.statusLine}</div>
            </div>
          ))}
          {season && (
            <div className="cite" style={{ marginTop: 12 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>
              <span>Rhythm note: {season.strongest} run {season.ratio.toFixed(1)}× {season.weakest} — plan restocks accordingly.</span>
            </div>
          )}
        </article>
      </Reveal>

      {/* ---- decisions log ---- */}
      <div className="eyebrow">The decisions log — I grade my own advice</div>
      <Reveal i={6}><DecisionsCard /></Reveal>

      {/* ---- money entry ---- */}
      <Reveal i={7}>
        <button className="packet-card" onClick={() => nav2("/money")}>
          <div className="pc-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          </div>
          <div className="pc-body">
            <div className="pc-title">Money — the cash calendar</div>
            <div className="pc-sub">Every bill on its day vs your expected inflows, who owes you (chase order), and the tax pot.</div>
          </div>
          <span className="pc-go">→</span>
        </button>
      </Reveal>

      {/* ---- ops entry ---- */}
      <Reveal i={8}>
        <button className="packet-card" onClick={() => nav2("/ops")}>
          <div className="pc-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5m0 0l9-5m-9 5v8" /></svg>
          </div>
          <div className="pc-body">
            <div className="pc-title">Stock &amp; shipments</div>
            <div className="pc-sub">Days of cover vs your real demand rate, reorder-by dates, stalled-shipment triage.</div>
          </div>
          <span className="pc-go">→</span>
        </button>
      </Reveal>

      {/* ---- insights lab entry ---- */}
      <Reveal i={9}>
        <button className="packet-card" onClick={() => nav2("/insights")}>
          <div className="pc-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 3v6L4 20a1.5 1.5 0 0 0 1.4 2h13.2a1.5 1.5 0 0 0 1.4-2L15 9V3M7 3h10" /></svg>
          </div>
          <div className="pc-body">
            <div className="pc-title">The Insights Lab</div>
            <div className="pc-sub">Nine deep reads — price power, at-risk customers, restock math, the audit, credit readiness, stress-tested runway…</div>
          </div>
          <span className="pc-go">→</span>
        </button>
      </Reveal>
    </div>
  );
}

/* ------------------------------- scenario cards --------------------------- */

function HireCard() {
  const [cost, setCost] = useState(1400);
  const r = useMemo(() => hireScenario(cost), [cost]);
  const [logged, setLogged] = useState(false);
  return (
    <article className="mcard open plan-card">
      <div className="mhead"><div>
        <div className="mlabel">Hire — monthly cost</div>
        <div className="mval"><span className="num">{money(cost)}</span><span className="dlt">/mo</span></div>
      </div>
        <span className={`pill lite-${r.verdict === "comfortable" ? "hi" : r.verdict === "workable" ? "mod" : "none"}`}>
          <span className="dot" />{r.verdict}
        </span>
      </div>
      <input className="plan-slider" type="range" min={500} max={3000} step={50} value={cost}
        onChange={(e) => setCost(+e.target.value)} aria-label="Monthly hire cost" />
      <div className="calc" style={{ marginTop: 10 }}>
        {money(BASELINE.avgProfit)} <span className="op">avg monthly profit</span><br />
        <span className="op">−</span> {money(cost)} <span className="op">hire</span><br />
        <span className="res">= {money(r.cushionAvg)} cushion</span>
        <hr />
        <span className="op">worst month (Feb):</span><br />
        {money(BASELINE.worstProfit)} <span className="op">−</span> {money(cost)}{" "}
        <span className={r.cushionWorst < 500 ? "warn" : "res"}>= {money(r.cushionWorst)} cushion</span>
      </div>
      <button className="dbtn log-btn" disabled={logged}
        onClick={() => { logDecision(`Hire at ${money(cost)}/mo`, `cushion ≥ ${money(r.cushionAvg)} on average`); setLogged(true); }}>
        {logged ? "✓ logged — grades in 30 days" : "Log this decision"}
      </button>
    </article>
  );
}

function PriceCard() {
  const [pct, setPct] = useState(5);
  const r = useMemo(() => priceScenario(pct), [pct]);
  const [logged, setLogged] = useState(false);
  return (
    <article className="mcard open plan-card">
      <div className="mhead"><div>
        <div className="mlabel">Price change</div>
        <div className="mval"><span className="num">{pct > 0 ? "+" : ""}{pct}%</span></div>
      </div>
        <span className="pill lite-fc"><span className="dot" />honest range</span>
      </div>
      <input className="plan-slider" type="range" min={-10} max={15} step={1} value={pct}
        onChange={(e) => setPct(+e.target.value)} aria-label="Price change percent" />
      <div className="mmean" style={{ marginTop: 10 }}>
        Monthly profit impact: <b>{money(Math.min(r.bestProfitDelta, r.worstProfitDelta))} to {money(Math.max(r.bestProfitDelta, r.worstProfitDelta))}</b>.
        The range is wide because I <b>don't know your true price sensitivity</b> — I won't pretend to.
        It spans cautious to strong customer reaction.
      </div>
      <div className="honest-note">Run it for 3 weeks and I'll measure the real effect in “Was it worth it?”.</div>
      <button className="dbtn log-btn" disabled={logged}
        onClick={() => { logDecision(`Price change ${pct > 0 ? "+" : ""}${pct}%`, "profit impact inside the projected range"); setLogged(true); }}>
        {logged ? "✓ logged — grades in 30 days" : "Log this decision"}
      </button>
    </article>
  );
}

function DayCard() {
  const [wd, setWd] = useState(1);
  const [mode, setMode] = useState<"drop" | "add">("drop");
  const [out, setOut] = useState<DayChangeOut | null>(null);
  const [busy, setBusy] = useState(false);
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  async function run() {
    setBusy(true);
    try { setOut(await rehearseDay(wd, mode)); } finally { setBusy(false); }
  }
  return (
    <article className="mcard open il-card">
      <div className="il-head">
        <span className="il-kick">drop or add a trading day</span>
        <span className="pill lite-fc"><span className="dot" />simulated from YOUR weekday rhythm</span>
      </div>
      <div className="mmean">
        The question every owner asks in January: is that slow day worth opening?
        Measured from your own last 8 weeks — banded, never promised.
      </div>
      <div className="dropin-row" style={{ alignItems: "center" }}>
        <select className="ps-select" value={mode} aria-label="Add or drop"
          onChange={(e) => { setMode(e.target.value as "drop" | "add"); setOut(null); }}>
          <option value="drop">If I close on…</option>
          <option value="add">If I open on…</option>
        </select>
        <select className="ps-select" value={wd} aria-label="Weekday"
          onChange={(e) => { setWd(Number(e.target.value)); setOut(null); }}>
          {DAYS.map((d, i) => <option key={d} value={i}>{d}s</option>)}
        </select>
        <button className="dbtn primary" disabled={busy} onClick={run}>{busy ? "…" : "Rehearse it"}</button>
      </div>
      {out && (
        <div style={{ marginTop: 12 }}>
          <div className="mmean"><b>{out.verdict}</b></div>
          <div className="mmean" style={{ marginTop: 6 }}>{out.detail}</div>
          <div className="il-cite" style={{ marginTop: 8 }}>{out.cite}</div>
          {out.ok && (
            <ActOn source="rehearse · day change"
              action={`${mode === "drop" ? "Close" : "Open"} on ${DAYS[wd]}s`}
              expected={out.verdict} impact={out.impactMo ? Math.abs(out.impactMo) : undefined} />
          )}
        </div>
      )}
    </article>
  );
}

function PurchaseCard() {
  const [cost, setCost] = useState(8000);
  const r = useMemo(() => purchaseScenario(cost, 400), [cost]);
  const [logged, setLogged] = useState(false);
  return (
    <article className="mcard open plan-card">
      <div className="mhead"><div>
        <div className="mlabel">Equipment purchase</div>
        <div className="mval"><span className="num">{money(cost)}</span></div>
      </div>
        <span className={`pill lite-${r.runwayAfter >= 4 ? "hi" : "mod"}`}><span className="dot" />{r.runwayAfter.toFixed(1)} mo runway after</span>
      </div>
      <input className="plan-slider" type="range" min={1000} max={15000} step={500} value={cost}
        onChange={(e) => setCost(+e.target.value)} aria-label="Purchase cost" />
      <div className="calc" style={{ marginTop: 10 }}>
        {money(BASELINE.cash)} <span className="op">cash</span> <span className="op">−</span> {money(cost)}<br />
        <span className="op">÷ {money(BASELINE.burn)} burn</span><br />
        <span className={r.runwayAfter < 4 ? "warn" : "res"}>= {r.runwayAfter.toFixed(1)} months runway</span>
        {r.monthsToRecoup && (<><hr /><span className="op">recoup at $400/mo uplift:</span><br /><span className="res">{r.monthsToRecoup.toFixed(0)} months</span></>)}
      </div>
      <button className="dbtn log-btn" disabled={logged}
        onClick={() => { logDecision(`Equipment purchase ${money(cost)}`, `runway stays ≥ ${r.runwayAfter.toFixed(1)} months`); setLogged(true); }}>
        {logged ? "✓ logged — grades in 30 days" : "Log this decision"}
      </button>
    </article>
  );
}

/* ------------------------------- worth it? -------------------------------- */

const CANDIDATES = [
  { label: "Feb 1 · price increase", date: "2026-02-01" },
  { label: "Mar 4 · promo ended", date: "2026-03-04" },
  { label: "Jan 15 · new supplier", date: "2026-01-15" },
];

function WorthItCard() {
  const [sel, setSel] = useState<string | null>(null);
  const [res, setRes] = useState<WorthIt | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(date: string) {
    setSel(date); setBusy(true); setRes(null);
    const r = await wasItWorthIt(date);
    setRes(r); setBusy(false);
  }

  return (
    <article className="mcard open plan-card">
      <div className="mmean">
        Pick a decision you made — I'll test whether the numbers <b>actually moved</b> after it.
      </div>
      <div className="period" style={{ marginTop: 10, marginBottom: 0 }}>
        {CANDIDATES.map((c) => (
          <button key={c.date} className={`seg ${sel === c.date ? "on" : ""}`} onClick={() => run(c.date)}>{c.label}</button>
        ))}
      </div>
      {busy && <div className="mmean" style={{ marginTop: 12, color: "var(--muted)" }}>▶ testing before vs after on this device…</div>}
      {res && (
        <>
          <div className="mmean" style={{ marginTop: 12 }}>
            {res.found ? (
              <><b>The numbers moved.</b> Revenue averaged {money(res.beforeMean)}/day before and {money(res.afterMean)}/day after
                ({res.pctChange > 0 ? "+" : ""}{res.pctChange.toFixed(0)}%) — {res.pPlain} (p {res.p < 0.001 ? "< 0.001" : `= ${res.p.toFixed(3)}`}).</>
            ) : (
              <><b>No detectable effect.</b> Before {money(res.beforeMean)}/day, after {money(res.afterMean)}/day — {res.pPlain}. If it cost you something, that's worth knowing too.</>
            )}
          </div>
          <div className="honest-note">
            Honest scope: this is before/after significance around your date — not full causal adjustment.
            Season or promos could share credit. Full do-calculus lands with the server brain.
          </div>
        </>
      )}
    </article>
  );
}

/* ------------------------------- decisions log ---------------------------- */

function DecisionsCard() {
  const nav = useNavigate();
  const [items, setItems] = useState<Decision[]>([]);
  useEffect(() => { setItems(listDecisions()); }, []);
  // Re-read when a scenario logs a new one (simple poll on visibility).
  useEffect(() => {
    const t = setInterval(() => setItems(listDecisions()), 2500);
    return () => clearInterval(t);
  }, []);
  return (
    <article className="mcard open plan-card">
      {items.slice(0, 3).map((d) => (
        <div className="dl-row" key={d.id}>
          <div className="dl-head">
            <span className="dl-action">{d.action}</span>
            {d.grade
              ? <span className={`pill lite-${d.grade.verdict === "held" ? "hi" : d.grade.verdict === "mixed" ? "mod" : "none"}`}><span className="dot" />{d.grade.verdict}</span>
              : <span className="pill lite-fc"><span className="dot" />judge by {d.gradeAt}</span>}
          </div>
          <div className="dl-expected">expected: {d.expected}</div>
          {d.grade && <div className="dl-note">{d.grade.note}</div>}
        </div>
      ))}
      <button className="dbtn primary log-btn" onClick={() => nav("/decisions")}>
        Open the tracker — add, advance, grade →
      </button>
    </article>
  );
}
