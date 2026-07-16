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

const PROVIDERS = ["stripe", "square", "shopify"];
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
          customer: String(c.customer || c.receipt_email || "guest").slice(0, 60),
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

const ADAPTERS = { stripe: stripeAdapter, square: squareAdapter, shopify: shopifyAdapter };

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
        const accountId = `ca_${randHex(9)}`;
        const accountSecret = `cs_${randHex(18)}`;
        await saveAcct(env, accountId, {
          sh: await sha256hex(accountSecret),
          created: new Date().toISOString().slice(0, 10),
          providers: {},
        });
        return json(req, 200, { accountId, accountSecret });
      }

      // -- everything below requires auth --
      const auth = await requireAuth(req, env);
      if (!auth) return json(req, 401, { error: "invalid or missing credentials" });
      const { id, acct } = auth;

      if (path === "/v1/account" && req.method === "DELETE") {
        await env.ACCOUNTS.delete(`acct:${id}`);
        return json(req, 200, { ok: true, deleted: id });
      }

      if (path === "/v1/connections" && req.method === "GET") {
        return json(req, 200, {
          providers: Object.keys(acct.providers),
          created: acct.created,
        });
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
        for (const provider of Object.keys(acct.providers)) {
          try {
            const cred = JSON.parse(await openToken(env, acct.providers[provider].t));
            const rows = await ADAPTERS[provider].pull(cred, sinceUnix);
            pulled[provider] = rows.length;
            charges.push(...rows);
          } catch (e) {
            errors[provider] = String(e?.message || e).slice(0, 120);
          }
        }
        charges.sort((a, b) => (a.date < b.date ? -1 : 1));
        return json(req, 200, {
          charges: charges.slice(-MAX_ROWS),
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
};
