// Power Up — the activation checklist. What to connect, what each source
// unlocks, and the exact dataset shape you can drop in instead — INCLUDING a
// real on-device CSV drop-in: the file is parsed in this page, stored on this
// device, never uploaded, and every engine recomputes on it.

import { useEffect, useRef, useState } from "react";
import { parseCharges, parseExpenses, parsePosts } from "../engine/csvParse";
import { clearUserData, dataMode, hasUserData, storeUserData, userCharges, userExpenses, userMeta } from "../engine/dataSource";
import { addPostsBulk } from "../engine/socialMath";
import { displayName, getPersona, PERSONA_GROUPS, PERSONAS, setPersona } from "../engine/persona";
import {
  clearHistory, cloudStatus, connectBank, connectProvider, disconnectProvider, seedHistory, setPulse, oauthConnectUrl, syncNow,
  type CloudProvider,
} from "../engine/cloudSync";
import { BackBtn, Reveal, ProGate } from "../components/ui";
import {
  executePrice, listActions, previewPrice, revertAction, suggestTrigger,
  type ActionPreview, type ActionTrigger, type ExecutedAction,
} from "../engine/actions";

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

// The close-the-loop drop: lives ON each "open your tool" card so the
// export you just downloaded lands right where the instructions were —
// same universal intake as the main drop (CSV/PDF/photos, many at once).
function CardDrop() {
  const ref = useRef<HTMLInputElement>(null);
  const [st, setSt] = useState<{ ok: boolean; msg: string } | null>(null);
  async function go(list: FileList | null) {
    if (!list?.length) return;
    setSt({ ok: true, msg: `reading ${list.length} file${list.length > 1 ? "s" : ""}…` });
    try {
      const { intakeFiles } = await import("../engine/fileIntake");
      const r = await intakeFiles([...list], (s) => setSt({ ok: true, msg: s }));
      if (!r.charges.length && !r.expenses.length) {
        setSt({ ok: false, msg: r.notes.join(" · ") || "nothing usable found" });
        return;
      }
      storeUserData(r.charges.length ? (r.charges as never) : null, r.expenses.length ? (r.expenses as never) : null,
        list.length === 1 ? list[0].name : `${list.length} files`);
      const summary = [
        r.charges.length ? `${r.charges.length} sales rows` : "",
        r.expenses.length ? `${r.expenses.length} expense rows` : "",
      ].filter(Boolean).join(" + ");
      setSt({ ok: true, msg: `${summary} loaded · ${r.notes.join(" · ")} — reloading on your data…` });
      setTimeout(() => window.location.assign("/insights"), 1600);
    } catch (e) {
      setSt({ ok: false, msg: String(e instanceof Error ? e.message : e) });
    }
  }
  return (
    <>
      <div className="dropin-row" style={{ marginTop: 10 }}>
        <button className="dbtn primary" onClick={() => ref.current?.click()}>Got the export? Drop it here</button>
      </div>
      <input ref={ref} type="file" multiple hidden
        accept=".csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,text/csv,application/pdf,image/*"
        onChange={(e) => { go(e.target.files); e.target.value = ""; }} />
      {st && <div className={`dropin-status ${st.ok ? "ok" : "err"}`}>{st.msg}</div>}
    </>
  );
}

