// Stock & Shipments — inventory cover computed against real ledger demand
// rates (same source as the newsvendor engine) + shipment triage with
// stall detection. Demo data tonight; Shopify stock + AfterShip/Shippo
// tracking plug in via Phase 2B. The "how to connect" lives in Power Up.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OPS_ASSUMPTIONS, opsReport, type OpsOut } from "../engine/ops";
import { money } from "../engine/tierMath";
import { Reveal } from "../components/ui";

const STATUS_LABEL: Record<string, string> = {
  delivered: "delivered", in_transit: "in transit", label_created: "label created",
};

export default function Ops() {
  const nav = useNavigate();
  const [out, setOut] = useState<OpsOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    opsReport().then((o) => on && setOut(o)).catch((e) => on && setErr(String(e)));
    return () => { on = false; };
  }, []);

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">Kiln &amp; Co. · operations</div>
          <h1>Stock &amp; shipments</h1>
        </div>
        <div className="avatar">B</div>
      </div>

      {err && <div className="reassure">Ops engine unavailable: {err}</div>}
      {!out && !err && <div className="il-loading">▶ reading inventory against your demand rates…</div>}

      {out && (
        <>
          <Reveal i={0}>
            <section className="voice">
              <div className="eyebrow on-dark">The operations read</div>
              <div className="said">
                {out.reorders > 0
                  ? <>Reorder <em>{out.inventory.find((i) => i.state === "reorder")?.name}</em> — the clock is real.</>
                  : <>Stock is <em>healthy</em> across the board.</>}
              </div>
              <div className="sub">
                {out.reorders} product{out.reorders === 1 ? "" : "s"} below the reorder line ·{" "}
                {out.stalled} shipment{out.stalled === 1 ? "" : "s"} stalled in transit ·{" "}
                {money(out.tiedUpTotal)} tied up in excess stock.
              </div>
              <div className="micro">
                <div className="m"><div className="ml">reorders due</div><div className="mv">{out.reorders}</div></div>
                <div className="m"><div className="ml">stalled</div><div className="mv">{out.stalled}</div></div>
                <div className="m"><div className="ml">excess cash</div><div className="mv">{money(out.tiedUpTotal)}</div></div>
              </div>
            </section>
          </Reveal>

          <div className="eyebrow">Inventory — cover vs your real demand rate</div>
          <Reveal i={1}>
            <article className="mcard open il-card">
              {out.inventory.map((r) => (
                <div className="inv-row" key={r.product}>
                  <div className="inv-head">
                    <span className="inv-name">{r.name}</span>
                    <span className={`pill lite-${r.state === "reorder" ? "none" : r.state === "overstocked" ? "mod" : "hi"}`}>
                      <span className="dot" />{r.state === "reorder" ? "reorder now" : r.state}
                    </span>
                  </div>
                  <div className="inv-bar">
                    <span className={`inv-fill ${r.state}`} style={{ width: `${Math.min(100, (r.daysCover / 60) * 100)}%` }} />
                    <span className="inv-lead" style={{ left: `${(16 / 60) * 100}%` }} title="lead-time line" />
                  </div>
                  <div className="inv-meta">
                    {r.onHand} on hand · ~{r.dailyRate.toFixed(1)}/day → <b>{r.daysCover >= 999 ? "∞" : Math.round(r.daysCover)} days of cover</b>
                    {r.reorderBy && <> · order by <b>{r.reorderBy}</b></>}
                    {r.incoming > 0 && <> · {r.incoming} incoming ({r.incomingEta})</>}
                    {r.tiedUp > 0 && <> · <b>{money(r.tiedUp)}</b> tied up beyond 45d</>}
                  </div>
                </div>
              ))}
              <div className="il-cite">{OPS_ASSUMPTIONS}</div>
            </article>
          </Reveal>

          <div className="eyebrow">Shipments — {out.shipments.length} recent</div>
          <Reveal i={2}>
            <article className="mcard open il-card">
              {out.shipments.filter((s) => s.stalled).map((s) => (
                <div className="ship-row stalled" key={s.id}>
                  <span className="wl-dot fired" />
                  <div className="ship-body">
                    <div className="ship-main"><b>Stalled {s.daysInTransit} days</b> — {s.carrier} to {s.dest}</div>
                    <div className="ship-sub">{s.tracking} · shipped {s.shipped} · worth a carrier ticket + a heads-up to the customer</div>
                  </div>
                </div>
              ))}
              {out.shipments.filter((s) => !s.stalled).slice(0, 8).map((s) => (
                <div className="ship-row" key={s.id}>
                  <span className={`ship-dot ${s.status}`} />
                  <div className="ship-body">
                    <div className="ship-main">{s.carrier} · {s.dest} <span className="ship-status">{STATUS_LABEL[s.status]}</span></div>
                    <div className="ship-sub">{s.tracking} · shipped {s.shipped}</div>
                  </div>
                </div>
              ))}
              <div className="il-cite">tracking IDs come from your commerce platform automatically once connected — or paste them per order · live carrier scans via a tracking service (AfterShip/Shippo) in the connector phase</div>
            </article>
          </Reveal>

          <Reveal i={3}>
            <button className="packet-card" onClick={() => nav("/power")}>
              <div className="pc-ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg>
              </div>
              <div className="pc-body">
                <div className="pc-title">Power up Counsel</div>
                <div className="pc-sub">The checklist: what to connect, what each source unlocks, and the exact files you can drop in.</div>
              </div>
              <span className="pc-go">→</span>
            </button>
          </Reveal>
        </>
      )}
    </div>
  );
}
