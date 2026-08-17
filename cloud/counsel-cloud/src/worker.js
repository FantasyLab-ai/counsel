// counsel-cloud — the hosted sync backend for Counsel.
//
// Design principles (the privacy story stays literal):
//   * We store TOKENS, not books. Provider keys are AES-GCM-encrypted at rest
//     in KV; business data (charges) is pulled on demand, normalized, and
//     returned to the device — it is NEVER persisted server-side.
//   * Accounts are device-keyed: the app mints {accountId, accountSecret} on
//     first use. No email, no password, nothing to phish. (Email/Apple
//     sign-in can layer on later without changing the API.)
//   * Key-paste connectors first: Stripe restricted keys, Square access
//     tokens, Shopify custom-app tokens. Merchants mint their own read-only
//     credentials in their own dashboards — zero OAuth app approvals needed.
//
// Endpoints (all JSON):
//   POST   /v1/account               -> { accountId, accountSecret }
//   GET    /v1/connections           -> { providers: [...] }            (auth)
//   POST   /v1/connect/stripe        -> { ok }  body: { key }           (auth)
//   POST   /v1/connect/square        -> { ok }  body: { token, env? }   (auth)
//   POST   /v1/connect/shopify       -> { ok }  body: { shop, token }   (auth)
//   DELETE /v1/connect/:provider     -> { ok }                          (auth)
//   POST   /v1/sync                  -> { charges, sources, pulled }    (auth)
//   DELETE /v1/account               -> { ok }                          (auth)
//
// Auth: Authorization: Bearer <accountId>.<accountSecret>

const PROVIDERS = ["stripe", "square", "shopify", "plaid", "etsy"];
const MAX_ROWS = 5000; // devices store ~4 MB; 5k canonical rows is plenty
const DEFAULT_DAYS = 365;

/* ----------------------------- tiny helpers ----------------------------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function randHex(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function aesKey(env) {
  return crypto.subtle.importKey("raw", hexToBytes(env.ENC_KEY), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function sealToken(env, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(plain));
  const buf = new Uint8Array(iv.length + ct.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...buf));
}

async function openToken(env, sealed) {
  const buf = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf.slice(0, 12) }, await aesKey(env), buf.slice(12),
  );
  return dec.decode(pt);
}

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "";
  const ok = /^https:\/\/([a-z0-9-]+\.)?counsel-demo\.pages\.dev$/.test(origin)
    || /^http:\/\/localhost(:\d+)?$/.test(origin)
    || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : "https://counsel-demo.pages.dev",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(req, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(req) },
  });
}

async function readBody(req) {
  try {
    const text = await req.text();
    if (text.length > 10_000) return null; // credentials are small; books never come up
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

/* ------------------------------ rate limits ------------------------------
   Three tiers (bindings in wrangler.jsonc): STRICT for the abusable writes
   (account mint, telemetry, backfill/pulse, signed execution), SYNC for the
   provider fan-out, NORM for the rest. Keyed by account id when we have one
   (stable behind NAT), by IP before auth. Fails OPEN: if a binding is
   missing the request proceeds — a config slip must never take the API down. */

function clientKey(req) {
  return req.headers.get("CF-Connecting-IP") || "unknown";
}

// In-memory bucket, per isolate. The platform binding is open beta and can
// no-op (observed: counters never trip), so this is the working brake: a
// client hammering in a tight loop rides the same isolate and hits it.
const RL_LOCAL = new Map(); // key -> { n, reset }
function localLimited(key, limit, periodSec = 60) {
  const now = Date.now();
  let b = RL_LOCAL.get(key);
  if (!b || now >= b.reset) {
    b = { n: 0, reset: now + periodSec * 1000 };
    RL_LOCAL.set(key, b);
  }
  b.n++;
  if (RL_LOCAL.size > 2000) {
    for (const [k, v] of RL_LOCAL) if (now >= v.reset) RL_LOCAL.delete(k);
  }
  return b.n > limit;
}

async function limited(binding, key, limit) {
  if (localLimited(key, limit)) return true;
  if (!binding?.limit) return false;
  try {
    const { success } = await binding.limit({ key });
    return !success;
  } catch {
    return false;
  }
}

function tooMany(req) {
  return new Response(JSON.stringify({ error: "rate limited — give it a minute and try again" }), {
    status: 429,
    headers: { "content-type": "application/json", "Retry-After": "60", ...corsHeaders(req) },
  });
}

/* ------------------------------- accounts ------------------------------- */

async function requireAuth(req, env) {
  const m = /^Bearer\s+(ca_[a-f0-9]+)\.(cs_[a-f0-9]+)$/.exec(req.headers.get("Authorization") || "");
  if (!m) return null;
  const raw = await env.ACCOUNTS.get(`acct:${m[1]}`);
  if (!raw) return null;
  const acct = JSON.parse(raw);
  if (acct.sh !== await sha256hex(m[2])) return null;
  return { id: m[1], acct };
}

async function saveAcct(env, id, acct) {
  await env.ACCOUNTS.put(`acct:${id}`, JSON.stringify(acct));
}

/* --------------------------- provider adapters --------------------------- */
// Each adapter: validate(credentials) -> ok?, and pull(credentials, sinceIso)
// -> canonical Charge rows {date, product, qty, price, customer, fee, channel}.

const stripeAdapter = {
  async validate(cred) {
    const r = await fetch("https://api.stripe.com/v1/charges?limit=1", {
      headers: { Authorization: `Bearer ${cred.key}` },
    });
    return r.ok;
  },
  async pull(cred, sinceUnix) {
    const rows = [];
    let after = "";
    let withFees = true;
    for (let page = 0; page < 10 && rows.length < MAX_ROWS; page++) {
      const params = new URLSearchParams({ limit: "100", "created[gte]": String(sinceUnix) });
      if (withFees) params.append("expand[]", "data.balance_transaction");
      if (after) params.set("starting_after", after);
      const r = await fetch(`https://api.stripe.com/v1/charges?${params}`, {
        headers: { Authorization: `Bearer ${cred.key}` },
      });
      if (!r.ok) {
        // restricted key without Balance read -> retry the page without fees
        if (withFees) { withFees = false; page--; continue; }
        break;
      }
      const data = await r.json();
      for (const c of data.data ?? []) {
        if (c.status !== "succeeded" || !c.paid) continue;
        if (c.amount_refunded >= c.amount) continue;
        rows.push({
          date: new Date(c.created * 1000).toISOString().slice(0, 10),
          product: String(c.metadata?.product || c.description || "sale").slice(0, 60),
          qty: 1,
          price: (c.amount - (c.amount_refunded || 0)) / 100,
          customer: String(c.metadata?.customer || c.customer || c.receipt_email || "guest").slice(0, 60),
          fee: c.balance_transaction?.fee != null ? c.balance_transaction.fee / 100 : 0,
          channel: String(c.metadata?.channel || "stripe").slice(0, 30),
        });
      }
      if (!data.has_more || !data.data?.length) break;
      after = data.data[data.data.length - 1].id;
    }
    return rows;
  },
};