// Put Counsel on the home screen — the elegant version of Chrome's banner.
function InstallCard() {
  const [canPrompt, setCanPrompt] = useState(!!window.__deferredInstall);
  const [installed, setInstalled] = useState(
    window.matchMedia?.("(display-mode: standalone)").matches ?? false,
  );
  useEffect(() => {
    const onAble = () => setCanPrompt(true);
    const onDone = () => { setCanPrompt(false); setInstalled(true); };
    window.addEventListener("counsel:installable", onAble);
    window.addEventListener("appinstalled", onDone);
    return () => { window.removeEventListener("counsel:installable", onAble); window.removeEventListener("appinstalled", onDone); };
  }, []);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (installed) return null;
  if (!canPrompt && !isIOS) return null;

  return (
    <article className="mcard open il-card">
      <div className="il-head">
        <span className="il-kick">◆ put Counsel on your home screen</span>
        <span className="pill lite-hi"><span className="dot" />works offline once installed</span>
      </div>
      <div className="mmean">
        One tap from your home screen, full screen, no browser chrome — the advisor in your pocket, literally.
      </div>
      {canPrompt ? (
        <div className="dropin-row">
          <button className="dbtn primary" onClick={() => window.__deferredInstall?.prompt()}>
            Install Counsel
          </button>
        </div>
      ) : (
        <div className="il-row-sub">
          <b style={{ color: "var(--ink)" }}>On iPhone:</b> tap the Share button, then <b>Add to Home Screen</b>.
        </div>
      )}
    </article>
  );
}

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
  etsy: {
    hint: "no key needed — you sign into Etsy and approve read-only access",
    mint: "one tap: sign in on Etsy, approve transactions + shop read access",
    url: "",
  },
  quickbooks: {
    hint: "no key needed — you sign in with Intuit and approve read access",
    mint: "one tap: sign in with Intuit, approve accounting read access — your expenses flow in",
    url: "",
  },
};

// The guided connect walk: one connector at a time, in the order that
// pays off fastest, each skippable, each honest about its state.
// "soon" connectors are fully wired server-side and flip to "ready"
// the day their platform review clears — update ONLY this table.
const GUIDE_STEPS: {
  id: CloudProvider | "csv"; name: string; what: string;
  status: "ready" | "soon"; note?: string;
}[] = [
  { id: "square", name: "Square", status: "ready",
    what: "your register — sales sync automatically after one sign-in" },
  { id: "shopify", name: "Shopify", status: "ready",
    what: "your online store — orders flow in after you sign in",
    note: "pilot stores: we connect this together — have your your-shop.myshopify.com name handy" },
  { id: "plaid", name: "Bank account", status: "soon",
    what: "your expenses, straight from the bank",
    note: "bank connections are in final review — days away" },
  { id: "stripe", name: "Stripe", status: "ready",
    what: "online payments and invoices — sign in once, read-only, no keys" },
  { id: "quickbooks", name: "QuickBooks", status: "soon",
    what: "your books — expenses feed the money map and cash view",
    note: "Intuit verification underway" },
  { id: "etsy", name: "Etsy", status: "soon",
    what: "maker sales from your shop",
    note: "reapplying under Etsy's new API program" },
  { id: "csv", name: "A simple file", status: "ready",
    what: "export a CSV from anywhere — sales or expenses — and drop it in. Always works, nothing to sign into" },
];

