// Stock & Shipments — inventory cover computed against real ledger demand
// rates (same source as the newsvendor engine) + shipment triage with
// stall detection. Demo data tonight; Shopify stock + AfterShip/Shippo
// tracking plug in via Phase 2B. The "how to connect" lives in Power Up.

import { useEffect, useState } from "react";
import { displayName } from "../engine/persona";
import { useNavigate } from "react-router-dom";
import { OPS_ASSUMPTIONS, opsReport, type OpsOut } from "../engine/ops";
import { staffingPlan, type StaffDay } from "../engine/money";
import { money } from "../engine/tierMath";
import { dataMode } from "../engine/dataSource";
import { dayEconomics, setDayCost, type DayEconomics, type DayEconThin } from "../engine/dayEconomics";
import { Awaiting, Html, Receipt, Reveal } from "../components/ui";

// The working-day P&L — persona unit economics. Speaks the owner's unit
// (service day / job day / selling day), shows the real-day band against
// THEIR daily bar, and counts — never projects.
function DayEconCard() {
  const [de, setDe] = useState<DayEconomics | DayEconThin | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const load = () => dayEconomics().then(setDe).catch((e) => setDe({ ok: false, reason: String(e) }));
  useEffect(() => { load(); }, []);

  if (!de) return <article className="mcard open il-card"><div className="il-loading">▶ counting your days…</div></article>;
  if (!de.ok) {
    return (
      <article className="mcard open il-card awaiting">
        <div className="mmean">Day economics: {de.reason}.</div>
      </article>
    );
  }

  const lo = Math.min(de.p25, de.threshold) * 0.85;
  const hi = Math.max(de.p75, de.threshold) * 1.1;
  const X = (v: number) => `${Math.min(98, Math.max(1, ((v - lo) / (hi - lo || 1)) * 100))}%`;
  const mathBlock = {
    methodPlain: `I took your recent active days (real revenue days, not calendar days), read the p25–p75 band and the median, and counted how many clear the daily bar — ${de.thresholdIsDefault ? "a placeholder bar until you set your true daily cost" : "your own number"}. Counted, not projected.`,
    keyStatPlain: `Median ${de.unit}: ${money(de.median)} · band ${money(de.p25)}–${money(de.p75)} · ${de.pctClearing}% of days clear ${money(de.threshold)}.`,
    keyStatNotation: `percentiles over active days · clearing rate = #{day ≥ bar} / #days`,
    citation: { method: "working-day unit economics", source: "your ledger, recent active days" },
  };

  return (
    <article className="mcard open il-card">
      <div className="il-head"><span className="il-kick">the {de.unit} P&amp;L</span>
        <span className={`pill ${de.pctClearing >= 80 ? "lite-hi" : de.pctClearing >= 55 ? "lite-mod" : "lite-none"}`}>
          <span className="dot" />{de.activePerWeek} {de.unit.split(" ")[0]} days/wk</span></div>
      <div className="mmean">
        <Receipt math={mathBlock} title={`the ${de.unit} — the math`}><Html text={de.headline} /></Receipt>
      </div>
      <div className="de-band">
        <span className="de-fill" style={{ left: X(de.p25), right: `calc(100% - ${X(de.p75)})` }} />
        <span className="de-med" style={{ left: X(de.median) }} title={`median ${money(de.median)}`} />
        <span className="de-thr" style={{ left: X(de.threshold) }} title={`the bar: ${money(de.threshold)}`} />
      </div>
      <div className="de-legend">
        <span>p25 {money(de.p25)}</span>
        <span>median {money(de.median)}</span>
        <span>p75 {money(de.p75)}</span>
      </div>
      <div className="il-row-sub" style={{ marginTop: 8 }}>
        <span className="de-cost">
          <b style={{ color: "var(--ink)" }}>The bar</b> (what a day must clear):
          {editing ? (
            <>
              <input type="number" inputMode="decimal" value={draft} autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { setDayCost(parseFloat(draft)); setEditing(false); load(); } }} />
              <button className="dt-btn" onClick={() => { if (draft.trim()) { setDayCost(parseFloat(draft)); load(); } setEditing(false); }}>save</button>
            </>
          ) : (
            <button className="dt-btn" onClick={() => { setDraft(String(de.threshold)); setEditing(true); }}>
              {money(de.threshold)}{de.thresholdIsDefault ? " · placeholder — set yours" : " · your number"}
            </button>
          )}
        </span>
      </div>
      <div className="il-cite">{de.cite}</div>
    </article>
  );
}