const squareAdapter = {
  base(cred) {
    return cred.env === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  },
  headers(cred) {
    return { Authorization: `Bearer ${cred.token}`, "Square-Version": "2024-01-18" };
  },
  async validate(cred) {
    const r = await fetch(`${this.base(cred)}/v2/locations`, { headers: this.headers(cred) });
    return r.ok;
  },
  async pull(cred, sinceUnix) {
    const rows = [];
    let cursor = "";
    const begin = new Date(sinceUnix * 1000).toISOString();
    for (let page = 0; page < 10 && rows.length < MAX_ROWS; page++) {
      const params = new URLSearchParams({ begin_time: begin, limit: "100", sort_order: "ASC" });
      if (cursor) params.set("cursor", cursor);
      const r = await fetch(`${this.base(cred)}/v2/payments?${params}`, { headers: this.headers(cred) });
      if (!r.ok) break;
      const data = await r.json();
      for (const p of data.payments ?? []) {
        if (p.status !== "COMPLETED") continue;
        const amt = (p.amount_money?.amount ?? 0) / 100;
        if (amt <= 0) continue;
        const fee = (p.processing_fee ?? []).reduce((s, f) => s + (f.amount_money?.amount ?? 0), 0) / 100;
        rows.push({
          date: String(p.created_at).slice(0, 10),
          product: "sale",
          qty: 1,
          price: amt,
          customer: String(p.customer_id || "guest").slice(0, 60),
          fee,
          channel: "square",
        });
      }
      cursor = data.cursor || "";
      if (!cursor) break;
    }
    return rows;
  },
};

const shopifyAdapter = {
  okShop(shop) {
    return /^[a-z0-9][a-z0-9-]{1,60}$/.test(shop);
  },
  async validate(cred) {
    if (!this.okShop(cred.shop)) return false;
    const r = await fetch(`https://${cred.shop}.myshopify.com/admin/api/2024-07/shop.json`, {
      headers: { "X-Shopify-Access-Token": cred.token },
    });
    return r.ok;
  },
  async pull(cred, sinceUnix) {
    const rows = [];
    const since = new Date(sinceUnix * 1000).toISOString();
    let url = `https://${cred.shop}.myshopify.com/admin/api/2024-07/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(since)}`;
    for (let page = 0; page < 5 && url && rows.length < MAX_ROWS; page++) {
      const r = await fetch(url, { headers: { "X-Shopify-Access-Token": cred.token } });
      if (!r.ok) break;
      const data = await r.json();
      for (const o of data.orders ?? []) {
        if (!["paid", "partially_paid", "partially_refunded"].includes(o.financial_status)) continue;
        const date = String(o.created_at).slice(0, 10);
        const customer = String(o.customer?.id || "guest").slice(0, 60);
        const channel = String(o.source_name || "shopify").slice(0, 30);
        const items = o.line_items?.length
          ? o.line_items
          : [{ title: "sale", quantity: 1, price: o.total_price }];
        for (const li of items) {
          const price = parseFloat(li.price);
          if (!(price > 0)) continue;
          rows.push({
            date,
            product: String(li.title || "sale").slice(0, 60),
            qty: Math.max(1, li.quantity | 0),
            price,
            customer,
            fee: 0,
            channel,
            _order: String(o.id),
            _otot: parseFloat(o.total_price),
          });
        }
      }
      // cursor pagination lives in the Link header
      const link = r.headers.get("Link") || "";
      const next = /<([^>]+)>;\s*rel="next"/.exec(link);
      url = next ? next[1] : "";
    }
    return rows;
  },
};

/* --- cross-source dedupe -------------------------------------------------
   The real trap: a Shopify store that takes payment THROUGH Stripe. Connect
   both and every online order arrives twice — once as a Shopify order (rich:
   products, customer, channel) and once as a Stripe charge (just the total).
   We prefer the richer Shopify row and drop the Stripe echo, matched at the
   ORDER level (date + rounded total), consuming each match once. Stripe-only
   revenue (subscriptions, invoices, in-person, non-Shopify) is untouched.
   Only runs when BOTH sources are present — otherwise there's no risk. */
function dedupeSources(charges) {
  const hasStripe = charges.some((c) => c._src === "stripe");
  const hasShopify = charges.some((c) => c._src === "shopify");
  if (!hasStripe || !hasShopify) return { rows: charges, removed: 0 };

  // one signature per Shopify ORDER (line items collapse back to their order)
  const sig = new Map();
  const seenOrders = new Set();
  for (const c of charges) {
    if (c._src !== "shopify" || c._order == null) continue;
    if (seenOrders.has(c._order)) continue;
    seenOrders.add(c._order);
    const k = `${c.date}|${Math.round(c._otot)}`;
    sig.set(k, (sig.get(k) || 0) + 1);
  }

  let removed = 0;
  const out = [];
  for (const c of charges) {
    if (c._src === "stripe") {
      const k = `${c.date}|${Math.round(c.price * c.qty)}`;
      const n = sig.get(k) || 0;
      if (n > 0) { sig.set(k, n - 1); removed++; continue; } // drop the echo
    }
    out.push(c);
  }
  return { rows: out, removed };
}

/* --------------------------- Square OAuth --------------------------------
   "Connect with Square": the merchant signs into their own Square account
   and grants read-only access. We exchange the code for a token and seal it
   in the vault in the SAME shape the key-paste path uses, so the existing
   squareAdapter pulls it with zero changes. Config: SQUARE_CLIENT_ID +
   SQUARE_OAUTH_ENV (vars) + SQUARE_CLIENT_SECRET (secret). */
const SQUARE_OAUTH_SCOPES = "PAYMENTS_READ ORDERS_READ MERCHANT_PROFILE_READ ITEMS_READ";
const APP_REDIRECT = "https://counsel-demo.pages.dev/power";
function squareOAuthHost(env) {
  return (env.SQUARE_OAUTH_ENV || "production") === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}