function LiveConnect() {
  const [provider, setProvider] = useState<CloudProvider>("stripe");
  // Guided walk position — persists so a half-done setup resumes.
  const [gStep, setGStep] = useState<number>(() => {
    try { return Math.min(GUIDE_STEPS.length, Number(localStorage.getItem("counsel.connectGuide") || 0)); } catch { return 0; }
  });
  const gGo = (i: number) => {
    setGStep(i);
    try { localStorage.setItem("counsel.connectGuide", String(i)); } catch { /* fine */ }
  };
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
    // Returned from a provider OAuth redirect? (?connected=square / ?error=…)
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("connected");
    const err = params.get("error");
    if (ok || err) {
      window.history.replaceState({}, "", window.location.pathname); // clean the URL
      if (ok) {
        setProvider(ok as CloudProvider);
        setStatus({ ok: true, msg: `${ok} connected via sign-in — pulling your data…` });
        cloudStatus().then((s) => setConnected(s.providers)).catch(() => undefined);
        setTimeout(doSync, 700);
      } else {
        setStatus({ ok: false, msg: `sign-in didn't complete (${err}). Nothing connected — try again.` });
      }
    }
  }, []);

  async function doOAuth(prov: "stripe" | "square" | "etsy" | "shopify" | "quickbooks") {
    setBusy(`opening ${prov} sign-in…`);
    setStatus(null);
    try {
      const url = await oauthConnectUrl(prov, prov === "shopify" ? { shop: shop.trim() } : undefined);
      const { isNativeApp } = await import("../engine/cloudSync");
      if (!isNativeApp()) {
        window.location.assign(url); // web: full-page redirect works fine
        return;
      }
      // Native shells swallow external location.assign — open the
      // provider in the in-app browser sheet instead, and poll the
      // worker until the connection lands (the sheet's final page says
      // "close this and return to Counsel").
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      setBusy(`waiting for ${prov} sign-in to finish…`);
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const st = await cloudStatus();
          if (st.providers.includes(prov as CloudProvider)) {
            try { await Browser.close(); } catch { /* sheet may be closed */ }
            setConnected(st.providers);
            setBusy(null);
            setStatus({ ok: true, msg: `${prov} connected — pulling your data…` });
            await doSync();
            return;
          }
        } catch { /* transient — keep polling */ }
      }
      setBusy(null);
      setStatus({ ok: false, msg: `${prov} sign-in didn't finish — if you completed it, tap Sync; otherwise try again` });
    } catch (e) {
      setStatus({ ok: false, msg: String(e instanceof Error ? e.message : e) });
      setBusy(null);
    }
  }

  async function doPlaid() {
    setStatus(null);
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
  }

  async function doConnect() {
    setStatus(null);
    if (provider === "plaid") {
      await doPlaid();
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
          r.deduped ? `${r.deduped} Stripe echo${r.deduped === 1 ? "" : "es"} of Shopify orders removed` : null,
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
      {gStep < GUIDE_STEPS.length ? (() => {
        const g = GUIDE_STEPS[gStep];
        const isConn = g.id !== "csv" && connected.includes(g.id as CloudProvider);
        return (
          <div className="guide-card">
            <div className="guide-top">
              <span className="guide-count">{gStep + 1} of {GUIDE_STEPS.length}</span>
              <span className={`pill ${g.status === "ready" ? "lite-hi" : "lite-fc"}`}>
                <span className="dot" />{isConn ? "connected" : g.status === "ready" ? "ready to connect" : "coming soon"}
              </span>
            </div>
            <div className="guide-name">{g.name}</div>
            <div className="guide-what">{g.what}</div>
            {g.note && <div className="guide-note">{g.note}</div>}
            {g.id === "plaid" && !isConn && dataMode() === "demo" && (
              <div className="guide-note">
                Want to feel it now? You can walk the real flow with a test bank —
                pick any bank, sign in with <b>user_good</b> / <b>pass_good</b>.
                Fake numbers, clearly test; Settings clears them in one tap. This
                option only appears before real data is connected — never after.
              </div>
            )}
            {g.id === "shopify" && g.status === "ready" && !isConn && (
              <input className="dt-input" placeholder="your-shop (from your-shop.myshopify.com)"
                value={shop} onChange={(e) => setShop(e.target.value)} autoComplete="off"
                aria-label="Shopify shop name" style={{ marginTop: 10 }} />
            )}
            <div className="guide-btns">
              {g.status === "ready" && g.id === "csv" && (
                <button className="dbtn primary" onClick={() => {
                  document.getElementById("csv-dropin")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}>Drop in a file below</button>
              )}
              {g.status === "ready" && g.id !== "csv" && !isConn && (
                <button className="dbtn primary" disabled={!!busy || (g.id === "shopify" && !shop.trim())}
                  onClick={() => doOAuth(g.id as "stripe" | "square" | "etsy" | "shopify" | "quickbooks")}>
                  Connect {g.name} — sign in
                </button>
              )}
              {g.id === "plaid" && !isConn && dataMode() === "demo" && (
                <button className="dbtn primary" disabled={!!busy} onClick={doPlaid}>
                  Demo the flow — test bank
                </button>
              )}
              <button className="dbtn" onClick={() => gGo(gStep + 1)}>
                {isConn || g.status === "soon" ? "Next" : "I don't have this — skip"}
              </button>
              {gStep > 0 && <button className="dbtn" onClick={() => gGo(gStep - 1)}>Back</button>}
            </div>
            <div className="guide-dots" aria-hidden="true">
              {GUIDE_STEPS.map((st, i) => (
                <span key={st.id} className={`gd ${i === gStep ? "on" : i < gStep ? "done" : ""}`} />
              ))}
            </div>
          </div>
        );
      })() : (
        <div className="guide-card">
          <div className="guide-name">That's the tour.</div>
          <div className="guide-what">
            {connected.length
              ? `${connected.length} source${connected.length > 1 ? "s" : ""} connected — your numbers are flowing.`
              : "Nothing connected yet — the file drop below always works, and the walk is here whenever."}
          </div>
          <div className="guide-btns">
            <button className="dbtn" onClick={() => gGo(0)}>Walk through again</button>
          </div>
        </div>
      )}
      <details className="classic-connect">
        <summary>all connection options (the full list)</summary>
      <div className="lc-form">
        <select className="ps-select" value={provider} aria-label="Provider"
          onChange={(e) => { setProvider(e.target.value as CloudProvider); setStatus(null); }}>
          <option value="stripe">Stripe</option>
          <option value="square">Square</option>
          <option value="shopify">Shopify</option>
          <option value="plaid">Bank — expenses (Plaid)</option>
          <option value="etsy">Etsy — maker sales</option>
          <option value="quickbooks">QuickBooks — expenses</option>
        </select>
        {provider === "shopify" && (
          <>
            <input className="dt-input" placeholder="your-shop (from your-shop.myshopify.com)"
              value={shop} onChange={(e) => setShop(e.target.value)} autoComplete="off" aria-label="Shopify shop name" />
            <button className="dbtn primary" disabled={!!busy || !shop.trim()} onClick={() => doOAuth("shopify")}>
              Connect with Shopify — sign in
            </button>
            <div className="lc-mint">
              <b>One tap:</b> enter your shop, sign in on Shopify, approve read-only access. Or paste an Admin token below.
            </div>
          </>
        )}
        {provider === "stripe" && (
          <>
            <button className="dbtn primary" disabled={!!busy} onClick={() => doOAuth("stripe")}>
              Connect with Stripe — sign in
            </button>
            <div className="lc-mint">
              <b>One tap:</b> you sign in on Stripe and approve read-only access — no key to copy. Or paste a restricted key below.
            </div>
          </>
        )}
        {provider === "square" && (
          <>
            <button className="dbtn primary" disabled={!!busy} onClick={() => doOAuth("square")}>
              Connect with Square — sign in
            </button>
            <div className="lc-mint">
              <b>One tap:</b> you sign in on Square and approve read-only access — no key to copy. Or paste an access token below.
            </div>
          </>
        )}
        {provider === "etsy" && (
          <button className="dbtn primary" disabled={!!busy} onClick={() => doOAuth("etsy")}>
            Connect with Etsy — sign in
          </button>
        )}
        {provider === "quickbooks" && (
          <>
            <button className="dbtn primary" disabled={!!busy} onClick={() => doOAuth("quickbooks")}>
              Connect with QuickBooks — sign in
            </button>
            <div className="lc-mint">
              <b>One tap:</b> sign in with Intuit and approve read access to your books — expenses flow into the money map, audit, and cash view.
            </div>
          </>
        )}
        {provider !== "plaid" && provider !== "etsy" && provider !== "quickbooks" && (
          <input className="dt-input" type="password" placeholder={provider === "square" ? "or paste an access token instead" : help.hint}
            value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" aria-label={`${provider} access key`} />
        )}
        {provider === "square" && (
          <select className="ps-select" value={sqEnv} aria-label="Square token environment (for pasted tokens)"
            onChange={(e) => setSqEnv(e.target.value as "production" | "sandbox")}>
            <option value="production">pasted token: Production</option>
            <option value="sandbox">pasted token: Sandbox</option>
          </select>
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
      </details>
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
  const anyRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [active, setActive] = useState(hasUserData());
  const meta = userMeta();

  // The universal drop: many files at once — CSVs (auto-detected sales vs
  // expenses), PDF statements, receipt photos. All parsed on this device.
  async function onBatch(list: FileList | null) {
    if (!list?.length) return;
    const files = [...list];
    setStatus({ ok: true, msg: `reading ${files.length} file${files.length > 1 ? "s" : ""}…` });
    try {
      const { intakeFiles } = await import("../engine/fileIntake");
      const r = await intakeFiles(files, (s) => setStatus({ ok: true, msg: s }));
      if (!r.charges.length && !r.expenses.length) {
        setStatus({ ok: false, msg: r.notes.join(" · ") || "nothing usable found in those files" });
        return;
      }
      const label = files.length === 1 ? files[0].name : `${files.length} files`;
      storeUserData(r.charges.length ? (r.charges as never) : null, r.expenses.length ? (r.expenses as never) : null, label);
      setActive(true);
      const summary = [
        r.charges.length ? `${r.charges.length} sales rows` : "",
        r.expenses.length ? `${r.expenses.length} expense rows` : "",
      ].filter(Boolean).join(" + ");
      setStatus({ ok: true, msg: `${summary} loaded · ${r.notes.join(" · ")} — reloading on your data…` });
      setTimeout(() => window.location.assign("/insights"), 1600);
    } catch (e) {
      setStatus({ ok: false, msg: String(e instanceof Error ? e.message : e) });
    }
  }

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
        // the parser says exactly how it read the file — same receipt
        // discipline as every claim upstream of it
        msg: `${res.rows.length} rows from ${file.name}${res.note ? ` · ${res.note}` : ""} — reloading on your data…`,
      });
      setTimeout(() => window.location.assign("/insights"), 900);
    } catch (e) {
      setStatus({ ok: false, msg: String(e instanceof Error ? e.message : e) });
    }
  }

  return (
    <article className="mcard open il-card dropin" id="csv-dropin"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onBatch(e.dataTransfer?.files ?? null); }}>
      <div className="il-head">
        <span className="il-kick">Use YOUR data — right now</span>
        <span className={`pill ${active ? "lite-hi" : "lite-fc"}`}><span className="dot" />
          {active ? `your data active${meta ? ` · ${meta.name}` : ""}` : "on-device · never uploaded"}
        </span>
      </div>
      <div className="mmean">
        Drop in what you have — <b>several files at once</b>: CSVs (sales or
        expenses, told apart automatically), PDF bank statements, even receipt
        photos. Everything parses <b>on this device</b>, stored <b>on this
        device</b>, never uploaded. Sales CSVs need just <code>date</code> +
        <code>amount</code>; the rest unlocks more engines.
      </div>
      <div className="dropin-row">
        <button className="dbtn primary" onClick={() => anyRef.current?.click()}>Drop in files — CSV · PDF · photos</button>
        <button className="dbtn" onClick={() => chargesRef.current?.click()}>Sales CSV only</button>
        <button className="dbtn" onClick={() => expensesRef.current?.click()}>Expenses CSV only</button>
        <button className="dbtn" onClick={() => postsRef.current?.click()}>Posts CSV</button>
        {active && (
          <button className="dbtn" onClick={() => { clearUserData(); setActive(false); setStatus({ ok: true, msg: "back to the demo ledger — reload any screen" }); }}>
            Reset to demo
          </button>
        )}
      </div>
      <input ref={anyRef} type="file" multiple hidden
             accept=".csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,text/csv,application/pdf,image/*"
             onChange={(e) => { onBatch(e.target.files); e.target.value = ""; }} />
      <input ref={chargesRef} type="file" accept=".csv,text/csv" hidden
             onChange={(e) => onFile("charges", e.target.files?.[0])} />
      <input ref={expensesRef} type="file" accept=".csv,text/csv" hidden
             onChange={(e) => onFile("expenses", e.target.files?.[0])} />
      <input ref={postsRef} type="file" accept=".csv,text/csv" hidden
             onChange={(e) => onFile("posts", e.target.files?.[0])} />
      {status && <div className={`dropin-status ${status.ok ? "ok" : "err"}`}>{status.msg}</div>}
      <div className="il-cite">
        works with bank exports, Etsy/Shopify order exports, PDF statements (with a text layer),
        receipt photos (the photo reader downloads once; photos never leave the device) ·
        money baselines stay demo until expenses/bank data is loaded — cards say which is which
      </div>
    </article>
  );
}

