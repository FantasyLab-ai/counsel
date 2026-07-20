#!/usr/bin/env node
// shopify-exec-test.mjs — end-to-end proof of the signed execution rails
// against a REAL (dev) Shopify store, through the production worker:
//
//   account -> connect -> preview -> execute (+$1) -> verify -> revert -> verify -> cleanup
//
// Run it with a DEV STORE custom-app token (never a live store):
//   SHOP=your-dev-store TOKEN=shpat_xxx node tools/shopify-exec-test.mjs
//   PRODUCT="taco plate"   (optional: name filter; defaults to first product)
//
// The token comes from: dev store admin -> Settings -> Apps and sales
// channels -> Develop apps -> create app with Admin API scopes
// read_products, write_products, read_orders -> install -> reveal token.
// The token is read from the environment and never printed or stored.

const BASE = process.env.WORKER || "https://counsel-cloud.fantasy-labai.workers.dev";
const SHOP = process.env.SHOP;
const TOKEN = process.env.TOKEN;
const PRODUCT = process.env.PRODUCT || "";

if (!SHOP || !TOKEN) {
  console.error("usage: SHOP=your-dev-store TOKEN=shpat_xxx node tools/shopify-exec-test.mjs");
  process.exit(2);
}

let auth = "";
const step = (name) => process.stdout.write(`\n== ${name}\n`);
const die = (msg) => { throw new Error(msg); }; // thrown, not exited — cleanup still runs

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

step("1. mint a throwaway account");
const acct = await api("POST", "/v1/account");
if (!acct.accountId) die(`account mint: ${JSON.stringify(acct)}`);
auth = `${acct.accountId}.${acct.accountSecret}`;
console.log(`   ${acct.accountId}`);

let failure = null;
try {
  step("2. connect the dev store (validates token against Shopify)");
  const conn = await api("POST", "/v1/connect/shopify", { shop: SHOP, token: TOKEN });
  if (!conn.ok) die(`connect: ${JSON.stringify(conn)}`);
  console.log(`   connected ${SHOP}.myshopify.com`);

  step(`3. preview ${PRODUCT ? `"${PRODUCT}"` : "first product"}`);
  const prev = await api("POST", "/v1/actions/preview", { provider: "shopify", query: PRODUCT });
  if (!prev.variantId) die(`preview: ${JSON.stringify(prev)}`);
  console.log(`   "${prev.title}" variant ${prev.variantId} at $${prev.currentPrice}`);
  const from = prev.currentPrice;
  const to = Math.round((from + 1) * 100) / 100;

  step(`4. execute signed price change $${from} -> $${to} (rollback trigger armed, minDaily=0 so it can't misfire)`);
  const exec = await api("POST", "/v1/actions/execute", {
    provider: "shopify",
    title: prev.title,
    productId: prev.productId,
    variantId: prev.variantId,
    fromPrice: from,
    toPrice: to,
    trigger: { minDaily: 0, days: 2, horizonDays: 7 },
  });
  if (!exec.ok) die(`execute: ${JSON.stringify(exec)}`);
  console.log(`   armed action ${exec.action.aid}`);

  step("5. verify the store actually changed");
  const check = await api("POST", "/v1/actions/preview", { provider: "shopify", query: prev.title });
  if (check.currentPrice !== to) die(`price is $${check.currentPrice}, expected $${to}`);
  console.log(`   store price is $${check.currentPrice} — write confirmed`);

  step("6. manual revert (the owner's hand-brake)");
  const rev = await api("POST", "/v1/actions/revert", { aid: exec.action.aid });
  if (!rev.ok) die(`revert: ${JSON.stringify(rev)}`);

  step("7. verify restoration");
  const check2 = await api("POST", "/v1/actions/preview", { provider: "shopify", query: prev.title });
  if (check2.currentPrice !== from) die(`price is $${check2.currentPrice}, expected $${from} restored`);
  console.log(`   store price back at $${check2.currentPrice} — rollback confirmed`);

  step("8. action ledger shows the full story");
  const led = await api("GET", "/v1/actions");
  const a = (led.actions || []).find((x) => x.aid === exec.action.aid);
  console.log(`   ${a?.aid}: ${a?.status} (${a?.from} -> ${a?.to})`);
  if (a?.status !== "reverted_manual") die("ledger status should be reverted_manual");

  console.log("\nPASS — signed execution verified end to end: write, verify, revert, ledger.");
} catch (e) {
  failure = e?.message || String(e);
} finally {
  step("9. cleanup: delete the throwaway account");
  const del = await api("DELETE", "/v1/account");
  console.log(`   ${del.ok ? "deleted" : "cleanup failed — delete manually"}`);
}
if (failure) { console.error(`
FAIL: ${failure}`); process.exit(1); }