const STATUS_LABEL: Record<string, string> = {
  delivered: "delivered", in_transit: "in transit", label_created: "label created",
};

export default function Ops() {
  const nav = useNavigate();
  const [out, setOut] = useState<OpsOut | null>(null);
  const [staff, setStaff] = useState<StaffDay[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const liveMode = dataMode() === "live";
  useEffect(() => {
    let on = true;
    if (!liveMode) opsReport().then((o) => on && setOut(o)).catch((e) => on && setErr(String(e)));
    staffingPlan().then((s) => on && setStaff(s)).catch(() => undefined);
    return () => { on = false; };
  }, [liveMode]);

  if (liveMode) {
    // Live business: inventory & shipments read stores you haven't connected.
    // Staffing DOES compute — it reads your real weekday rhythm.
    return (
      <div className="app">
        <div className="appbar">
          <div className="titleblock">
            <div className="kicker">{displayName()} · operations</div>
            <h1>Stock &amp; shipments</h1>
          </div>
          <div className="avatar">B</div>
        </div>
        <div className="eyebrow">Runs on data you haven't connected yet</div>
        <Reveal i={0}>
          <Awaiting title="Inventory — days of cover" needs="stock levels (inventory.csv or Shopify/Square stock)"
            unlocks="Days-of-cover against your real demand rate, reorder-by dates, and the cash trapped in overstock." />
        </Reveal>
        <Reveal i={1}>
          <Awaiting title="Shipments — stall triage" needs="tracking IDs (shipments.csv or your commerce platform)"
            unlocks="Stalled-shipment detection before the customer emails you." />
        </Reveal>
        {staff.length > 0 && (
          <>
            <div className="eyebrow">Staffing — computed from YOUR rhythm</div>
            <Reveal i={2}>
              <article className="mcard open il-card">
                <div className="mmean">
                  {staff.some((s) => s.people > 1)
                    ? <>Your week has a shape — staff it that way instead of evenly.</>
                    : <>Your week runs <b>fairly flat</b> so far — one person covers it. This sharpens as history builds.</>}
                </div>
                <div className="staff-grid">
                  {staff.map((s) => (
                    <div className={`staff-day ${s.people > 1 ? "busy" : ""}`} key={s.day}>
                      <span className="sd-name">{s.day}</span>
                      <span className="sd-bar"><span style={{ height: `${Math.min(100, s.factor * 62)}%` }} /></span>
                      <span className="sd-people">{"●".repeat(s.people)}</span>
                      {s.note && <span className="sd-note">{s.note}</span>}
                    </div>
                  ))}
                </div>
                <div className="il-cite">weekday factors from your connected data — live, not demo</div>
              </article>
            </Reveal>
          </>
        )}
        <div className="eyebrow">Your unit economics — computed from YOUR days</div>
        <Reveal i={3}><DayEconCard /></Reveal>
        <Reveal i={4}>
          <button className="packet-card" onClick={() => nav("/power")}>
            <div className="pc-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg>
            </div>
            <div className="pc-body">
              <div className="pc-title">Power up this screen</div>
              <div className="pc-sub">Drop in inventory.csv / shipments.csv — the exact shapes are listed there.</div>
            </div>
            <span className="pc-go">→</span>
          </button>
        </Reveal>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">{displayName()} · operations</div>
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

          <div className="eyebrow">Your unit economics — the working-day P&amp;L</div>
          <Reveal i={3}><DayEconCard /></Reveal>

          {staff.length > 0 && (
            <>
              <div className="eyebrow">Staffing — match people to your rhythm</div>
              <Reveal i={3}>
                <article className="mcard open il-card">
                  <div className="mmean">
                    {staff.some((s) => s.people > 1)
                      ? <>Your week has a shape — staff it that way instead of evenly.</>
                      : <>Your week runs <b>fairly flat</b> — one person covers it; use the quietest day for batch production.</>}
                  </div>
                  <div className="staff-grid">
                    {staff.map((s) => (
                      <div className={`staff-day ${s.people > 1 ? "busy" : ""}`} key={s.day}>
                        <span className="sd-name">{s.day}</span>
                        <span className="sd-bar"><span style={{ height: `${Math.min(100, s.factor * 62)}%` }} /></span>
                        <span className="sd-people">{"●".repeat(s.people)}</span>
                        {s.note && <span className="sd-note">{s.note}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="il-cite">weekday factors from your full ledger (same decomposition the false-alarm killer uses) · 2 people where a day runs ≥1.10× average — and if no day qualifies, it says so instead of inventing a rush</div>
                </article>
              </Reveal>
            </>
          )}

          <Reveal i={4}>
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