// Signed execution (beta) — Counsel's hands, under contract: preview the
// exact diff, sign it, the executor performs it, and the watchdog cron
// auto-reverts if volume breaks the floor. Prices and messages, never money.
function ExecutionCard({ connected }: { connected: CloudProvider[] }) {
  const [query, setQuery] = useState("");
  const [price, setPrice] = useState("");
  const [prev, setPrev] = useState<ActionPreview | null>(null);
  const [trig, setTrig] = useState<ActionTrigger | null>(null);
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [actions, setActions] = useState<ExecutedAction[]>([]);

  useEffect(() => { listActions().then(setActions).catch(() => undefined); }, []);

  async function doPreview() {
    setBusy("asking your store…"); setMsg(null); setPrev(null); setSigned(false);
    try {
      const p2 = await previewPrice(query.trim(), parseFloat(price));
      setPrev(p2);
      setTrig(suggestTrigger(p2.title));
    } catch (e) {
      setMsg({ ok: false, text: String(e instanceof Error ? e.message : e) });
    } finally { setBusy(null); }
  }

  async function doExecute() {
    if (!prev || !trig) return;
    setBusy("executing with your signature…"); setMsg(null);
    try {
      const a = await executePrice(prev, parseFloat(price), trig);
      setActions((x) => [...x, a]);
      setPrev(null); setSigned(false); setQuery(""); setPrice("");
      setMsg({ ok: true, text: `done — ${a.title} is now $${a.to}. The watchdog is armed: if volume runs below ${a.trigger.minDaily}/day for ${a.trigger.days} straight days, the price reverts itself and tells you.` });
    } catch (e) {
      setMsg({ ok: false, text: String(e instanceof Error ? e.message : e) });
    } finally { setBusy(null); }
  }

  const STATUS: Record<string, string> = {
    armed: "● armed — watchdog live", held: "✓ held — test passed",
    reverted_auto: "↩ auto-reverted", reverted_manual: "↩ reverted by you",
  };
  void connected;

  return (
    <article className="mcard open il-card rec-card">
      <div className="il-head">
        <span className="il-kick">signed execution · beta</span>
        <span className="pill lite-mod"><span className="dot" />prices &amp; messages — never money</span>
      </div>
      <div className="mmean">
        Run a price change <b>with your signature</b>: preview the exact diff, sign it, and the
        watchdog auto-reverts if volume breaks the floor. Needs the <b>write_products</b> scope on
        your Shopify connection.
      </div>
      <div className="dropin-row">
        <input className="dt-input" style={{ flex: 2 }} placeholder="product name (as it sells)"
          value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Product name" />
        <input className="dt-input" style={{ flex: 1 }} type="number" inputMode="decimal" placeholder="new price"
          value={price} onChange={(e) => setPrice(e.target.value)} aria-label="New price" />
        <button className="dbtn" disabled={!!busy || !query.trim() || !(parseFloat(price) > 0)} onClick={doPreview}>
          Preview
        </button>
      </div>
      {prev && trig && (
        <div className="sign-box">
          <div className="rec-action">{prev.title}: ${prev.currentPrice} → ${parseFloat(price).toFixed(2)}</div>
          <div className="il-row-sub">
            rollback trigger: fewer than{" "}
            <input className="trig-in" type="number" inputMode="decimal" value={trig.minDaily} aria-label="Minimum units per day"
              onChange={(e) => setTrig({ ...trig, minDaily: parseFloat(e.target.value) || 0 })} />
            {" "}units/day for{" "}
            <input className="trig-in" type="number" inputMode="numeric" value={trig.days} aria-label="Consecutive days"
              onChange={(e) => setTrig({ ...trig, days: parseInt(e.target.value) || 5 })} />
            {" "}straight days → price restores itself · test window {trig.horizonDays} days, then graded
          </div>
          <label className="sign-row">
            <input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} />
            <span>I authorize this exact change — and its armed undo.</span>
          </label>
          <div className="dropin-row">
            <button className="dbtn primary" disabled={!signed || !!busy} onClick={doExecute}>
              ✍ Sign &amp; execute
            </button>
            <button className="dbtn" disabled={!!busy} onClick={() => { setPrev(null); setSigned(false); }}>Cancel</button>
          </div>
        </div>
      )}
      {busy && <div className="dropin-status ok">{busy}</div>}
      {msg && <div className={`dropin-status ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
      {actions.length > 0 && (
        <div className="act-list">
          {[...actions].reverse().map((a) => (
            <div className="act-row" key={a.aid}>
              <div className="act-main">
                <b>{a.title}</b> ${a.from} → ${a.to}
                <span className={`act-status ${a.status}`}>{STATUS[a.status]}</span>
              </div>
              <div className="il-row-sub">
                {new Date(a.t).toLocaleDateString()} · floor {a.trigger.minDaily}/day × {a.trigger.days}d{a.note ? ` · ${a.note}` : ""}
              </div>
              {a.status === "armed" && (
                <button className="dt-btn" onClick={async () => {
                  try { await revertAction(a.aid); setActions(await listActions()); } catch (e) { setMsg({ ok: false, text: String(e instanceof Error ? e.message : e) }); }
                }}>↩ revert now</button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="il-cite">every action is signed, snapshotted, and watched by the same engines that proposed it · the full record lives in the Trust Ledger</div>
    </article>
  );
}

function ExecutionCardSlot() {
  const [connected, setConnected] = useState<CloudProvider[]>([]);
  useEffect(() => { cloudStatus().then((s2) => setConnected(s2.providers)).catch(() => undefined); }, []);
  if (!connected.includes("shopify")) {
    return (
      <article className="mcard open il-card awaiting">
        <div className="mmean">Execution unlocks when <b>Shopify</b> is connected (with the write_products scope) — Counsel then runs signed price changes with an armed, measured rollback. <b>Prices and messages — never money.</b></div>
      </article>
    );
  }
  return <ExecutionCard connected={connected} />;
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

      <Reveal i={1}><InstallCard /></Reveal>

      <div className="eyebrow">Your setup path</div>
      <Reveal i={1}><PersonaStrip /></Reveal>

      <div className="eyebrow">Go live — paste one read-only key</div>
      <Reveal i={2}><LiveConnect /></Reveal>

      <div className="eyebrow">Signed execution — Counsel's hands, under contract</div>
      <Reveal i={2}><ProGate feature="Execution rails" line="price changes with your signature, watched and auto-reverted if reality disagrees."><ExecutionCardSlot /></ProGate></Reveal>

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
            <CardDrop />
          </article>
        </Reveal>
      ))}

      <Reveal i={ITEMS.length + 3}>
        <div className="reassure">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          Those links open your provider's own sign-in — Counsel never sees your password. Download
          the export they give you (CSV or PDF, or just photograph the paper) and drop it on the
          card you got it from — it reads and files itself. One-tap connections replace this
          ritual as each platform's review clears.
        </div>
      </Reveal>
    </div>
  );
}
