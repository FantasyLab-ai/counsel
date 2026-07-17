// Money — the cash-flow calendar (your weekday inflow profile vs the real
// outgoing schedule), the tax set-aside pot, and AR aging with a chase
// order. Same honesty rules: derived numbers labeled, assumptions visible.

import { useEffect, useState } from "react";
import { displayName } from "../engine/persona";
import {
  arAging, cashCalendar, getCashOnHand, setCashOnHand, taxSetAside,
  type ArOut, type CalendarOut, type TaxOut,
} from "../engine/money";
import { money } from "../engine/tierMath";
import { dataMode, userExpenses } from "../engine/dataSource";
import { cashView, type CashViewOut, type CashViewThin } from "../engine/cashview";
import { ActOn, Awaiting, Receipt, Reveal } from "../components/ui";

// Cash on hand — the one number no connector knows yet. The owner states
// it once; the calendar, the 13-week view and runway anchor on it.
function CashAnchorRow() {
  const [editing, setEditing] = useState(getCashOnHand() === null);
  const [draft, setDraft] = useState("");
  const [, force] = useState(0);
  const v = getCashOnHand();
  return (
    <div className="pulse-row">
      <div className="pulse-txt">
        <b>Cash on hand</b> — anchors the calendar and the 13-week view.
        {v === null ? " Not set: views show net flow from $0." : ""}
      </div>
      {editing ? (
        <span className="de-cost">
          <input type="number" inputMode="decimal" autoFocus value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { setCashOnHand(parseFloat(draft)); setEditing(false); window.location.reload(); } }} />
          <button className="dt-btn" onClick={() => { if (draft.trim()) { setCashOnHand(parseFloat(draft)); window.location.reload(); } setEditing(false); force((x) => x + 1); }}>save</button>
        </span>
      ) : (
        <button className="dbtn" onClick={() => { setDraft(v !== null ? String(v) : ""); setEditing(true); }}>
          {v !== null ? money(v) : "set it"}
        </button>
      )}
    </div>
  );
}

// The 13-week cash view — THE fractional-CFO deliverable. Weekly banded
// cash-in vs scheduled bills, cumulated into a runway ribbon; tight weeks
// flagged months ahead so there's time to act.
function CashViewCard() {
  const [cv, setCv] = useState<CashViewOut | CashViewThin | null>(null);
  useEffect(() => {
    let on = true;
    cashView().then((c) => on && setCv(c)).catch((e) => on && setCv({ ok: false, reason: String(e) }));
    return () => { on = false; };
  }, []);

  if (!cv) return <article className="mcard open il-card"><div className="il-loading">▶ building 13 weeks…</div></article>;
  if (!cv.ok) {
    return (
      <article className="mcard open il-card awaiting">
        <div className="mmean">13-week view {cv.reason} — it sharpens as history builds.</div>
      </article>
    );
  }

  const lo = Math.min(...cv.weeks.map((w) => w.cumLo), 0);
  const hi = Math.max(...cv.weeks.map((w) => w.cumMid), cv.startCash);
  const scale = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const mathBlock = {
    methodPlain: `Each week: your recent-regime revenue range (p15/p50/p85 of the last 8 complete weeks) × margin, plus probability-weighted receivables, minus the recurring bill schedule — cumulated from cash on hand. The cautious line assumes the LOW band every single week.`,
    keyStatPlain: cv.firstTight
      ? `Cautious-case tight point: week of ${cv.firstTight.label} at ${money(cv.firstTight.cumLo)}.`
      : `Cautious-case low point stays above ${money(Math.min(...cv.weeks.map((w) => w.cumLo)))} across all 13 weeks.`,
    keyStatNotation: `cum_w = cash₀ + Σ(rev_band × margin + AR·p − bills) · p15 path = cautious`,
    citation: { method: "13-week cash projection (banded, probability-weighted AR)", source: "your ledger + invoice book + bill schedule" },
  };

  return (
    <article className="mcard open il-card">
      <div className="il-head"><span className="il-kick">the 13-week view</span>
        <span className={`pill ${cv.tightWeeks ? "lite-mod" : "lite-hi"}`}><span className="dot" />
          {cv.tightWeeks ? `${cv.tightWeeks} tight week${cv.tightWeeks === 1 ? "" : "s"}` : "clear in the cautious case"}</span></div>
      <div className="mmean">
        <Receipt math={mathBlock} title="the 13-week view — the math">
          <span dangerouslySetInnerHTML={{ __html: cv.headline }} />
        </Receipt>
      </div>
      <div className="cw-ribbon" role="img" aria-label="13-week cash ribbon">
        {cv.weeks.map((w, i) => (
          <div className="cw-col" key={w.startIso} title={`${w.label}: cautious ${money(w.cumLo)} · mid ${money(w.cumMid)}${w.billLabels.length ? ` · ${w.billLabels.join(", ")}` : ""}`}>
            <div className="cw-bars">
              <span className="cw-mid" style={{ height: `${scale(w.cumMid)}%` }} />
              <span className={`cw-lo ${w.tight ? "tight" : ""}`} style={{ height: `${Math.max(2, scale(w.cumLo))}%` }} />
            </div>
            <span className="cw-lbl">{i % 2 === 0 ? w.label : ""}</span>
          </div>
        ))}
      </div>
      <div className="il-row-sub">
        <b style={{ color: "var(--ink)" }}>Reading it:</b> tall bar = mid path, short bar = the cautious path.
        {cv.firstTight ? ` Amber = cautious case dips tight — move cash or chase AR before then.` : ` Both paths stay clear.`}
      </div>
      {cv.firstTight && (
        <ActOn source="13-week cash view" action={`Cover the week of ${cv.firstTight.label}`}
          expected={`chase AR early, shift a bill, or park a buffer — done BEFORE the cautious case dips to ${money(cv.firstTight.cumLo)}`}
          impact={Math.max(0, 2000 - cv.firstTight.cumLo)} />
      )}
      <div className="il-cite">{cv.cite}</div>
    </article>
  );
}

