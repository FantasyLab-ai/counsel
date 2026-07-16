// Money — the cash-flow calendar (your weekday inflow profile vs the real
// outgoing schedule), the tax set-aside pot, and AR aging with a chase
// order. Same honesty rules: derived numbers labeled, assumptions visible.

import { useEffect, useState } from "react";
import { displayName } from "../engine/persona";
import {
  arAging, cashCalendar, taxSetAside,
  type ArOut, type CalendarOut, type TaxOut,
} from "../engine/money";
import { money } from "../engine/tierMath";
import { dataMode } from "../engine/dataSource";
import { ActOn, Awaiting, Reveal } from "../components/ui";

export default function Money() {
  const [cal, setCal] = useState<CalendarOut | null>(null);
  const [ar, setAr] = useState<ArOut | null>(null);
  const [tax] = useState<TaxOut>(taxSetAside());
  const [err, setErr] = useState<string | null>(null);
  const liveMode = dataMode() === "live";

  useEffect(() => {
    if (liveMode) return; // fixtures stay in the showroom
    let on = true;
    Promise.all([cashCalendar(), arAging()])
      .then(([c, a]) => { if (on) { setCal(c); setAr(a); } })
      .catch((e) => on && setErr(String(e)));
    return () => { on = false; };
  }, [liveMode]);

  if (liveMode) {
    // Live business: this screen runs on bills + invoices + expenses — none
    // of which have arrived yet. Say so; never show the demo's money.
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

      {cal && ar && (
        <>
          <Reveal i={0}>
            <section className="voice">
              <div className="eyebrow on-dark">{cal.monthLabel} · planned</div>
              <div className="said">
                Tightest day: <em>{new Date(cal.tightestIso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</em> — and you stay {cal.tightestCash > 0 ? "above water" : "underwater"}.
              </div>
              <div className="sub">
                Expected in: <b style={{ color: "#d8c19a" }}>{money(cal.totalIn)}</b> (your weekday
                profile × margin) · scheduled out: <b style={{ color: "#d8c19a" }}>{money(cal.totalOut)}</b> ·
                low point {money(cal.tightestCash)}. {ar.overdue > 0 && <>Plus <b style={{ color: "#d8c19a" }}>{money(ar.overdue)}</b> sitting in overdue invoices below.</>}
              </div>
            </section>
          </Reveal>

          <div className="eyebrow">The cash calendar</div>
          <Reveal i={1}>
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
              <div className="il-cite">assumption-labeled: SE tax 15.3% on 92.35% of net + ~12% federal bracket ≈ 26% effective · sole-prop simplification, not tax advice — your CPA sets the real number</div>
            </article>
          </Reveal>
        </>
      )}
    </div>
  );
}
