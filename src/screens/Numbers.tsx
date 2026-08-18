// Numbers — every metric can show its work. Each card's math is a DIFFERENT
// shape (stat test / band / arithmetic / attribution / trend): the engine
// picks the right method per question. That variety IS the glass box.

import { useEffect, useState } from "react";
import { displayName } from "../engine/persona";
import { useNavigate } from "react-router-dom";
import { getMetrics, type Metric, type Period } from "../api/counsel";
import { anchorDate, periodMetrics, resolveWindow, type PeriodId } from "../engine/periodMetrics";
import { dataMode } from "../engine/dataSource";
import { drivers, type DriversOut, type DriversThin } from "../engine/drivers";
import { money } from "../engine/tierMath";
import { ActOn, ConfidencePill, CountUp, FinanceSegs, Html, Receipt, Reveal, ShareCard, Skeleton } from "../components/ui";
import { MathView } from "../components/charts";

// The "what changed" card — driver decomposition. Answers WHY revenue moved:
// traffic × basket × price (parts sum to the move exactly), plus mix and
// who bought. The engine every narrative quotes.
function DriversCard() {
  const [out, setOut] = useState<DriversOut | DriversThin | null>(null);
  useEffect(() => {
    let on = true;
    drivers().then((d) => on && setOut(d)).catch((e) => on && setOut({ ok: false, reason: String(e) }));
    return () => { on = false; };
  }, []);

  if (!out) return <article className="mcard open il-card"><div className="il-loading">▶ decomposing the move…</div></article>;
  if (!out.ok) {
    return (
      <article className="mcard open il-card awaiting">
        <div className="il-head"><span className="il-kick">what changed</span>
          <span className="pill lite-fc"><span className="dot" />warming up</span></div>
        <div className="mmean">Driver decomposition {out.reason}. <b>I won't decompose a move I can't support.</b></div>
      </article>
    );
  }

  const maxAbs = Math.max(...out.parts.map((p) => Math.abs(p.dollars)), 1);
  const mathBlock = {
    methodPlain: `I compared two aligned ${out.windowDays}-day windows (identical weekday counts, so weekend rhythm can't fake a trend) and split the revenue change using Rev = sales × units/sale × $/unit. The three parts telescope — they sum to the move exactly.`,
    keyStatPlain: `${money(out.rev1)} → ${money(out.rev2)}: a ${out.deltaDollars >= 0 ? "+" : ""}${money(out.deltaDollars)} move, fully attributed.`,
    keyStatNotation: `ΔRev = ΔT·U₁·P₁ + T₂·ΔU·P₁ + T₂·U₂·ΔP · exact identity`,
    viz: {
      kind: "arithmetic" as const,
      lines: [
        ...out.parts.map((p) => ({ text: `${p.key}: ${p.dollars >= 0 ? "+" : "−"}${money(Math.abs(p.dollars))} (${p.detail})` })),
        { text: `total: ${out.deltaDollars >= 0 ? "+" : "−"}${money(Math.abs(out.deltaDollars))}`, kind: "result" as const },
      ],
    },
    citation: { method: "revenue driver decomposition (exact identity)", source: "your ledger, two aligned 28-day windows" },
  };

  return (
    <article className="mcard open il-card">
      <div className="il-head"><span className="il-kick">what changed — the drivers</span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <ShareCard kicker="what changed — the drivers" headline={out.headline}
            sub={`${money(out.rev1)} → ${money(out.rev2)} across two aligned 4-week windows`}
            cite={out.cite} business={displayName()} />
          <span className={`pill ${Math.abs(out.deltaPct) < 3 ? "lite-hi" : "lite-mod"}`}><span className="dot" />
            {out.deltaPct >= 0 ? "+" : ""}{out.deltaPct.toFixed(1)}% vs prior 4 wks</span>
        </span></div>
      <div className="mmean">
        <Receipt math={mathBlock} title="what changed — the math"><Html text={out.headline} /></Receipt>
      </div>
      <div className="drv-bars">
        {out.parts.map((p) => (
          <div className="drv-row" key={p.key}>
            <span className="drv-name">{p.label} <span className="drv-detail">{p.detail}</span></span>
            <span className={`drv-val ${p.dollars >= 0 ? "pos" : "neg"}`}>{p.dollars >= 0 ? "+" : "−"}{money(Math.abs(p.dollars))}</span>
            <span className="drv-track">
              <span className={`drv-fill ${p.dollars >= 0 ? "pos" : "neg"}`}
                style={{ left: "0", width: `${(Math.abs(p.dollars) / maxAbs) * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
      {out.mix && (
        <div className="il-row-sub"><b style={{ color: "var(--ink)" }}>Mix:</b> {out.mix.product} carried {out.mix.to}% of revenue, {out.mix.to > out.mix.from ? "up" : "down"} from {out.mix.from}%.</div>
      )}
      {out.customers && (
        <div className="il-row-sub"><b style={{ color: "var(--ink)" }}>Who bought:</b> {out.customers.returningShare}% returning · {out.customers.newShare}% new (was {out.customers.prevNewShare}% new).</div>
      )}
      {/* THE SO-WHAT: the diagnosis picks the move. Only offered when the
          move is real (beyond ±3%) — no busywork on noise. */}
      {out.deltaPct < -3 && (() => {
        const worst = [...out.parts].sort((a, b) => a.dollars - b.dollars)[0];
        const MOVES: Record<string, { action: string; expected: string }> = {
          traffic: { action: "Win-back the regulars + one spotlight post this week", expected: "traffic recovers vs weekday norms — judged against the drivers, not vibes" },
          basket: { action: "Bundle the star with a slow mover", expected: "units per sale climb back toward the prior window" },
          price: { action: "Audit discounts — realized price per unit slid", expected: "price recovers without a volume hit outside the CI" },
        };
        const mv = MOVES[worst.key];
        return mv ? (
          <ActOn source="Drivers · what changed" action={mv.action} expected={mv.expected}
            impact={Math.abs(worst.dollars)} />
        ) : null;
      })()}
      {out.deltaPct > 3 && (
        <button className="acton" onClick={() => window.location.assign("/marketing")}>
          → It's working — find WHICH lever in Marketing and repeat it
        </button>
      )}
      <div className="il-cite">{out.cite}</div>
    </article>
  );
}

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "quarter", label: "Quarter" },
  { id: "custom", label: "Custom" },
];

export default function Numbers() {
  const nav = useNavigate();
  const [period, setPeriod] = useState<PeriodId>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [winLabel, setWinLabel] = useState("");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({ revenue: true });

  // "This month" in demo mode keeps the hand-set showcase cards (the story
  // with its break-line and bands); every other window — and everything in
  // live mode — is COMPUTED for the exact range against the window before.
  const showcase = period === "month" && dataMode() === "demo";

  useEffect(() => {
    let on = true;
    if (showcase) {
      getMetrics("month" as Period).then((m) => { if (on) { setMetrics(m); } });
      resolveWindow("month").then((w) => on && setWinLabel(w.label)).catch(() => undefined);
      return () => { on = false; };
    }
    const custom = period === "custom" && customFrom && customTo ? { from: customFrom, to: customTo } : undefined;
    if (period === "custom" && !custom) {
      // seed sensible defaults for the pickers from the data's anchor
      anchorDate().then((a) => {
        if (!on) return;
        const from = new Date(a + "T00:00:00"); from.setDate(from.getDate() - 29);
        setCustomFrom(from.toISOString().slice(0, 10));
        setCustomTo(a);
      }).catch(() => undefined);
      return () => { on = false; };
    }
    periodMetrics(period, custom)
      .then(({ window: w, metrics: m }) => { if (on) { setWinLabel(w.label); setMetrics(m); } })
      .catch(() => on && setMetrics([]));
    return () => { on = false; };
  }, [period, customFrom, customTo, showcase]);

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">{displayName()} · {winLabel || "…"}</div>
          <h1>The numbers, read</h1>
        </div>
        <button className="export-btn" onClick={() => nav("/packet")}
          title="Banker's Packet — lender-ready, every figure cited">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          Packet
        </button>
      </div>
      <FinanceSegs />

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

      {period === "custom" && (
        <div className="custom-range">
          <input className="dt-input" type="date" value={customFrom} aria-label="From"
            max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
          <span className="cr-sep">→</span>
          <input className="dt-input" type="date" value={customTo} aria-label="To"
            min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      <div className="reassure">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        Every number below can show its work. Tap “show the math” on any card.
      </div>

      <div className="eyebrow">Why it moved</div>
      <Reveal i={0}><DriversCard /></Reveal>

      {metrics.length === 0 && <Skeleton lines={4} caption="reading the numbers…" />}
      {metrics.map((m, i) => (
        <Reveal i={i} key={`${period}-${m.id}`}>
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

      {/* The Banker's Packet — prominent entry, not just the appbar button. */}
      <Reveal i={metrics.length}>
        <button className="packet-card" onClick={() => nav("/packet")}>
          <div className="pc-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
          </div>
          <div className="pc-body">
            <div className="pc-title">The Banker's Packet</div>
            <div className="pc-sub">A lender-ready financial statement of record — every figure cited with its method. Print or save as PDF.</div>
          </div>
          <span className="pc-go">→</span>
        </button>
      </Reveal>
    </div>
  );
}
