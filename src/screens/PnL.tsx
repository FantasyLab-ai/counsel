// P&L — the statement every owner already knows how to read. Month pager,
// revenue by product, expenses by category (lines open to their receipts),
// net with margin, deltas vs last month, and — for the current partial
// month — an honest weekday-weighted month-end projection with a band.
// The deep analytics live in Insights; this is the familiar surface.

import { useEffect, useState } from "react";
import { displayName } from "../engine/persona";
import { useNavigate } from "react-router-dom";
import { pnl, type PnlLine, type PnlOut, type PnlThin } from "../engine/pnl";
import { money } from "../engine/tierMath";
import { Awaiting, Receipt, Reveal, Skeleton, Written } from "../components/ui";

function Delta({ now, prev }: { now: number; prev: number | null }) {
  if (prev === null || prev === 0) return null;
  const pct = ((now - prev) / Math.abs(prev)) * 100;
  if (!isFinite(pct) || Math.abs(pct) < 1) return <span className="pl-delta flat">—</span>;
  return (
    <span className={`pl-delta ${pct >= 0 ? "up" : "down"}`}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function Line({ line, sign }: { line: PnlLine; sign: 1 | -1 }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`pl-line ${open ? "open" : ""}`}>
      <button className="pl-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`pl-chev ${open ? "open" : ""}`} aria-hidden="true">›</span>
        <span className="pl-name">{line.name}</span>
        <Delta now={line.amount} prev={line.prev} />
        <span className="pl-amt">{sign < 0 ? "−" : ""}{money(line.amount)}</span>
      </button>
      {open && (
        <div className="pl-children">
          {line.children.map((c) => (
            <div className="pl-child" key={c.name}>
              <span className="pl-cname">{c.name}</span>
              <span className="pl-camt">
                {c.note === "count" ? c.amount
                  : c.note === "%" ? `${c.amount}%`
                  : money(c.amount)}
                {c.note === "median" ? " median" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PnL() {
  const nav = useNavigate();
  const [out, setOut] = useState<PnlOut | PnlThin | null>(null);
  const [month, setMonth] = useState<string | undefined>(undefined);

  useEffect(() => {
    let on = true;
    pnl(month).then((o) => on && setOut(o)).catch((e) => on && setOut({ ok: false, reason: String(e) }));
    return () => { on = false; };
  }, [month]);

  if (!out) {
    return (
      <div className="app">
        <div className="appbar"><div className="titleblock"><div className="kicker">{displayName()}</div><h1>Profit &amp; loss</h1></div></div>
        <Skeleton lines={4} caption="setting the statement…" />
      </div>
    );
  }
  if (!out.ok) {
    return (
      <div className="app">
        <div className="appbar"><div className="titleblock"><div className="kicker">{displayName()}</div><h1>Profit &amp; loss</h1></div></div>
        <Awaiting title="The P&L" needs="sales data (connect a source or drop a CSV)"
          unlocks="Revenue by product, expenses by category, net by month — the statement, computed live." />
      </div>
    );
  }

  const idx = out.months.indexOf(out.monthIso);
  const prevM = idx > 0 ? out.months[idx - 1] : null;
  const nextM = idx < out.months.length - 1 ? out.months[idx + 1] : null;

  const netMath = out.net ? {
    methodPlain: `Every ${out.monthLabel} sale summed by product; every recorded expense summed by category; net is the difference. This is the ledger itself, not a model of it.`,
    keyStatPlain: `${money(out.revenue.total)} in − ${money(out.expenses.total)} out = ${money(out.net.amount)} kept (${out.net.marginPct.toFixed(0)}%).`,
    keyStatNotation: `net = Σrevenue − Σexpenses · by-line detail in the rows above`,
    viz: {
      kind: "arithmetic" as const,
      lines: [
        { text: `revenue, ${out.monthLabel}: ${money(out.revenue.total)}` },
        { text: `expenses, recorded: −${money(out.expenses.total)}` },
        { text: `net: ${money(out.net.amount)} (${out.net.marginPct.toFixed(1)}%)`, kind: "result" as const },
      ],
    },
    citation: { method: "ledger arithmetic", source: "your sales + recorded expenses" },
  } : undefined;

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">{displayName()} · the statement</div>
          <h1>Profit &amp; loss</h1>
        </div>
        <button className="export-btn" onClick={() => nav("/packet")} title="Banker's Packet — lender-ready">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          Packet
        </button>
      </div>

      {/* month pager */}
      <div className="pl-pager">
        <button className="pl-pgbtn" disabled={!prevM} onClick={() => prevM && setMonth(prevM)} aria-label="Previous month">‹</button>
        <span className="pl-month">{out.monthLabel}{out.isLatest && out.forecast ? " · in progress" : ""}</span>
        <button className="pl-pgbtn" disabled={!nextM} onClick={() => nextM && setMonth(nextM)} aria-label="Next month">›</button>
      </div>

      {/* the verdict line */}
      <Reveal i={0}>
        <section className="voice pl-voice">
          <div className="eyebrow on-dark">{out.monthLabel} so far</div>
          <div className="said">
            {out.net ? (
              <Written mode="letters" startDelay={150}
                text={out.net.amount >= 0
                  ? `You kept <em>${money(out.net.amount)}</em> of ${money(out.revenue.total)}.`
                  : `Spending outran revenue by <em>${money(-out.net.amount)}.</em>`} />
            ) : (
              <Written mode="letters" startDelay={150} text={`${money(out.revenue.total)} in — <em>expenses not connected yet.</em>`} />
            )}
          </div>
          <div className="micro">
            <div className="m"><div className="ml">revenue</div><div className="mv">{money(out.revenue.total)}</div></div>
            <div className="m"><div className="ml">expenses</div><div className="mv">{out.expensesAvailable ? money(out.expenses.total) : "—"}</div></div>
            <div className="m"><div className="ml">margin</div><div className="mv">{out.net ? `${out.net.marginPct.toFixed(0)}%` : "—"}</div></div>
          </div>
        </section>
      </Reveal>

      {/* revenue */}
      <div className="eyebrow">Revenue — by product</div>
      <Reveal i={1}>
        <article className="mcard open il-card pl-card">
          {out.revenue.lines.map((l) => <Line line={l} sign={1} key={l.name} />)}
          <div className="pl-total">
            <span>Total revenue</span>
            <Delta now={out.revenue.total} prev={out.revenue.prevTotal} />
            <b>{money(out.revenue.total)}</b>
          </div>
        </article>
      </Reveal>

      {/* expenses */}
      <div className="eyebrow">Expenses — by category</div>
      <Reveal i={2}>
        {out.expensesAvailable ? (
          <article className="mcard open il-card pl-card">
            {out.expenses.lines.length ? (
              <>
                {out.expenses.lines.map((l) => <Line line={l} sign={-1} key={l.name} />)}
                <div className="pl-total">
                  <span>Total expenses</span>
                  <Delta now={out.expenses.total} prev={out.expenses.prevTotal} />
                  <b>−{money(out.expenses.total)}</b>
                </div>
              </>
            ) : (
              <div className="mmean">No recorded expenses in {out.monthLabel}.</div>
            )}
          </article>
        ) : (
          <Awaiting title="Expenses" needs="your bank (Plaid) or an expense CSV"
            unlocks="The other half of the statement — categories, vendors, and true net by month." />
        )}
      </Reveal>

      {/* net */}
      {out.net && (
        <Reveal i={3}>
          <article className={`mcard open il-card pl-net ${out.net.amount >= 0 ? "pos" : "neg"}`}>
            <div className="pl-total pl-nettotal">
              <span>Net profit · {out.monthLabel}</span>
              <Delta now={out.net.amount} prev={out.net.prevAmount} />
              <Receipt math={netMath} title="the statement — the math">
                <b>{out.net.amount >= 0 ? "" : "−"}{money(Math.abs(out.net.amount))}</b>
              </Receipt>
            </div>
            <div className="il-row-sub">{out.net.marginPct.toFixed(1)}% of revenue kept{out.net.prevAmount !== null ? ` · last month you kept ${money(out.net.prevAmount)}` : ""}</div>
          </article>
        </Reveal>
      )}

      {/* forecast */}
      {out.forecast && (
        <>
          <div className="eyebrow">Where the month is heading</div>
          <Reveal i={4}>
            <article className="mcard open il-card">
              <div className="il-head"><span className="il-kick">month-end projection</span>
                <span className="pill lite-fc"><span className="dot" />{(out.forecast.share * 100).toFixed(0)}% of the month, by weight</span></div>
              <div className="mmean">
                Revenue is pacing to <b>{money(out.forecast.revLo)}–{money(out.forecast.revHi)}</b>
                {out.expensesAvailable && (
                  <> · after projected expenses of ~{money(out.forecast.expProj)}, net lands
                  around <b>{money(out.forecast.netLo)}–{money(out.forecast.netHi)}</b></>
                )}. A range, because ranges are the honest answer.
              </div>
              <div className="il-cite">weekday-weighted pace (your big days count for more) · band = your own ±{(out.forecast.cv * 100).toFixed(0)}% weekly swing · expenses projected at recorded burn rate</div>
            </article>
          </Reveal>
        </>
      )}

      <div className="il-cite" style={{ margin: "6px 4px 0" }}>{out.cite}</div>
    </div>
  );
}
