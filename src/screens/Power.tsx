// Power Up — the activation checklist. What to connect, what each source
// unlocks, and the exact dataset shape you can drop in instead — INCLUDING a
// real on-device CSV drop-in: the file is parsed in this page, stored on this
// device, never uploaded, and every engine recomputes on it.

import { useRef, useState } from "react";
import { parseCharges, parseExpenses, parsePosts } from "../engine/csvParse";
import { clearUserData, hasUserData, storeUserData, userMeta } from "../engine/dataSource";
import { addPostsBulk } from "../engine/socialMath";
import { getPersona, PERSONA_GROUPS, PERSONAS, setPersona } from "../engine/persona";
import { Reveal } from "../components/ui";

interface PowerItem {
  title: string;
  connectors: string;
  unlocks: string;
  csv: string; // the drop-in schema
  status: "demo" | "planned";
}

const ITEMS: PowerItem[] = [
  {
    title: "Payments",
    connectors: "Stripe · Square · PayPal",
    unlocks: "Revenue brief, change-points, forecasts, price power (A1), counterfactuals (A4), runway sims (C8), seasonality (C9)",
    csv: "charges.csv — date, amount, product, qty, unit_price, customer_id, fee",
    status: "demo",
  },
  {
    title: "Orders & customers",
    connectors: "Shopify · Etsy · Square",
    unlocks: "Repeat-rate, customers-at-risk (A2), channel attribution, restock math (A3)",
    csv: "orders.csv — date, order_id, customer_id, product, qty, channel",
    status: "demo",
  },
  {
    title: "Expenses & bank",
    connectors: "Plaid (any bank) · QuickBooks · Xero",
    unlocks: "The audit (B5): duplicates, subscription creep, fee drift · true burn for runway · margin without guessing",
    csv: "expenses.csv — date, vendor, amount, category",
    status: "demo",
  },
  {
    title: "Inventory",
    connectors: "Shopify stock levels · Square for Retail",
    unlocks: "Days-of-cover, reorder-by dates, overstock cash (Stock & Shipments)",
    csv: "inventory.csv — product, on_hand, incoming, incoming_eta",
    status: "demo",
  },
  {
    title: "Shipping & tracking",
    connectors: "AfterShip · Shippo · carrier APIs (USPS/UPS/FedEx)",
    unlocks: "Stall detection, delivery-time truth, exception alerts before the customer emails you",
    csv: "shipments.csv — order_id, carrier, tracking_id, shipped_date",
    status: "planned",
  },
  {
    title: "Invoices (wholesale & services)",
    connectors: "Stripe Invoicing · QuickBooks · FreshBooks",
    unlocks: "AR aging on the Money screen — who owes you, how late, the chase order, your DSO",
    csv: "invoices.csv — issued, due, amount, client, paid_date",
    status: "demo",
  },
  {
    title: "Social & marketing",
    connectors: "No API needed — UTM links + the post log (official APIs later, optional)",
    unlocks: "Channel attribution, post-lift event studies, tracked links (Marketing screen)",
    csv: "posts.csv — date, platform, label (or any analytics export with a date column)",
    status: "demo",
  },
  {
    title: "Reviews & reputation",
    connectors: "Google Business · Etsy reviews · Yelp",
    unlocks: "Rating trend with change-points (did something slip?), review-volume vs sales correlation",
    csv: "reviews.csv — date, rating, source, text_optional",
    status: "planned",
  },
];

