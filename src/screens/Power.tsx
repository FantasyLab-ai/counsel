// Power Up — the activation checklist. What to connect, what each source
// unlocks, and the exact dataset shape you can drop in instead. This is the
// map from "empty app" to "full Counsel," honest about what's demo fuel
// today vs what arrives with connectors.

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
    title: "Reviews & reputation",
    connectors: "Google Business · Etsy reviews · Yelp",
    unlocks: "Rating trend with change-points (did something slip?), review-volume vs sales correlation",
    csv: "reviews.csv — date, rating, source, text_optional",
    status: "planned",
  },
];

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
