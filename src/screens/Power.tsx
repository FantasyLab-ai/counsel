// Power Up — the activation checklist. What to connect, what each source
// unlocks, and the exact dataset shape you can drop in instead — INCLUDING a
// real on-device CSV drop-in: the file is parsed in this page, stored on this
// device, never uploaded, and every engine recomputes on it.

import { useEffect, useRef, useState } from "react";
import { parseCharges, parseExpenses, parsePosts } from "../engine/csvParse";
import { clearUserData, hasUserData, storeUserData, userCharges, userExpenses, userMeta } from "../engine/dataSource";
import { addPostsBulk } from "../engine/socialMath";
import { displayName, getPersona, PERSONA_GROUPS, PERSONAS, setPersona } from "../engine/persona";
import {
  clearHistory, cloudStatus, connectBank, connectProvider, disconnectProvider, seedHistory, setPulse, syncNow,
  type CloudProvider,
} from "../engine/cloudSync";
import { BackBtn, Reveal } from "../components/ui";

// A provider you can actually open right now. `url` is the stable sign-in /
// dashboard root (deep links rot); `where` is the breadcrumb to the export.
// This is the honest wedge: no OAuth yet, but the export path works TODAY.
interface Provider {
  name: string;
  url: string;
  where: string;
}

interface PowerItem {
  title: string;
  providers: Provider[];
  unlocks: string;
  csv: string; // the drop-in schema
  status: "demo" | "planned";
}