function PersonaStrip() {
  const [p, setP] = useState(getPersona() ?? PERSONAS[PERSONAS.length - 1]);
  return (
    <article className="mcard open il-card">
      <div className="il-head">
        <span className="il-kick">{p.icon} {p.label}</span>
        <span className="pill lite-mod"><span className="dot" />start with: {p.firstConnect}</span>
      </div>
      <ol className="ps-steps">
        {p.quickStart.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <div className="ps-switch">
        <label className="pw-csv-lbl" htmlFor="personaSel">line of work</label>
        <select id="personaSel" className="ps-select" value={p.id}
          onChange={(e) => { setPersona(e.target.value); setP(PERSONAS.find((x) => x.id === e.target.value)!); }}>
          {PERSONA_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {PERSONAS.filter((x) => x.group === g).map((x) => (
                <option key={x.id} value={x.id}>{x.icon} {x.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </article>
  );
}

function DropIn() {
  const chargesRef = useRef<HTMLInputElement>(null);
  const expensesRef = useRef<HTMLInputElement>(null);
  const postsRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [active, setActive] = useState(hasUserData());
  const meta = userMeta();

  async function onFile(kind: "charges" | "expenses" | "posts", file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      if (kind === "posts") {
        const res = parsePosts(text);
        if (res.error) { setStatus({ ok: false, msg: res.error }); return; }
        const n = addPostsBulk(res.rows);
        setStatus({ ok: true, msg: `${n} posts imported from ${file.name} — opening Marketing…` });
        setTimeout(() => window.location.assign("/marketing"), 900);
        return;
      }
      const res = kind === "charges" ? parseCharges(text) : parseExpenses(text);
      if (res.error) { setStatus({ ok: false, msg: res.error }); return; }
      if (!res.rows.length) { setStatus({ ok: false, msg: "no usable rows found" }); return; }
      if (kind === "charges") storeUserData(res.rows as never, null, file.name);
      else storeUserData(null, res.rows as never, file.name);
      setActive(true);
      setStatus({
        ok: true,
        msg: `${res.rows.length} rows from ${file.name}${res.skipped ? ` (${res.skipped} skipped)` : ""} — reloading on your data…`,
      });
      setTimeout(() => window.location.assign("/insights"), 900);
    } catch (e) {
      setStatus({ ok: false, msg: String(e instanceof Error ? e.message : e) });
    }
  }

  return (
    <article className="mcard open il-card dropin">
      <div className="il-head">
        <span className="il-kick">Use YOUR data — right now</span>
        <span className={`pill ${active ? "lite-hi" : "lite-fc"}`}><span className="dot" />
          {active ? `your data active${meta ? ` · ${meta.name}` : ""}` : "on-device · never uploaded"}
        </span>
      </div>
      <div className="mmean">
        Drop a CSV and every engine recomputes on your business — parsed <b>on this
        device</b>, stored <b>on this device</b>, never uploaded. Sales/charges
        need just <code>date</code> + <code>amount</code> (product, qty,
        unit_price, customer_id, fee unlock more engines).
      </div>
      <div className="dropin-row">
        <button className="dbtn primary" onClick={() => chargesRef.current?.click()}>Load sales CSV</button>
        <button className="dbtn" onClick={() => expensesRef.current?.click()}>Load expenses CSV</button>
        <button className="dbtn" onClick={() => postsRef.current?.click()}>Load posts CSV</button>
        {active && (
          <button className="dbtn" onClick={() => { clearUserData(); setActive(false); setStatus({ ok: true, msg: "back to the demo ledger — reload any screen" }); }}>
            Reset to demo
          </button>
        )}
      </div>
      <input ref={chargesRef} type="file" accept=".csv,text/csv" hidden
             onChange={(e) => onFile("charges", e.target.files?.[0])} />
      <input ref={expensesRef} type="file" accept=".csv,text/csv" hidden
             onChange={(e) => onFile("expenses", e.target.files?.[0])} />
      <input ref={postsRef} type="file" accept=".csv,text/csv" hidden
             onChange={(e) => onFile("posts", e.target.files?.[0])} />
      {status && <div className={`dropin-status ${status.ok ? "ok" : "err"}`}>{status.msg}</div>}
      <div className="il-cite">
        works with bank exports, Etsy/Shopify order exports, or any spreadsheet saved as CSV ·
        money baselines (margin, cash on hand) stay demo until expenses/bank data is loaded — cards say which is which
      </div>
    </article>
  );
}

export default function Power() {
  const fueled = ITEMS.filter((i) => i.status === "demo").length;
  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">the activation map</div>
          <h1>Power up Counsel</h1>
        </div>
        <div className="avatar">B</div>
      </div>

      <Reveal i={0}>
        <section className="voice">
          <div className="eyebrow on-dark">Where you stand</div>
          <div className="said">{fueled} of {ITEMS.length} sources fueled — <em>with demo data.</em></div>
          <div className="sub">
            Everything below runs today on the Kiln &amp; Co. demo ledger so you can feel the product.
            Connect a real source (or drop in a file with the exact shape shown) and the same
            engines light up on your business.
          </div>
          <div className="pw-progress"><span style={{ width: `${(fueled / ITEMS.length) * 100}%` }} /></div>
        </section>
      </Reveal>

      <div className="eyebrow">Your setup path</div>
      <Reveal i={1}><PersonaStrip /></Reveal>

      <div className="eyebrow">Drop a file — computed on this device</div>
      <Reveal i={2}><DropIn /></Reveal>

      <div className="eyebrow">Connect these — or drop the file</div>
      {ITEMS.map((it, i) => (
        <Reveal i={i + 1} key={it.title}>
          <article className="mcard open il-card">
            <div className="il-head">
              <span className="il-kick">{it.title}</span>
              <span className={`pill ${it.status === "demo" ? "lite-mod" : "lite-none"}`}>
                <span className="dot" />{it.status === "demo" ? "demo fuel · connect to go live" : "arrives with connectors"}
              </span>
            </div>
            <div className="pw-connectors">{it.connectors}</div>
            <div className="il-row-sub" style={{ marginTop: 6 }}><b style={{ color: "var(--ink)" }}>Unlocks:</b> {it.unlocks}</div>
            <div className="pw-csv">
              <span className="pw-csv-lbl">or drop in</span>
              <code>{it.csv}</code>
            </div>
          </article>
        </Reveal>
      ))}

      <Reveal i={ITEMS.length + 1}>
        <div className="reassure">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          Connections are read-only and revocable. File drop-in lands with the connector phase —
          the schemas above are exactly what the engines consume, so a spreadsheet export works.
        </div>
      </Reveal>
    </div>
  );
}