export default function Money() {
  const [cal, setCal] = useState<CalendarOut | null>(null);
  const [ar, setAr] = useState<ArOut | null>(null);
  const [tax, setTax] = useState<TaxOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const liveMode = dataMode() === "live";

  const hasExp = !liveMode || !!userExpenses()?.length;
  useEffect(() => {
    let on = true;
    taxSetAside().then((t) => on && setTax(t)).catch(() => undefined);
    if (liveMode && !hasExp) return () => { on = false; }; // nothing to compute yet
    Promise.all([cashCalendar(), liveMode ? Promise.resolve(null) : arAging()])
      .then(([c, a]) => { if (on) { setCal(c); setAr(a); } })
      .catch((e) => on && setErr(String(e)));
    return () => { on = false; };
  }, [liveMode, hasExp]);

  if (liveMode && !hasExp) {
    // Live business with NO expense data yet: the money map has no fuel.
    // Say so; never show the demo's money.
    return (
      <div className="app">
        <div className="appbar">
          <div className="titleblock">
            <div className="kicker">{displayName()} · the money map</div>
            <h1>Money</h1>
          </div>
          <div className="avatar">B</div>
        </div>
        <div className="eyebrow">Runs on data you haven't connected yet</div>
        <Reveal i={0}>
          <Awaiting title="The cash calendar" needs="your expenses/bank (bills on their days)"
            unlocks="Every bill lands on its day against your real inflow rhythm — the tightest day, called in advance." />
        </Reveal>
        <Reveal i={1}>
          <Awaiting title="Owed to you — AR aging" needs="your invoices (invoices.csv or Stripe Invoicing)"
            unlocks="Who owes you, how late, the chase order, and your true DSO." />
        </Reveal>
        <Reveal i={2}>
          <Awaiting title="The tax pot" needs="your expenses (true profit)"
            unlocks="A monthly set-aside computed from real profit — no surprises in April." />
        </Reveal>
        <Reveal i={3}>
          <Awaiting title="The 13-week cash view" needs="your expenses + invoices (bills & receivables)"
            unlocks="Week-by-week banded cash against your real bills — tight weeks flagged months ahead. The report CFOs charge thousands for." />
        </Reveal>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">{displayName()} · the money map</div>
          <h1>Money</h1>
        </div>
        <div className="avatar">B</div>
      </div>

      {err && <div className="reassure">Money engine unavailable: {err}</div>}
      {!cal && !err && <div className="il-loading">▶ building your cash calendar…</div>}

      {cal && (ar || liveMode) && (
        <>
          {liveMode && <Reveal i={0}><CashAnchorRow /></Reveal>}
          <Reveal i={0}>
            <section className="voice">
              <div className="eyebrow on-dark">{cal.monthLabel} · planned</div>
              <div className="said">
                Tightest day: <em>{new Date(cal.tightestIso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</em> — and you stay {cal.tightestCash > 0 ? "above water" : "underwater"}.
              </div>
              <div className="sub">
                Expected in: <b style={{ color: "#d8c19a" }}>{money(cal.totalIn)}</b> ({cal.mode === "live" ? "your weekday revenue profile" : "your weekday profile × margin"}) · scheduled out: <b style={{ color: "#d8c19a" }}>{money(cal.totalOut)}</b> ({cal.mode === "live" ? "your recorded bills + variable spend" : "the bill schedule"}) ·
                low point {money(cal.tightestCash)}{cal.mode === "live" && !cal.anchored ? " (net flow from $0 — set cash on hand above)" : ""}. {ar && ar.overdue > 0 && <>Plus <b style={{ color: "#d8c19a" }}>{money(ar.overdue)}</b> sitting in overdue invoices below.</>}
              </div>
            </section>
          </Reveal>

          <div className="eyebrow">Thirteen weeks out — planned, not hoped</div>
          <Reveal i={1}><CashViewCard /></Reveal>

          <div className="eyebrow">The cash calendar</div>
          <Reveal i={2}>
            <article className="mcard open il-card">
              <div className="cal-grid">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <div className="cal-h" key={`h${i}`}>{d}</div>
                ))}
                {cal.days.map((d) => (
                  <div key={d.iso} className={`cal-d ${!d.inMonth ? "blank" : ""} ${d.outflow > 0 ? "out" : ""} ${d.tightest ? "tight" : ""}`}
                       title={d.inMonth ? `${d.iso} · in ~${money(d.inflow)}${d.outLabel ? ` · out ${money(d.outflow)} (${d.outLabel})` : ""} · running ${money(d.running)}` : undefined}>
                    {d.inMonth && <>
                      <span className="cal-n">{d.dom}</span>
                      {d.outflow > 0 && <span className="cal-o">−{Math.round(d.outflow / 100) / 10}k</span>}
                      {d.tightest && <span className="cal-star">▾ low</span>}
                    </>}
                  </div>
                ))}
              </div>
              <div className="il-cite">inflows = your weekday revenue profile × {`${(0.34 * 100).toFixed(0)}%`} margin · outgoings = the same schedule the runway simulation uses (rent 1st · materials 3rd · software 5th · utilities 15th · draw 28th) · tap a day for detail</div>
            </article>
          </Reveal>

          <div className="eyebrow">Owed to you — chase in this order</div>
          {liveMode ? (
            <Reveal i={3}>
              <Awaiting title="AR aging" needs="your invoices (invoices.csv or Stripe Invoicing)"
                unlocks="Who owes you, how late, the chase order weighted by size, and your true DSO." />
            </Reveal>
          ) : ar && (
          <Reveal i={2}>
            <article className="mcard open il-card">
              <div className="mval"><span className="num">{money(ar.overdue)}</span><span className="dlt">overdue of {money(ar.totalOpen)} open</span></div>
              {ar.chase.map((inv) => (
                <div className="ar-row" key={inv.id}>
                  <span className={`pill ${inv.bucket === "61+" ? "lite-none" : "lite-mod"}`}><span className="dot" />{inv.daysLate}d late</span>
                  <div className="ar-body">
                    <div className="ar-main"><b>{inv.client}</b> · {money(inv.amount)}</div>
                    <div className="ar-sub">{inv.id} · due {inv.due} · {inv.bucket === "61+" ? "call, don't email" : "friendly nudge"}</div>
                  </div>
                </div>
              ))}
              {ar.open.filter((i) => i.daysLate === 0).map((inv) => (
                <div className="ar-row current" key={inv.id}>
                  <span className="pill lite-hi"><span className="dot" />current</span>
                  <div className="ar-body">
                    <div className="ar-main">{inv.client} · {money(inv.amount)}</div>
                    <div className="ar-sub">{inv.id} · due {inv.due}</div>
                  </div>
                </div>
              ))}
              {ar.chase[0] && (
                <ActOn source="Money · AR aging" action={`Chase ${ar.chase[0].client} (${money(ar.chase[0].amount)}, ${ar.chase[0].daysLate}d late)`}
                  expected={`payment or plan within 14 days; escalate if silent`}
                  impact={ar.chase[0].amount} />
              )}
              <div className="il-cite">chase order = days late × amount · your paid invoices settle in ~{ar.dso} days on average (DSO) · wholesale invoices from the demo ledger</div>
            </article>
          </Reveal>
          )}

          {tax && (<>
          <div className="eyebrow">The tax pot</div>
          <Reveal i={3}>
            <article className="mcard open il-card">
              <div className="mval"><span className="num">{money(tax.setAside)}</span><span className="dlt">/mo into the pot</span></div>
              <div className="mmean">
                On ~{money(tax.monthlyProfit)}/mo of profit, set aside <b>{(tax.rate * 100).toFixed(0)}%</b>.
                By now the pot should hold about <b>{money(tax.ytdPot)}</b> ({tax.months} months).
                Quarterly payment comes due — the pot means it's boring, not scary.
              </div>
              <div className="calc" style={{ marginTop: 8 }}>
                {money(tax.monthlyProfit)} <span className="op">avg monthly profit</span><br />
                <span className="op">× {(tax.rate * 100).toFixed(0)}% effective rate</span><br />
                <span className="res">= {money(tax.setAside)} / month</span>
              </div>
              <div className="il-cite">assumption-labeled: SE tax 15.3% on 92.35% of net + ~12% federal bracket ≈ 26% effective · sole-prop simplification, not tax advice — your CPA sets the real number{tax.setAside === 0 ? " · no positive profit this window — nothing to set aside; the posture takes priority" : ""}</div>
            </article>
          </Reveal>
          </>)}
        </>
      )}
    </div>
  );
}