function squareAuthorizeUrl(env, state) {
  const u = new URL(`${squareOAuthHost(env)}/oauth2/authorize`);
  u.searchParams.set("client_id", env.SQUARE_CLIENT_ID || "");
  u.searchParams.set("scope", SQUARE_OAUTH_SCOPES);
  u.searchParams.set("session", "false");
  u.searchParams.set("state", state);
  return u.toString();
}
async function squareExchange(env, code) {
  const r = await fetch(`${squareOAuthHost(env)}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/json", "Square-Version": "2024-01-18" },
    body: JSON.stringify({
      client_id: env.SQUARE_CLIENT_ID,
      client_secret: env.SQUARE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(String(j.errors?.[0]?.detail || j.message || `square_${r.status}`).slice(0, 120));
  return {
    token: j.access_token,
    env: (env.SQUARE_OAUTH_ENV || "production") === "sandbox" ? "sandbox" : "production",
    refresh: j.refresh_token || "",
    merchant: j.merchant_id || "",
  };
}

/* ----------------------------- Etsy (v3) ---------------------------------
   Maker persona. OAuth 2.0 with PKCE (Etsy mandates it — the code_verifier
   replaces a client secret, so ETSY_CLIENT_SECRET is unused). Tokens live 1
   hour; we refresh on every sync and persist the rotated refresh token.
   Data = shop receipts -> their transactions -> canonical charges.
   Config: ETSY_CLIENT_ID (keystring, var); redirect registered in the app. */

const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const ETSY_API = "https://api.etsy.com/v3/application";
const ETSY_REDIRECT = "https://counsel-cloud.fantasy-labai.workers.dev/v1/oauth/etsy/callback";
const ETSY_SCOPES = "transactions_r shops_r";

function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pkceVerifier() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return b64url(b);
}
async function pkceChallenge(verifier) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(verifier));
  return b64url(new Uint8Array(d));
}
function etsyAuthorizeUrl(env, state, challenge) {
  const u = new URL("https://www.etsy.com/oauth/connect");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.ETSY_CLIENT_ID || "");
  u.searchParams.set("redirect_uri", ETSY_REDIRECT);
  u.searchParams.set("scope", ETSY_SCOPES);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}
async function etsyTokenCall(env, body) {
  const r = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(String(j.error_description || j.error || `etsy_${r.status}`).slice(0, 120));
  return {
    token: j.access_token,
    refresh: j.refresh_token || body.refresh_token || "",
    expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
  };
}
function etsyHeaders(env, token) {
  return { "x-api-key": env.ETSY_CLIENT_ID, Authorization: `Bearer ${token}` };
}
async function etsyGetShopId(env, cred) {
  if (cred.shop_id) return cred.shop_id;
  const userId = String(cred.token).split(".")[0];
  const r = await fetch(`${ETSY_API}/users/${userId}/shops`, { headers: etsyHeaders(env, cred.token) });
  const j = await r.json();
  if (!r.ok) throw new Error(String(j.error || `etsy_shop_${r.status}`).slice(0, 100));
  // response may be a Shop object or a paged list
  const shopId = j.shop_id ?? j.results?.[0]?.shop_id;
  if (!shopId) throw new Error("no Etsy shop found for this account");
  return shopId;
}
// Returns { rows, cred } — cred carries the rotated refresh token + shop_id to persist.
async function etsyPull(env, cred0, sinceUnix) {
  // refresh first (tokens expire hourly; refresh rotates)
  const fresh = await etsyTokenCall(env, {
    grant_type: "refresh_token",
    client_id: env.ETSY_CLIENT_ID,
    refresh_token: cred0.refresh,
  });
  const cred = { ...cred0, ...fresh };
  const shopId = await etsyGetShopId(env, cred);
  cred.shop_id = shopId;

  const rows = [];
  let offset = 0;
  for (let page = 0; page < 10 && rows.length < MAX_ROWS; page++) {
    const params = new URLSearchParams({ limit: "100", offset: String(offset), min_created: String(sinceUnix) });
    const r = await fetch(`${ETSY_API}/shops/${shopId}/receipts?${params}`, { headers: etsyHeaders(env, cred.token) });
    if (!r.ok) break;
    const data = await r.json();
    const receipts = data.results ?? [];
    for (const rc of receipts) {
      const date = new Date((rc.created_timestamp || 0) * 1000).toISOString().slice(0, 10);
      const customer = String(rc.buyer_user_id || "guest").slice(0, 60);
      const txns = Array.isArray(rc.transactions) && rc.transactions.length ? rc.transactions : null;
      if (txns) {
        for (const t of txns) {
          const price = (t.price?.amount ?? 0) / (t.price?.divisor || 100);
          if (!(price > 0)) continue;
          rows.push({
            date,
            product: String(t.title || "etsy item").slice(0, 60),
            qty: Math.max(1, t.quantity | 0),
            price,
            customer,
            fee: 0,
            channel: "etsy",
          });
        }
      } else {
        const gt = (rc.grandtotal?.amount ?? 0) / (rc.grandtotal?.divisor || 100);
        if (gt > 0) rows.push({ date, product: "etsy order", qty: 1, price: gt, customer, fee: 0, channel: "etsy" });
      }
    }
    if (receipts.length < 100) break;
    offset += 100;
  }
  return { rows, cred };
}

/* --------------------------- Shopify OAuth -------------------------------
   "Connect with Shopify": the merchant enters their shop, signs in on
   Shopify's own admin, approves read scopes; we HMAC-verify the callback,
   exchange the code for an OFFLINE access token (no expiry), and seal it in
   the {shop, token} shape the existing shopifyAdapter already pulls. Config:
   SHOPIFY_CLIENT_ID (var) + SHOPIFY_CLIENT_SECRET (secret). */
const SHOPIFY_OAUTH_SCOPES = "read_orders,read_products";
const SHOPIFY_REDIRECT = "https://counsel-cloud.fantasy-labai.workers.dev/v1/oauth/shopify/callback";

// Normalize "shop" or "shop.myshopify.com" -> validated subdomain, or null.
function shopifySubdomain(raw) {
  const m = /^([a-z0-9][a-z0-9-]{0,59})(\.myshopify\.com)?$/i.exec(String(raw || "").trim().toLowerCase());
  return m ? m[1] : null;
}
function shopifyAuthorizeUrl(env, sub, state) {
  const u = new URL(`https://${sub}.myshopify.com/admin/oauth/authorize`);
  u.searchParams.set("client_id", env.SHOPIFY_CLIENT_ID || "");
  u.searchParams.set("scope", SHOPIFY_OAUTH_SCOPES);
  u.searchParams.set("redirect_uri", SHOPIFY_REDIRECT);
  u.searchParams.set("state", state);
  return u.toString();
}
// Verify the callback really came from Shopify: HMAC-SHA256 of the sorted
// query (minus hmac) with the app secret.
async function shopifyVerifyHmac(env, url) {
  const given = url.searchParams.get("hmac");
  if (!given || !env.SHOPIFY_CLIENT_SECRET) return false;
  const pairs = [...url.searchParams.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const key = await crypto.subtle.importKey("raw", enc.encode(env.SHOPIFY_CLIENT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(pairs));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time-ish compare
  if (hex.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
async function shopifyExchange(env, sub, code) {
  const r = await fetch(`https://${sub}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET, code }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(String(j.errors || j.error || `shopify_${r.status}`).slice(0, 120));
  return { shop: sub, token: j.access_token };
}

/* ------------------------- signed execution ------------------------------
   Counsel's hands, under contract law: the owner SIGNS a specific change,
   the executor performs it via the provider's API with a before-snapshot,
   and a watchdog cron evaluates a measured rollback trigger every tick —
   auto-reverting and telling the owner if reality breaks the floor the
   engines set. Prices and messages, never money. Every action lives in an
   immutable-ish ledger under the account. */

const shopifyApi = (cred) => `https://${cred.shop}.myshopify.com/admin/api/2026-07`;

async function shopifyFindProduct(cred, query) {
  // exact-title first, then a contains-match over the first 100
  const h = { "X-Shopify-Access-Token": cred.token };
  let r = await fetch(`${shopifyApi(cred)}/products.json?title=${encodeURIComponent(query)}&limit=5`, { headers: h });
  let list = r.ok ? (await r.json()).products ?? [] : [];
  if (!list.length) {
    r = await fetch(`${shopifyApi(cred)}/products.json?limit=100`, { headers: h });
    const all = r.ok ? (await r.json()).products ?? [] : [];
    const q = query.toLowerCase();
    list = all.filter((p2) => String(p2.title).toLowerCase().includes(q));
  }
  const p2 = list[0];
  if (!p2 || !p2.variants?.length) return null;
  return {
    productId: String(p2.id),
    variantId: String(p2.variants[0].id),
    title: String(p2.title).slice(0, 80),
    currentPrice: parseFloat(p2.variants[0].price),
  };
}

async function shopifySetPrice(cred, variantId, price) {
  const r = await fetch(`${shopifyApi(cred)}/variants/${variantId}.json`, {
    method: "PUT",
    headers: { "X-Shopify-Access-Token": cred.token, "content-type": "application/json" },
    body: JSON.stringify({ variant: { id: Number(variantId), price: String(price) } }),
  });
  if (r.status === 403 || r.status === 401) {
    throw new Error("Shopify refused the write — the connection needs the write_products scope. Add it to your app/custom-app, reconnect, and sign again.");
  }
  if (!r.ok) throw new Error(`shopify_${r.status}: ${(await r.text()).slice(0, 100)}`);
  return true;
}

async function readActions(env, acctId) {
  try { return JSON.parse((await env.ACCOUNTS.get(`act:${acctId}`)) ?? "[]"); } catch { return []; }
}
async function writeActions(env, acctId, list) {
  await env.ACCOUNTS.put(`act:${acctId}`, JSON.stringify(list.slice(-50)));
}

/* the watchdog: evaluate every armed action's trigger against real sales */
async function runWatchdog(env) {
  const list = await env.ACCOUNTS.list({ prefix: "acct:", limit: 100 });
  for (const k of list.keys) {
    const acctId = k.name.slice(5);
    const actions = await readActions(env, acctId);
    const armed = actions.filter((a) => a.status === "armed");
    if (!armed.length) continue;
    const raw = await env.ACCOUNTS.get(k.name);
    if (!raw) continue;
    const acct = JSON.parse(raw);
    if (!acct.providers?.shopify) continue;
    let cred;
    try { cred = JSON.parse(await openToken(env, acct.providers.shopify.t)); } catch { continue; }

    // one pull covers every armed action's window
    const maxDays = Math.max(...armed.map((a) => a.trigger.days)) + 2;
    let rows = [];
    try { rows = await shopifyAdapter.pull(cred, Math.floor(Date.now() / 1000) - maxDays * 86400); } catch { continue; }
    const today = new Date().toISOString().slice(0, 10);

    let changed = false;
    for (const a of armed) {
      const ageDays = (Date.now() - a.t) / 86400000;
      if (ageDays >= (a.trigger.horizonDays ?? 30)) {
        a.status = "held"; // the window closed with no trigger — the test PASSED
        a.closedAt = new Date().toISOString();
        changed = true;
        continue;
      }
      // units/day for this product, completed days only, since execution
      const startIso = new Date(a.t).toISOString().slice(0, 10);
      const byDay = new Map();
      for (const r2 of rows) {
        if (r2.product !== a.title) continue;
        if (r2.date <= startIso || r2.date >= today) continue;
        byDay.set(r2.date, (byDay.get(r2.date) ?? 0) + r2.qty);
      }
      // walk the last `days` completed calendar days — zero-sale days count as 0
      let consecutiveBelow = 0;
      for (let d = 1; d <= a.trigger.days; d++) {
        const iso = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
        if (iso <= startIso) break;
        const units = byDay.get(iso) ?? 0;
        if (units < a.trigger.minDaily) consecutiveBelow++;
        else break;
      }
      const elapsedFull = Math.floor(ageDays) - 1;
      if (consecutiveBelow >= a.trigger.days && elapsedFull >= a.trigger.days) {
        try {
          await shopifySetPrice(cred, a.variantId, a.from);
          a.status = "reverted_auto";
          a.closedAt = new Date().toISOString();
          a.note = `volume ran below ${a.trigger.minDaily}/day for ${a.trigger.days} straight days — price restored to ${a.from}`;
          changed = true;
        } catch (e) {
          a.note = `rollback attempt failed: ${String(e?.message || e).slice(0, 80)}`;
          changed = true;
        }
      }
    }
    if (changed) await writeActions(env, acctId, actions);
  }
}

const ADAPTERS = { stripe: stripeAdapter, square: squareAdapter, shopify: shopifyAdapter };

/* ------------------------------ demo pulse -------------------------------
   Creates FAKE sales in test/sandbox environments so a demo account visibly
   evolves between syncs. Hard-gated: refuses to touch anything that is not
   provably a test credential (sk_test_/rk_test_ for Stripe, env=sandbox for
   Square). Live keys are never written to, period. */

const PULSE_PRODUCTS = ["latte", "taco plate", "market special", "signature bundle", "custom order", "service call"];
const PULSE_CHANNELS = ["instagram", "walk-in", "market", "referral"];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// A weighted cast: a handful of regulars who buy often, a long tail of
// one-timers — so repeat-rate, at-risk and attribution engines get real
// texture instead of one flat "guest".
const PULSE_REGULARS = ["cust_maria", "cust_deshawn", "cust_kim", "cust_tony", "cust_priya"];
function pulseCustomer() {
  const r = Math.random();
  if (r < 0.45) return pick(PULSE_REGULARS);                       // 45%: a regular returns
  return `cust_${Math.floor(Math.random() * 60).toString().padStart(2, "0")}`; // the long tail
}

async function pulseStripe(cred, n) {
  if (!/^(sk|rk)_test_/.test(cred.key)) return 0; // live key -> absolute no
  let made = 0;
  for (let i = 0; i < n; i++) {
    const product = pick(PULSE_PRODUCTS);
    const body = new URLSearchParams({
      amount: String(800 + Math.floor(Math.random() * 13700)), // $8–$145
      currency: "usd",
      confirm: "true",
      payment_method: "pm_card_visa",
      "payment_method_types[]": "card",
      description: product,
      "metadata[product]": product,
      "metadata[channel]": pick(PULSE_CHANNELS),
      "metadata[customer]": pulseCustomer(),
    });
    const r = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: { Authorization: `Bearer ${cred.key}`, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (r.ok) made++;
  }
  return made;
}

async function pulseSquare(cred, n) {
  if (cred.env !== "sandbox") return 0; // production -> absolute no
  let made = 0;
  for (let i = 0; i < n; i++) {
    const r = await fetch("https://connect.squareupsandbox.com/v2/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cred.token}`,
        "Square-Version": "2024-01-18",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source_id: "cnon:card-nonce-ok", // sandbox test nonce
        idempotency_key: crypto.randomUUID(),
        amount_money: { amount: 800 + Math.floor(Math.random() * 13700), currency: "USD" },
        note: pick(PULSE_PRODUCTS),
      }),
    });
    if (r.ok) made++;
  }
  return made;
}


/* --------------------------- seeded history ------------------------------
   Months of realistic canonical rows so a brand-new test account has a
   full story to analyze — WITH planted findings for the engines to
   discover honestly: a +8% price change (elasticity), a spike day
   (sentinel ceiling), a creeping subscription and a duplicate charge
   (the audit), recurring customers throughout (survival/cohorts).
   Stored in the vault, merged into every sync AHEAD of live rows.
   Never written to any provider; refused when a LIVE credential exists. */

function generateBackfill(days) {
  const charges = [];
  const expenses = [];
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const wdFactor = [0.7, 0.85, 0.9, 1.0, 1.1, 1.5, 1.45]; // Sun..Sat, weekend business
  const prices = { latte: 6.5, "taco plate": 14, "market special": 22, "signature bundle": 38, "custom order": 55, "service call": 95 };
  const priceChangeDay = Math.floor(days / 2); // "taco plate" +8% halfway in

  for (let back = days; back >= 1; back--) {
    const d = new Date(today.getTime() - back * 86400000);
    const date = iso(d);
    const wf = wdFactor[d.getDay()];
    const growth = 1 + (0.15 * (days - back)) / days;           // gentle uptrend
    const spike = back === 3 ? 2.6 : 1;                          // the ceiling-break day
    let n = Math.round((3 + Math.random() * 5) * wf * growth * spike);
    if (Math.random() < 0.04) n = 0;                             // the odd closed day
    for (let i = 0; i < n; i++) {
      const product = pick(PULSE_PRODUCTS);
      let unit = prices[product] ?? 15;
      if (product === "taco plate" && back <= priceChangeDay) unit = Math.round(unit * 1.08 * 100) / 100;
      const qty = Math.random() < 0.25 ? 2 : 1;
      charges.push({
        date, product, qty,
        price: Math.round(unit * (0.95 + Math.random() * 0.1) * 100) / 100,
        customer: pulseCustomer(),
        fee: Math.round((unit * qty * 0.029 + 0.3) * 100) / 100,
        channel: pick(PULSE_CHANNELS),
      });
    }

    const dom = d.getDate();
    if (dom === 1) expenses.push({ d: date, vendor: "Rent — commissary", amount: 1800, cat: "rent" });
    if (dom === 15 || dom === 28) expenses.push({ d: date, vendor: "Payroll run", amount: 1400, cat: "payroll" });
    if (d.getDay() === 1) expenses.push({ d: date, vendor: "Restock Supply Co", amount: Math.round(240 + Math.random() * 140), cat: "supplies" });
    if (dom === 5) {
      expenses.push({ d: date, vendor: "CloudPOS", amount: 49, cat: "software" });
      // the monotone creep the audit is built to catch
      const monthsIn = Math.floor((days - back) / 30);
      expenses.push({ d: date, vendor: "MarketingApp Pro", amount: 29 + monthsIn * 5, cat: "software" });
    }
    if (dom === 12 && back <= 40 && back >= 33) {
      // the planted duplicate — same vendor, same amount, same day
      expenses.push({ d: date, vendor: "InsuranceCo Monthly", amount: 210, cat: "insurance" });
      expenses.push({ d: date, vendor: "InsuranceCo Monthly", amount: 210, cat: "insurance" });
    } else if (dom === 12) {
      expenses.push({ d: date, vendor: "InsuranceCo Monthly", amount: 210, cat: "insurance" });
    }
  }
  return { charges, expenses };
}

/* ------------------------------- Plaid ---------------------------------
   Bank data via Plaid Link: the user authenticates with their bank in
   Plaid's own UI (we never see credentials), we exchange the public_token
   for an access_token, seal it in the vault, and each sync converts bank
   outflows into canonical expense rows. Config: PLAID_CLIENT_ID +
   PLAID_ENV (vars) + PLAID_SECRET (wrangler secret). */

const PLAID_HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

async function plaidCall(env, path, body) {
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) {
    throw new Error("Plaid not configured — set PLAID_SECRET via `npx wrangler secret put PLAID_SECRET`");
  }
  const host = PLAID_HOSTS[env.PLAID_ENV || "sandbox"];
  const r = await fetch(`${host}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, ...body }),
  });
  const j = await r.json();
  if (!r.ok) {
    const code = j?.error_code || `plaid_${r.status}`;
    if (code === "PRODUCT_NOT_READY") throw new Error("bank data still preparing at Plaid — press Sync again in ~30s");
    throw new Error(`${code}: ${String(j?.error_message || "").slice(0, 100)}`);
  }
  return j;
}

// Full stateless pull each sync (matches replace-the-store semantics):
// walk /transactions/sync from an empty cursor, keep outflows as expenses.
async function plaidExpenses(env, cred) {
  const out = [];
  let cursor = "";
  for (let page = 0; page < 12; page++) {
    const j = await plaidCall(env, "/transactions/sync", {
      access_token: cred.access_token,
      cursor,
      count: 500,
    });
    for (const t of j.added ?? []) {
      if (t.pending) continue;
      if (typeof t.amount !== "number" || t.amount <= 0) continue; // Plaid: positive = money out
      out.push({
        d: t.date,
        vendor: String(t.merchant_name || t.name || "unknown").slice(0, 60),
        amount: Math.round(t.amount * 100) / 100,
        cat: String(t.personal_finance_category?.primary || (t.category && t.category[0]) || "other").toLowerCase().replace(/_/g, " "),
      });
    }
    cursor = j.next_cursor;
    if (!j.has_more) break;
  }
  out.sort((a, b) => (a.d < b.d ? -1 : 1));
  return out.slice(-3000);
}

async function hasLiveCredential(env, acct) {
  // Inspect the actual sealed credentials — same standard as the pulse gate.
  // Stripe: anything not sk_test_/rk_test_ is live. Square: production env.
  // Shopify: a shpat token is a real store — treated as live, full stop.
  for (const prov of Object.keys(acct.providers)) {
    try {
      const cred = JSON.parse(await openToken(env, acct.providers[prov].t));
      if (prov === "stripe" && !/^(sk|rk)_test_/.test(cred.key)) return true;
      if (prov === "square" && cred.env !== "sandbox") return true;
      if (prov === "shopify") return true;
      if (prov === "plaid" && cred.env === "production") return true;
    } catch {
      return true; // unreadable credential -> refuse, err on the safe side
    }
  }
  return false;
}

async function seedAccount(env, acct, n) {
  const seeded = {};
  for (const provider of Object.keys(acct.providers)) {
    try {
      const cred = JSON.parse(await openToken(env, acct.providers[provider].t));
      if (provider === "stripe") seeded.stripe = await pulseStripe(cred, n);
      if (provider === "square") seeded.square = await pulseSquare(cred, n);
      // shopify: no pulse — creating orders needs write scope we never ask for
    } catch {
      /* pulse is best-effort; sync surfaces real errors */
    }
  }
  return seeded;
}

async function runPulse(env) {
  const list = await env.ACCOUNTS.list({ prefix: "acct:", limit: 100 });
  for (const k of list.keys) {
    const raw = await env.ACCOUNTS.get(k.name);
    if (!raw) continue;
    const acct = JSON.parse(raw);
    if (!acct.pulse) continue;
    await seedAccount(env, acct, 1 + Math.floor(Math.random() * 3)); // 1–3 sales per tick
  }
}

/* --------------------------------- routes -------------------------------- */

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/" || path === "/v1") {
        return json(req, 200, {
          service: "counsel-cloud",
          docs: "tokens encrypted at rest · business data pass-through only, never stored",
          providers: PROVIDERS,
        });
      }

      // -- create account (no auth) --
      if (path === "/v1/account" && req.method === "POST") {
        if (await limited(env.RL_STRICT, `mint:${clientKey(req)}`, 10)) return tooMany(req);
        const accountId = `ca_${randHex(9)}`;
        const accountSecret = `cs_${randHex(18)}`;
        await saveAcct(env, accountId, {
          sh: await sha256hex(accountSecret),
          created: new Date().toISOString().slice(0, 10),
          providers: {},
        });
        return json(req, 200, { accountId, accountSecret });
      }

      // -- crash telemetry: error name + message ONLY, never data (no auth:
      //    a crashed client may have none; body hard-capped) --
      if (path === "/v1/telemetry" && req.method === "POST") {
        if (await limited(env.RL_STRICT, `tel:${clientKey(req)}`, 10)) return tooMany(req);
        const body = (await readBody(req)) ?? {};
        const entry = {
          t: new Date().toISOString(),
          name: String(body.name ?? "?").slice(0, 60),
          msg: String(body.msg ?? "").slice(0, 200),
          path: String(body.path ?? "").slice(0, 60),
        };
        try {
          const cur = JSON.parse((await env.ACCOUNTS.get("telemetry:recent")) ?? "[]");
          cur.unshift(entry);
          await env.ACCOUNTS.put("telemetry:recent", JSON.stringify(cur.slice(0, 50)));
        } catch { /* best effort */ }
        return json(req, 200, { ok: true });
      }

      // -- OAuth callbacks arrive unauthenticated (browser redirects) — an IP
      //    gate keeps state-token guessing glacial --
      if (path.startsWith("/v1/oauth/") && req.method === "GET") {
        if (await limited(env.RL_NORM, `oauth:${clientKey(req)}`, 60)) return tooMany(req);
      }

      // Native app flows end on a small page instead of a web redirect —
      // the in-app browser sheet closes and the app picks up the new
      // provider by polling cloudStatus. parseState tolerates both the
      // legacy raw-id KV values and the JSON {id, native, ...} form.
      const parseState = (raw) => {
        if (!raw) return null;
        try { const p = JSON.parse(raw); if (p && p.id) return p; } catch { /* raw id */ }
        return { id: raw, native: false };
      };
      const nativeDone = (ok, provider) => new Response(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Counsel</title>` +
        `<body style="background:#0f1511;color:#ecf1e8;font-family:-apple-system,'Inter',sans-serif;display:grid;place-items:center;height:100vh;margin:0;text-align:center">` +
        `<div><div style="font-size:44px;color:${ok ? "#c9f36a" : "#e08a76"}">${ok ? "\u2713" : "\u2715"}</div>` +
        `<h2 style="font-weight:600;margin:10px 0 6px">${ok ? `${provider} connected` : `${provider} connection failed`}</h2>` +
        `<p style="color:#9aa89c;font-size:15px">Close this window and return to Counsel${ok ? " \u2014 your data is on its way." : " and try again."}</p></div>`,
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

      // -- Square OAuth callback: browser redirect from Square, no auth header;
      //    the state we minted maps back to the device account. --
      if (path === "/v1/oauth/square/callback" && req.method === "GET") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const back = (q) => new Response(null, { status: 302, headers: { Location: `${APP_REDIRECT}?${q}` } });
        if (!code || !state) return back("error=square");
        const st = parseState(await env.ACCOUNTS.get(`oauthstate:${state}`));
        if (!st) return back("error=square_expired");
        const acctId = st.id;
        const finish = (ok, q) => st.native ? nativeDone(ok, "Square") : back(q);
        await env.ACCOUNTS.delete(`oauthstate:${state}`);
        try {
          const raw = await env.ACCOUNTS.get(`acct:${acctId}`);
          if (!raw) return finish(false, "error=square_account");
          const acct = JSON.parse(raw);
          const cred = await squareExchange(env, code);
          acct.providers.square = { t: await sealToken(env, JSON.stringify(cred)), at: new Date().toISOString().slice(0, 10) };
          await saveAcct(env, acctId, acct);
          return finish(true, "connected=square");
        } catch (e) {
          return finish(false, `error=${encodeURIComponent(String(e?.message || e).slice(0, 80))}`);
        }
      }

      // -- Etsy OAuth callback (PKCE): browser redirect, no auth header --
      if (path === "/v1/oauth/etsy/callback" && req.method === "GET") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const back = (q) => new Response(null, { status: 302, headers: { Location: `${APP_REDIRECT}?${q}` } });
        if (!code || !state) return back("error=etsy");
        const st = parseState(await env.ACCOUNTS.get(`oauthstate:${state}`));
        if (!st) return back("error=etsy_expired");
        const finish = (ok, q) => st.native ? nativeDone(ok, "Etsy") : back(q);
        await env.ACCOUNTS.delete(`oauthstate:${state}`);
        try {
          const { id: acctId, verifier } = st;
          const araw = await env.ACCOUNTS.get(`acct:${acctId}`);
          if (!araw) return finish(false, "error=etsy_account");
          const acct = JSON.parse(araw);
          const cred = await etsyTokenCall(env, {
            grant_type: "authorization_code",
            client_id: env.ETSY_CLIENT_ID,
            redirect_uri: ETSY_REDIRECT,
            code,
            code_verifier: verifier,
          });
          acct.providers.etsy = { t: await sealToken(env, JSON.stringify(cred)), at: new Date().toISOString().slice(0, 10) };
          await saveAcct(env, acctId, acct);
          return finish(true, "connected=etsy");
        } catch (e) {
          return finish(false, `error=${encodeURIComponent(String(e?.message || e).slice(0, 80))}`);
        }
      }

      // -- Shopify OAuth callback: HMAC-verified browser redirect --
      if (path === "/v1/oauth/shopify/callback" && req.method === "GET") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const shopParam = url.searchParams.get("shop");
        const back = (q) => new Response(null, { status: 302, headers: { Location: `${APP_REDIRECT}?${q}` } });
        if (!env.SHOPIFY_CLIENT_SECRET) return back("error=shopify_config");
        if (!code || !state || !shopParam) return back("error=shopify");
        if (!(await shopifyVerifyHmac(env, url))) return back("error=shopify_hmac");
        const sub = shopifySubdomain(shopParam);
        if (!sub) return back("error=shopify_shop");
        const st = parseState(await env.ACCOUNTS.get(`oauthstate:${state}`));
        if (!st) return back("error=shopify_expired");
        const acctId = st.id;
        const finish = (ok, q) => st.native ? nativeDone(ok, "Shopify") : back(q);
        await env.ACCOUNTS.delete(`oauthstate:${state}`);
        try {
          const raw = await env.ACCOUNTS.get(`acct:${acctId}`);
          if (!raw) return finish(false, "error=shopify_account");
          const acct = JSON.parse(raw);
          const cred = await shopifyExchange(env, sub, code);
          acct.providers.shopify = { t: await sealToken(env, JSON.stringify(cred)), at: new Date().toISOString().slice(0, 10) };
          await saveAcct(env, acctId, acct);
          return finish(true, "connected=shopify");
        } catch (e) {
          return finish(false, `error=${encodeURIComponent(String(e?.message || e).slice(0, 80))}`);
        }
      }

      // -- everything below requires auth --
      // (failed auth attempts burn the caller's IP budget — brute force stalls)
      if (await limited(env.RL_NORM, `ip:${clientKey(req)}`, 60)) return tooMany(req);
      const auth = await requireAuth(req, env);
      if (!auth) return json(req, 401, { error: "invalid or missing credentials" });
      const { id, acct } = auth;

      // per-account tiers on top of the IP gate
      if (path === "/v1/sync") {
        if (await limited(env.RL_SYNC, `sync:${id}`, 15)) return tooMany(req);
      } else if (path.startsWith("/v1/actions") || path === "/v1/backfill" || path === "/v1/pulse") {
        if (await limited(env.RL_STRICT, `acct:${id}`, 10)) return tooMany(req);
      }

      if (path === "/v1/account" && req.method === "DELETE") {
        await env.ACCOUNTS.delete(`bf:${id}`);
        await env.ACCOUNTS.delete(`act:${id}`);
        await env.ACCOUNTS.delete(`acct:${id}`);
        return json(req, 200, { ok: true, deleted: id });
      }

      if (path === "/v1/connections" && req.method === "GET") {
        return json(req, 200, {
          providers: Object.keys(acct.providers),
          created: acct.created,
          pulse: !!acct.pulse,
          backfill: acct.bf ?? null,
        });
      }

      // -- demo pulse: fake sales on a cron, TEST/SANDBOX credentials only --
      if (path === "/v1/pulse" && req.method === "POST") {
        const body = (await readBody(req)) ?? {};
        acct.pulse = !!body.on;
        await saveAcct(env, id, acct);
        let seeded = {};
        if (acct.pulse) seeded = await seedAccount(env, acct, 6); // instant burst so the next sync shows life
        return json(req, 200, { ok: true, pulse: acct.pulse, seeded });
      }

      // -- seeded history: months of canonical test data in the vault --
      if (path === "/v1/backfill" && req.method === "POST") {
        if (await hasLiveCredential(env, acct)) {
          return json(req, 403, { error: "seeded history is for test/sandbox accounts — a live credential is connected" });
        }
        const body = (await readBody(req)) ?? {};
        const days = Math.min(365, Math.max(30, Number(body.days) || 90));
        const bf = generateBackfill(days);
        await env.ACCOUNTS.put(`bf:${id}`, JSON.stringify(bf));
        acct.bf = { c: bf.charges.length, e: bf.expenses.length, days };
        await saveAcct(env, id, acct);
        return json(req, 200, { ok: true, charges: bf.charges.length, expenses: bf.expenses.length, days });
      }
      if (path === "/v1/backfill" && req.method === "DELETE") {
        await env.ACCOUNTS.delete(`bf:${id}`);
        delete acct.bf;
        await saveAcct(env, id, acct);
        return json(req, 200, { ok: true });
      }

      // -- Etsy OAuth start (PKCE): mint state+verifier, return authorize URL --
      if (path === "/v1/oauth/etsy/start" && req.method === "POST") {
        if (!env.ETSY_CLIENT_ID) return json(req, 400, { error: "Etsy not configured — set ETSY_CLIENT_ID (var)" });
        const etBody = (await readBody(req)) ?? {};
        const state = `et_${randHex(16)}`;
        const verifier = pkceVerifier();
        const challenge = await pkceChallenge(verifier);
        await env.ACCOUNTS.put(`oauthstate:${state}`, JSON.stringify({ id, verifier, native: !!etBody.native }), { expirationTtl: 600 });
        return json(req, 200, { url: etsyAuthorizeUrl(env, state, challenge) });
      }

      // -- Shopify OAuth start: needs the shop; mint state, return authorize URL --
      if (path === "/v1/oauth/shopify/start" && req.method === "POST") {
        if (!env.SHOPIFY_CLIENT_ID) return json(req, 400, { error: "Shopify OAuth not configured — set SHOPIFY_CLIENT_ID (var) + SHOPIFY_CLIENT_SECRET (secret)" });
        const body = (await readBody(req)) ?? {};
        const sub = shopifySubdomain(body.shop);
        if (!sub) return json(req, 400, { error: "enter your shop, e.g. your-shop (from your-shop.myshopify.com)" });
        const state = `sh_${randHex(16)}`;
        await env.ACCOUNTS.put(`oauthstate:${state}`, JSON.stringify({ id, native: !!body.native }), { expirationTtl: 600 });
        return json(req, 200, { url: shopifyAuthorizeUrl(env, sub, state) });
      }

      // -- Square OAuth start: mint state -> account, return the authorize URL --
      if (path === "/v1/oauth/square/start" && req.method === "POST") {
        if (!env.SQUARE_CLIENT_ID) return json(req, 400, { error: "Square OAuth not configured — set SQUARE_CLIENT_ID (var) + SQUARE_CLIENT_SECRET (secret)" });
        const sqBody = (await readBody(req)) ?? {};
        const state = `sq_${randHex(16)}`;
        await env.ACCOUNTS.put(`oauthstate:${state}`, JSON.stringify({ id, native: !!sqBody.native }), { expirationTtl: 600 });
        return json(req, 200, { url: squareAuthorizeUrl(env, state) });
      }

      // -- Plaid Link: token to open the bank picker, then the exchange --
      if (path === "/v1/plaid/link-token" && req.method === "POST") {
        const j = await plaidCall(env, "/link/token/create", {
          user: { client_user_id: id },
          client_name: "Counsel",
          products: ["transactions"],
          country_codes: ["US"],
          language: "en",
        });
        return json(req, 200, { link_token: j.link_token, env: env.PLAID_ENV || "sandbox" });
      }
      if (path === "/v1/plaid/exchange" && req.method === "POST") {
        const body = await readBody(req);
        if (!body?.public_token) return json(req, 400, { error: "public_token required" });
        const j = await plaidCall(env, "/item/public_token/exchange", { public_token: body.public_token });
        const cred = { access_token: j.access_token, item_id: j.item_id, env: env.PLAID_ENV || "sandbox" };
        acct.providers.plaid = { t: await sealToken(env, JSON.stringify(cred)), at: new Date().toISOString().slice(0, 10) };
        await saveAcct(env, id, acct);
        return json(req, 200, { ok: true, provider: "plaid" });
      }

      // -- signed execution: preview -> sign -> execute -> ledger -> watchdog --
      if (path === "/v1/actions/preview" && req.method === "POST") {
        const body = (await readBody(req)) ?? {};
        if (body.provider !== "shopify") return json(req, 400, { error: "price execution currently supports shopify" });
        if (!acct.providers.shopify) return json(req, 400, { error: "connect shopify first" });
        const cred = JSON.parse(await openToken(env, acct.providers.shopify.t));
        const found = await shopifyFindProduct(cred, String(body.query ?? "").slice(0, 80));
        if (!found) return json(req, 404, { error: "no product matched that name in your store" });
        return json(req, 200, { ...found, newPrice: Number(body.newPrice) || null });
      }
      if (path === "/v1/actions/execute" && req.method === "POST") {
        const b = (await readBody(req)) ?? {};
        if (b.provider !== "shopify") return json(req, 400, { error: "price execution currently supports shopify" });
        if (!acct.providers.shopify) return json(req, 400, { error: "connect shopify first" });
        const toPrice = Number(b.toPrice), fromPrice = Number(b.fromPrice);
        if (!(toPrice > 0) || !(fromPrice > 0) || !b.variantId) return json(req, 400, { error: "bad action body" });
        const trigger = {
          minDaily: Math.max(0, Number(b.trigger?.minDaily) || 0),
          days: Math.min(14, Math.max(2, Number(b.trigger?.days) || 5)),
          horizonDays: Math.min(60, Math.max(7, Number(b.trigger?.horizonDays) || 30)),
        };
        const cred = JSON.parse(await openToken(env, acct.providers.shopify.t));
        try {
          await shopifySetPrice(cred, String(b.variantId), toPrice);
        } catch (e) {
          return json(req, 400, { error: String(e?.message || e).slice(0, 180) });
        }
        const action = {
          aid: `act_${randHex(8)}`,
          t: Date.now(),
          provider: "shopify",
          title: String(b.title ?? "").slice(0, 80),
          productId: String(b.productId ?? ""),
          variantId: String(b.variantId),
          from: fromPrice,
          to: toPrice,
          trigger,
          status: "armed",
        };
        const actions = await readActions(env, id);
        actions.push(action);
        await writeActions(env, id, actions);
        return json(req, 200, { ok: true, action });
      }
      if (path === "/v1/actions/revert" && req.method === "POST") {
        const b = (await readBody(req)) ?? {};
        const actions = await readActions(env, id);
        const a = actions.find((x) => x.aid === b.aid && x.status === "armed");
        if (!a) return json(req, 404, { error: "no armed action with that id" });
        const cred = JSON.parse(await openToken(env, acct.providers.shopify.t));
        try {
          await shopifySetPrice(cred, a.variantId, a.from);
        } catch (e) {
          return json(req, 400, { error: String(e?.message || e).slice(0, 180) });
        }
        a.status = "reverted_manual";
        a.closedAt = new Date().toISOString();
        await writeActions(env, id, actions);
        return json(req, 200, { ok: true, action: a });
      }
      if (path === "/v1/actions" && req.method === "GET") {
        return json(req, 200, { actions: await readActions(env, id) });
      }

      const connect = /^\/v1\/connect\/([a-z]+)$/.exec(path);
      if (connect) {
        const provider = connect[1];
        if (!PROVIDERS.includes(provider)) return json(req, 404, { error: `unknown provider "${provider}"` });

        if (req.method === "DELETE") {
          delete acct.providers[provider];
          await saveAcct(env, id, acct);
          return json(req, 200, { ok: true, disconnected: provider });
        }

        if (req.method === "POST") {
          if (provider === "plaid") {
            return json(req, 400, { error: "banks connect via Plaid Link — use /v1/plaid/link-token" });
          }
          if (provider === "etsy") {
            return json(req, 400, { error: "Etsy connects via sign-in — use /v1/oauth/etsy/start" });
          }
          const body = await readBody(req);
          if (!body) return json(req, 400, { error: "bad body" });
          let cred;
          if (provider === "stripe") {
            if (!/^[rs]k_(test|live)_[A-Za-z0-9]{8,}$/.test(body.key || "")) {
              return json(req, 400, { error: "expected a Stripe key (rk_… restricted key recommended, sk_test_… for test mode)" });
            }
            cred = { key: body.key };
          } else if (provider === "square") {
            if (!body.token || String(body.token).length < 10) return json(req, 400, { error: "expected a Square access token" });
            cred = { token: String(body.token), env: body.env === "sandbox" ? "sandbox" : "production" };
          } else {
            const shop = String(body.shop || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\.myshopify\.com.*$/, "");
            if (!shopifyAdapter.okShop(shop) || !body.token) return json(req, 400, { error: "expected { shop, token } — shop is the *.myshopify.com prefix" });
            cred = { shop, token: String(body.token) };
          }
          const valid = await ADAPTERS[provider].validate(cred);
          if (!valid) return json(req, 401, { error: `${provider} rejected the credentials — check the key and its read scopes` });
          acct.providers[provider] = { t: await sealToken(env, JSON.stringify(cred)), at: new Date().toISOString().slice(0, 10) };
          await saveAcct(env, id, acct);
          return json(req, 200, { ok: true, provider });
        }
      }

      if (path === "/v1/sync" && req.method === "POST") {
        const body = (await readBody(req)) ?? {};
        const days = Math.min(730, Math.max(30, Number(body.days) || DEFAULT_DAYS));
        const sinceUnix = Math.floor(Date.now() / 1000) - days * 86400;
        const charges = [];
        const pulled = {};
        const errors = {};
        const liveExpenses = [];
        for (const provider of Object.keys(acct.providers)) {
          try {
            const cred = JSON.parse(await openToken(env, acct.providers[provider].t));
            if (provider === "plaid") {
              const rows = await plaidExpenses(env, cred);
              pulled.plaid = rows.length;
              liveExpenses.push(...rows);
              continue;
            }
            if (provider === "etsy") {
              const { rows, cred: fresh } = await etsyPull(env, cred, sinceUnix);
              pulled.etsy = rows.length;
              for (const r of rows) r._src = "etsy";
              charges.push(...rows);
              acct.providers.etsy.t = await sealToken(env, JSON.stringify(fresh)); // persist rotated token
              await saveAcct(env, id, acct);
              continue;
            }
            const rows = await ADAPTERS[provider].pull(cred, sinceUnix);
            pulled[provider] = rows.length;
            for (const r of rows) r._src = provider;
            charges.push(...rows);
          } catch (e) {
            errors[provider] = String(e?.message || e).slice(0, 120);
          }
        }
        // seeded history rides ahead of the live rows (all historical dates)
        let expensesOut = [];
        let seededCounts = null;
        if (acct.bf) {
          try {
            const bf = JSON.parse((await env.ACCOUNTS.get(`bf:${id}`)) ?? "null");
            if (bf) {
              charges.push(...bf.charges);
              expensesOut = bf.expenses;
              seededCounts = { charges: bf.charges.length, expenses: bf.expenses.length };
            }
          } catch { /* corrupt blob -> live rows only */ }
        }
        const dd = dedupeSources(charges);
        const cleanCharges = dd.rows
          .map(({ _src, _order, _otot, ...r }) => r)
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        expensesOut = [...expensesOut, ...liveExpenses].sort((a, b) => (a.d < b.d ? -1 : 1));
        return json(req, 200, {
          charges: cleanCharges.slice(-MAX_ROWS),
          deduped: dd.removed,
          expenses: expensesOut,
          seeded: seededCounts,
          sources: Object.keys(pulled),
          pulled,
          ...(Object.keys(errors).length ? { errors } : {}),
          note: "normalized pass-through — nothing was stored server-side",
        });
      }

      return json(req, 404, { error: "not found" });
    } catch (e) {
      return json(req, 500, { error: "internal", detail: String(e?.message || e).slice(0, 200) });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPulse(env));
    ctx.waitUntil(runWatchdog(env));
  },
};