const ITEMS: PowerItem[] = [
  {
    title: "Payments",
    providers: [
      { name: "Stripe", url: "https://dashboard.stripe.com/login", where: "Payments → Export → CSV" },
      { name: "Square", url: "https://squareup.com/login", where: "Reports → Transactions → Export" },
      { name: "PayPal", url: "https://www.paypal.com/signin", where: "Activity → Download → CSV" },
    ],
    unlocks: "Revenue brief, change-points, forecasts, price power (A1), counterfactuals (A4), runway sims (C8), seasonality (C9)",
    csv: "charges.csv — date, amount, product, qty, unit_price, customer_id, fee",
    status: "demo",
  },
  {
    title: "Orders & customers",
    providers: [
      { name: "Shopify", url: "https://admin.shopify.com", where: "Orders → Export → Plain CSV" },
      { name: "Etsy", url: "https://www.etsy.com/your/shops/me/dashboard", where: "Settings → Options → Download Data" },
      { name: "Square", url: "https://squareup.com/login", where: "Reports → Item Sales → Export" },
    ],
    unlocks: "Repeat-rate, customers-at-risk (A2), channel attribution, restock math (A3)",
    csv: "orders.csv — date, order_id, customer_id, product, qty, channel",
    status: "demo",
  },
  {
    title: "Expenses & bank",
    providers: [
      { name: "QuickBooks", url: "https://app.qbo.intuit.com", where: "Reports → Expenses → Export" },
      { name: "Xero", url: "https://go.xero.com", where: "Accounting → Reports → Export" },
      { name: "Your bank", url: "", where: "most banks: Statements → Download → CSV" },
    ],
    unlocks: "The audit (B5): duplicates, subscription creep, fee drift · true burn for runway · margin without guessing",
    csv: "expenses.csv — date, vendor, amount, category",
    status: "demo",
  },
  {
    title: "Inventory",
    providers: [
      { name: "Shopify", url: "https://admin.shopify.com", where: "Products → Inventory → Export" },
      { name: "Square", url: "https://squareup.com/login", where: "Items → Inventory → Export" },
    ],
    unlocks: "Days-of-cover, reorder-by dates, overstock cash (Stock & Shipments)",
    csv: "inventory.csv — product, on_hand, incoming, incoming_eta",
    status: "demo",
  },
  {
    title: "Shipping & tracking",
    providers: [
      { name: "AfterShip", url: "https://admin.aftership.com", where: "Shipments → Export" },
      { name: "Shippo", url: "https://apps.goshippo.com", where: "Shipments → Export CSV" },
    ],
    unlocks: "Stall detection, delivery-time truth, exception alerts before the customer emails you",
    csv: "shipments.csv — order_id, carrier, tracking_id, shipped_date",
    status: "planned",
  },
  {
    title: "Invoices (wholesale & services)",
    providers: [
      { name: "Stripe Invoicing", url: "https://dashboard.stripe.com/login", where: "Invoices → Export" },
      { name: "QuickBooks", url: "https://app.qbo.intuit.com", where: "Sales → Invoices → Export" },
      { name: "FreshBooks", url: "https://my.freshbooks.com", where: "Invoices → Export → CSV" },
    ],
    unlocks: "AR aging on the Money screen — who owes you, how late, the chase order, your DSO",
    csv: "invoices.csv — issued, due, amount, client, paid_date",
    status: "demo",
  },
  {
    title: "Social & marketing",
    providers: [
      { name: "Meta Business Suite", url: "https://business.facebook.com", where: "Insights → Export (optional)" },
      { name: "No API needed", url: "", where: "the post log + UTM links on Marketing already work" },
    ],
    unlocks: "Channel attribution, post-lift event studies, tracked links (Marketing screen)",
    csv: "posts.csv — date, platform, label (or any analytics export with a date column)",
    status: "demo",
  },
  {
    title: "Reviews & reputation",
    providers: [
      { name: "Google Business", url: "https://business.google.com", where: "Reviews → (export via Takeout)" },
      { name: "Yelp for Business", url: "https://biz.yelp.com", where: "Reviews → Export" },
    ],
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

// LiveConnect — paste a key you mint in YOUR dashboard (read-only), sync,
// and the engines run on live API data. No OAuth app approvals needed:
// Stripe restricted keys, Square access tokens, and Shopify custom-app
// tokens are all self-serve for the merchant.
const LIVE_HELP: Record<CloudProvider, { hint: string; mint: string; url: string }> = {
  stripe: {
    hint: "rk_live_… restricted key (or sk_test_… in test mode)",
    mint: "Dashboard → Developers → API keys → Create restricted key → read on Charges (+ Balance for fees)",
    url: "https://dashboard.stripe.com/apikeys",
  },
  square: {
    hint: "access token from your own Square app",
    mint: "developer.squareup.com → your app → Production → Access token (read-only scopes)",
    url: "https://developer.squareup.com/apps",
  },
  shopify: {
    hint: "custom-app Admin token (shpat_…) + your shop name",
    mint: "Admin → Settings → Apps → Develop apps → Create app → scope read_orders → install → reveal token",
    url: "https://admin.shopify.com",
  },
  plaid: {
    hint: "no key needed — you sign into your bank in Plaid's own window",
    mint: "sandbox test bank: pick any bank, login user_good / pass_good",
    url: "",
  },
};

function LiveConnect() {
  const [provider, setProvider] = useState<CloudProvider>("stripe");
  const [key, setKey] = useState("");
  const [shop, setShop] = useState("");
  const [sqEnv, setSqEnv] = useState<"production" | "sandbox">("production");
  const [connected, setConnected] = useState<CloudProvider[]>([]);
  const [pulse, setPulseState] = useState(false);
  const [backfill, setBackfill] = useState<{ c: number; e: number; days: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const help = LIVE_HELP[provider];

  useEffect(() => {
    cloudStatus().then((s) => { setConnected(s.providers); setPulseState(s.pulse); setBackfill(s.backfill); }).catch(() => undefined);
  }, []);

  async function doConnect() {
    setStatus(null);
    if (provider === "plaid") {
      setBusy("opening Plaid Link…");
      try {
        const ok = await connectBank();
        if (ok) {
          setConnected((await cloudStatus()).providers);
          setStatus({ ok: true, msg: "bank connected via Plaid — pulling your transactions…" });
          setTimeout(doSync, 800);
        } else {
          setStatus({ ok: true, msg: "bank picker closed — nothing connected." });
        }
      } catch (e) {
        setStatus({ ok: false, msg: String(e instanceof Error ? e.message : e) });
      } finally {
        setBusy(null);
      }
      return;
    }
    setBusy("validating with the provider…");
    try {
      const creds = provider === "stripe" ? { key: key.trim() }
        : provider === "square" ? { token: key.trim(), env: sqEnv }
        : { shop: shop.trim(), token: key.trim() };
      await connectProvider(provider, creds);
      setConnected((await cloudStatus()).providers);
      setKey("");
      setStatus({ ok: true, msg: `${provider} connected — key verified read-only and encrypted. Now tap Sync.` });
    } catch (e) {
      setStatus({ ok: false, msg: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(null);
    }
  }

  async function togglePulse() {
    setBusy(pulse ? "stopping the pulse…" : "starting the pulse (seeding a burst)…");
    setStatus(null);
    try {
      const seeded = await setPulse(!pulse);
      setPulseState(!pulse);
      const detail = Object.entries(seeded).map(([k, v]) => `${k}: ${v}`).join(", ");
      const seededAny = Object.values(seeded).some((n) => n > 0);
      setStatus({
        ok: true,
        msg: !pulse
          ? `pulse on — seeded ${detail || "0 (connect a test/sandbox key first)"} now; 1–3 more land every 30 min.${seededAny ? " Auto-syncing…" : ""}`
          : "pulse off — no more fake sales.",
      });
      if (!pulse && seededAny) setTimeout(doSync, 1500); // pull the burst without a second tap
    } catch (e) {
      setStatus({ ok: false, msg: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(null);
    }
  }

  async function doSync() {
    setBusy("pulling every connected source…");
    setStatus(null);
    try {
      const r = await syncNow();
      if (r.rows === 0 && r.expenseRows === 0) {
        setStatus({ ok: false, msg: `connected, but nothing came back${r.errors ? ` (${Object.values(r.errors)[0]})` : " — fresh bank connections take ~30s to prepare; try Sync again"}` });
      } else {
        const perPipe = Object.entries(r.pulled)
          .map(([k, v]) => `${k === "plaid" ? "bank" : k} ${v}`)
          .join(" + ");
        const bits = [
          `${r.rows} sales rows`,
          r.expenseRows ? `${r.expenseRows} expense rows` : null,
          r.seeded ? "seeded history underneath" : null,
        ].filter(Boolean).join(" · ");
        setStatus({
          ok: true,
          msg: `one ledger, every pipe: ${perPipe || "seeded history"} → ${bits}${r.errors ? ` · note: ${Object.entries(r.errors).map(([k, e]) => `${k}: ${e}`).join("; ")}` : ""} — opening Insights…`,
        });
        setTimeout(() => window.location.assign("/insights"), 1600);
      }
    } catch (e) {
      setStatus({ ok: false, msg: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="mcard open il-card dropin">
      <div className="il-head">
        <span className="il-kick">Go live — sync from the API</span>
        <span className={`pill ${connected.length ? "lite-hi" : "lite-fc"}`}><span className="dot" />
          {connected.length ? `connected: ${connected.join(" · ")}` : "beta · no OAuth needed"}
        </span>
      </div>
      <div className="mmean">
        <b>One business, many pipes.</b> Connect each tool once — a single sync then pulls them
        ALL together: sales from every register merge into one ledger, the bank feeds expenses,
        and every engine reads the whole picture. Keys are encrypted server-side; your data is a
        pass-through, stored <b>only on this device</b>.
      </div>
      {connected.length > 0 && (
        <div className="pipes-row">
          <div className="pipes">
            {connected.map((p) => (
              <span className="pipe-chip" key={p}>● {p === "plaid" ? "bank" : p}</span>
            ))}
          </div>
          <button className="dbtn primary" disabled={!!busy} onClick={doSync}>
            Sync everything
          </button>
        </div>
      )}
      <div className="pw-csv-lbl" style={{ marginTop: connected.length ? 14 : 0 }}>add a source</div>
      <div className="lc-form">
        <select className="ps-select" value={provider} aria-label="Provider"
          onChange={(e) => { setProvider(e.target.value as CloudProvider); setStatus(null); }}>
          <option value="stripe">Stripe</option>
          <option value="square">Square</option>
          <option value="shopify">Shopify</option>
          <option value="plaid">Bank — expenses (Plaid)</option>
        </select>
        {provider === "shopify" && (
          <input className="dt-input" placeholder="your-shop (from your-shop.myshopify.com)"
            value={shop} onChange={(e) => setShop(e.target.value)} autoComplete="off" />
        )}
        {provider === "square" && (
          <select className="ps-select" value={sqEnv} aria-label="Square environment"
            onChange={(e) => setSqEnv(e.target.value as "production" | "sandbox")}>
            <option value="production">Production (real business)</option>
            <option value="sandbox">Sandbox (developer testing)</option>
          </select>
        )}
        {provider !== "plaid" && (
          <input className="dt-input" type="password" placeholder={help.hint}
            value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        )}
        <div className="lc-mint">
          <b>{provider === "plaid" ? "How it works:" : "Where to mint it:"}</b> {help.mint}
          {help.url && <> <a href={help.url} target="_blank" rel="noopener noreferrer">open ↗</a></>}
        </div>
      </div>
      <div className="dropin-row">
        <button className="dbtn primary"
          disabled={!!busy || (provider !== "plaid" && !key.trim()) || (provider === "shopify" && !shop.trim())}
          onClick={doConnect}>
          {provider === "plaid"
            ? (connected.includes("plaid") ? "Reconnect a bank" : "Open the bank picker")
            : `${connected.includes(provider) ? "Reconnect" : "Connect"} ${provider}`}
        </button>
        {!connected.length && (
          <button className="dbtn" disabled={!!busy} onClick={doSync}>Sync now</button>
        )}
        {connected.includes(provider) && (
          <button className="dbtn" disabled={!!busy}
            onClick={async () => { await disconnectProvider(provider).catch(() => undefined); setConnected((await cloudStatus().catch(() => ({ providers: [] as CloudProvider[], pulse: false }))).providers); setStatus({ ok: true, msg: `${provider} disconnected — its token was deleted server-side.` }); }}>
            Disconnect
          </button>
        )}
      </div>
      {connected.length > 0 && (
        <div className="pulse-row">
          <div className="pulse-txt">
            <b>Demo pulse</b> — fake sales land every 30 min so you can watch the system change.
            Test/sandbox keys only; live accounts are never written to.
          </div>
          <button className={`dbtn ${pulse ? "primary" : ""}`} disabled={!!busy} onClick={togglePulse}>
            {pulse ? "◉ on" : "○ off"}
          </button>
        </div>
      )}
      {connected.length > 0 && (
        <div className="pulse-row">
          <div className="pulse-txt">
            <b>Seeded history</b> — {backfill
              ? `${backfill.days} days in the vault (${backfill.c} sales · ${backfill.e} expenses, findings planted for the engines to catch). Every sync returns history + your live pulse.`
              : "instantly give this test account ~90 days of realistic sales AND expenses — with planted findings (a price change, a spike day, a duplicate charge, a creeping subscription) for the engines to catch. Test/sandbox only."}
          </div>
          {backfill ? (
            <button className="dbtn" disabled={!!busy} onClick={async () => {
              setBusy("removing history…");
              try { await clearHistory(); setBackfill(null); setStatus({ ok: true, msg: "seeded history removed — next sync returns only live rows." }); }
              catch (e) { setStatus({ ok: false, msg: String(e instanceof Error ? e.message : e) }); }
              finally { setBusy(null); }
            }}>remove</button>
          ) : (
            <button className="dbtn primary" disabled={!!busy} onClick={async () => {
              setBusy("seeding 90 days…");
              try {
                const r = await seedHistory(90);
                setBackfill({ c: r.charges, e: r.expenses, days: 90 });
                setStatus({ ok: true, msg: `${r.charges} sales + ${r.expenses} expenses seeded — auto-syncing…` });
                setTimeout(doSync, 900);
              } catch (e) { setStatus({ ok: false, msg: String(e instanceof Error ? e.message : e) }); }
              finally { setBusy(null); }
            }}>seed 90d</button>
          )}
        </div>
      )}
      {busy && <div className="dropin-status ok">{busy}</div>}
      {status && <div className={`dropin-status ${status.ok ? "ok" : "err"}`}>{status.msg}</div>}
      <div className="il-cite">
        read-only keys only — Counsel can never move money · disconnect deletes the token server-side ·
        one-tap OAuth arrives with the registered apps (see PLATFORMS.md)
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
  // Honest status: count only what's REALLY yours, never demo fixtures.
  const mine = [
    { label: "sales", on: !!userCharges() },
    { label: "expenses", on: !!userExpenses() },
  ];
  const live = mine.filter((m) => m.on).length;
  const meta = userMeta();

  return (
    <div className="app">
      <div className="appbar">
        <BackBtn />
        <div className="titleblock">
          <div className="kicker">the activation map</div>
          <h1>Power up Counsel</h1>
        </div>
        <div className="avatar">{displayName()[0]}</div>
      </div>

      <Reveal i={0}>
        <section className="voice">
          <div className="eyebrow on-dark">Where you stand</div>
          <div className="said">
            {live === 0
              ? <>You're reading a <em>demo ledger.</em></>
              : live < mine.length
                ? <>Your <em>{mine.find((m) => m.on)!.label}</em> are live.</>
                : <>Running fully on <em>your numbers.</em></>}
          </div>
          <div className="sub">
            {live === 0 ? (
              <>Every source below already runs on demo data so you can feel the product — that's
                <b> demo fuel</b>, not your business. Tap any provider to open it and export your
                file, then drop it in below. It's parsed on this device and never uploaded.</>
            ) : (
              <>Loaded from <b>{meta?.name ?? "your file"}</b>. Add the missing piece below and more
                engines light up — every drop-in stays on this device.</>
            )}
          </div>
          <div className="pw-ladder">
            {mine.map((m) => (
              <span className={`pw-rung ${m.on ? "on" : ""}`} key={m.label}>
                {m.on ? "✓" : "○"} {m.label}
              </span>
            ))}
          </div>
          <div className="pw-progress"><span style={{ width: `${(live / mine.length) * 100}%` }} /></div>
        </section>
      </Reveal>

      <div className="eyebrow">Your setup path</div>
      <Reveal i={1}><PersonaStrip /></Reveal>

      <div className="eyebrow">Go live — paste one read-only key</div>
      <Reveal i={2}><LiveConnect /></Reveal>

      <div className="eyebrow">Or drop a file — computed on this device</div>
      <Reveal i={3}><DropIn /></Reveal>

      <div className="eyebrow">Open your tool — export — drop it in</div>
      {ITEMS.map((it, i) => (
        <Reveal i={i + 3} key={it.title}>
          <article className="mcard open il-card">
            <div className="il-head">
              <span className="il-kick">{it.title}</span>
              <span className={`pill ${it.status === "demo" ? "lite-mod" : "lite-none"}`}>
                <span className="dot" />{it.status === "demo" ? "demo fuel · yours goes live on drop-in" : "engine ready · needs your file"}
              </span>
            </div>
            <div className="il-row-sub" style={{ marginBottom: 10 }}>
              <b style={{ color: "var(--ink)" }}>Unlocks:</b> {it.unlocks}
            </div>
            <div className="pw-provs">
              {it.providers.map((p) =>
                p.url ? (
                  <a className="pw-prov" key={p.name} href={p.url} target="_blank" rel="noopener noreferrer">
                    <span className="pw-prov-n">{p.name}</span>
                    <span className="pw-prov-w">{p.where}</span>
                    <span className="pw-prov-go" aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <div className="pw-prov static" key={p.name}>
                    <span className="pw-prov-n">{p.name}</span>
                    <span className="pw-prov-w">{p.where}</span>
                  </div>
                )
              )}
            </div>
            <div className="pw-csv">
              <span className="pw-csv-lbl">then drop in</span>
              <code>{it.csv}</code>
            </div>
          </article>
        </Reveal>
      ))}

      <Reveal i={ITEMS.length + 3}>
        <div className="reassure">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          Those links open your provider's own sign-in — Counsel never sees your password, and the
          export lands as a file you choose to drop in. One-tap read-only connections arrive with
          the connector phase; the schemas above are exactly what the engines consume either way.
        </div>
      </Reveal>
    </div>
  );
}
