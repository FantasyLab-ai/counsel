// The Ledger — the ground truth, listed. Every transaction Counsel consumes,
// all sources in one stream: the flagged rows pinned with their reasons (and
// the claims they feed), then the full record, each row expandable to its
// details. "Find one claim you disagree with and trace it back to the rows"
// happens HERE.

import { useEffect, useState } from "react";
import { displayName } from "../engine/persona";
import { dataBasis, type DataBasis } from "../engine/dataBasis";
import { ledgerView, type LedgerViewOut, type LedgerViewThin, type TxRow } from "../engine/ledgerView";
import { money } from "../engine/tierMath";
import { Awaiting, FinanceSegs, Reveal, Skeleton } from "../components/ui";

const PAGE = 60;

function Row({ r, pinnedStyle }: { r: TxRow; pinnedStyle?: boolean }) {
  const [open, setOpen] = useState(false);
  const d = new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <div className={`lg-line ${open ? "open" : ""} ${pinnedStyle ? "pin" : ""}`}>
      <button className="lg-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="lg-date">{d}</span>
        <span className={`lg-src ${r.kind}`}>{r.source}</span>
        <span className="lg-label">{r.label}</span>
        <span className={`lg-amt ${r.kind}`}>{r.kind === "expense" ? "−" : ""}{money(r.amount)}</span>
        <span className={`lg-chev ${open ? "open" : ""}`} aria-hidden="true">›</span>
      </button>
      {pinnedStyle && !open && r.flags[0] && (
        <div className="lg-flag-teaser">◆ {r.flags[0].reason.split("·")[0].trim()}</div>
      )}
      {open && (
        <div className="lg-detail">
          {r.flags.map((f) => (
            <div className="lg-flag" key={f.code}>◆ {f.reason}</div>
          ))}
          <div className="lg-grid">
            <span className="k">date</span><span className="v">{r.date}</span>
            <span className="k">type</span><span className="v">{r.kind}</span>
            <span className="k">{r.kind === "sale" ? "channel" : "category"}</span><span className="v">{r.source}</span>
            {r.qty != null && (<><span className="k">quantity</span><span className="v">{r.qty}</span></>)}
            {r.price != null && (<><span className="k">unit price</span><span className="v">{money(r.price)}</span></>)}
            {r.fee != null && r.fee > 0 && (<><span className="k">fee</span><span className="v">{money(r.fee)}</span></>)}
            {r.customer && (<><span className="k">customer</span><span className="v">{r.customer}</span></>)}
            <span className="k">amount</span><span className="v"><b>{money(r.amount)}</b></span>
          </div>
          {r.context && <div className="lg-context">{r.context}</div>}
        </div>
      )}
    </div>
  );
}

export default function Ledger() {
  const [out, setOut] = useState<LedgerViewOut | LedgerViewThin | null>(null);
  const [basis, setBasis] = useState<DataBasis | null>(null);
  const [filter, setFilter] = useState<"all" | "sale" | "expense">("all");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let on = true;
    ledgerView().then((o) => on && setOut(o)).catch((e) => on && setOut({ ok: false, reason: String(e) }));
    dataBasis().then((b) => on && setBasis(b)).catch(() => undefined);
    return () => { on = false; };
  }, []);

  if (!out) {
    return (
      <div className="app">
        <div className="appbar"><div className="titleblock"><div className="kicker">{displayName()}</div><h1>The ledger</h1></div></div>
        <FinanceSegs />
        <Skeleton lines={5} caption="listing every row on file…" />
      </div>
    );
  }
  if (!out.ok) {
    return (
      <div className="app">
        <div className="appbar"><div className="titleblock"><div className="kicker">{displayName()}</div><h1>The ledger</h1></div></div>
        <FinanceSegs />
        <Awaiting title="The ledger" needs="sales data (connect a source or drop a CSV)"
          unlocks="Every transaction listed with its source — the rows every claim traces back to." />
      </div>
    );
  }

  const pinned = out.pinned.filter((r) => filter === "all" || r.kind === filter);
  const rows = out.rows.filter((r) => filter === "all" || r.kind === filter);
  const visible = rows.slice(0, shown);

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">{displayName()} · the ground truth</div>
          <h1>The ledger</h1>
        </div>
        <div className="avatar">{displayName()[0]}</div>
      </div>

      <Reveal i={0}>
        <section className="voice">
          <div className="eyebrow on-dark">Every row every claim stands on</div>
          <div className="said">
            {out.pinned.length
              ? <>{out.pinned.length} rows <em>want your eyes.</em></>
              : <>Nothing egregious <em>on file.</em></>}
          </div>
          <div className="sub">
            {out.saleCount.toLocaleString()} sales and {out.expenseCount.toLocaleString()} expenses, all sources
            in one stream. Flags follow visible rules, and every flag names the claim it feeds — this is where
            “trace it back to the rows” happens.
          </div>
          <div className="micro">
            <div className="m"><div className="ml">sales on file</div><div className="mv">{money(out.saleTotal)}</div></div>
            <div className="m"><div className="ml">expenses on file</div><div className="mv">{money(out.expenseTotal)}</div></div>
            <div className="m"><div className="ml">pinned</div><div className="mv">{out.pinned.length}</div></div>
          </div>
        </section>
      </Reveal>

      {basis && (
        <div className="basis-strip" style={{ marginTop: 14 }}>
          <span className="basis-k">this stream</span>
          <span className="basis-v">{basis.line}</span>
        </div>
      )}

      <div className="dt-days" style={{ marginTop: 14 }} role="tablist" aria-label="Filter rows">
        {(["all", "sale", "expense"] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f}
            className={`seg ${filter === f ? "on" : ""}`}
            onClick={() => { setFilter(f); setShown(PAGE); }}>
            {f === "all" ? "everything" : f === "sale" ? "sales" : "expenses"}
          </button>
        ))}
      </div>

      {pinned.length > 0 && (
        <>
          <div className="eyebrow">Pinned · flagged by visible rules</div>
          <Reveal i={1}>
            <article className="mcard open il-card lg-card">
              {pinned.map((r) => <Row r={r} pinnedStyle key={r.id} />)}
            </article>
          </Reveal>
        </>
      )}

      <div className="eyebrow">The record · newest first</div>
      <Reveal i={2}>
        <article className="mcard open il-card lg-card">
          {visible.map((r) => <Row r={r} key={r.id} />)}
          {rows.length > shown && (
            <button className="dbtn lg-more" onClick={() => setShown(shown + PAGE)}>
              show {Math.min(PAGE, rows.length - shown)} more of {(rows.length - shown).toLocaleString()}
            </button>
          )}
        </article>
      </Reveal>

      <div className="il-cite" style={{ margin: "8px 4px 0" }}>{out.cite}</div>
    </div>
  );
}
