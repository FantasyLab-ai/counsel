# PLATFORMS.md — every integration, what to register, and what keys you need

The pipeline is: **provider → counsel-cloud (normalizes, stores only your
encrypted token) → the device (all analysis on-device)**. Engines consume two
canonical shapes, so a platform is "integrated" the moment something can
produce those rows:

```
charges.csv  — date, amount, product, qty, unit_price, customer_id, fee
expenses.csv — date, vendor, amount, category
```

Three tiers of connection, in order of effort:

1. **CSV export** — works for every platform below, today, zero keys.
2. **Key-paste (LIVE NOW)** — the user mints a read-only key in their own
   dashboard and pastes it once. No app registration, no review queues.
3. **One-tap OAuth** — needs a registered developer app per platform (the
   items below). Do these when you want "Connect" to be a single tap.

---

## Phase A — LIVE NOW, nothing to register

These work today through counsel-cloud key-paste. **You need zero developer
accounts** — each merchant self-serves in their own dashboard.

### Stripe ✅ (payments — the wedge)
- **User mints:** Dashboard → Developers → API keys → **Create restricted key**
  → read on `Charges` (+ `Balance` if they want fees captured). Test mode:
  plain `sk_test_…` works.
- **We store:** the restricted key (encrypted). **Scopes:** read-only.
- **Your test:** create a free Stripe account → toggle Test mode → copy
  `sk_test_…` → Power Up → Go live → Connect Stripe → Sync. Use the
  Dashboard's "create test payment" (or the CLI) to seed charges.

### Square ✅ (POS — food trucks, cafés, salons)
- **User mints:** [developer.squareup.com](https://developer.squareup.com/apps)
  → "+" (their own free app) → Production → **Access token**. Sandbox tokens
  work too (choose *sandbox* env).
- **We call:** `GET /v2/payments` (read-only). Fees come from
  `processing_fee` when present.

### Shopify ✅ (ecommerce)
- **User mints:** Admin → Settings → Apps and sales channels → **Develop
  apps** → Create app → Configure Admin API scopes → `read_orders` → Install →
  reveal `shpat_…` token. Needs the shop name (`your-shop` from
  `your-shop.myshopify.com`).
- **We call:** `GET /admin/api/2024-07/orders.json` — per-line-item rows with
  qty and unit price (feeds the newsvendor + elasticity engines properly).

---

## Phase B — register these developer apps (the one-tap-OAuth unlock)

Register in this order. Each gives you a **client_id + client_secret** that go
into counsel-cloud as Wrangler secrets (`npx wrangler secret put …` — never in
the repo).

### 1. Stripe Connect (upgrade the wedge)
- **Where:** Dashboard → Settings → Connect → complete platform profile.
- **You get:** a Connect `client_id` (`ca_…`); your existing secret key signs.
- **Review:** none for Standard accounts (OAuth flow). **Cost:** free.
- **Why:** replaces key-paste with "Connect with Stripe" one tap.

### 2. Plaid (bank transactions → the expenses side + the audit engine)
- **Where:** [dashboard.plaid.com](https://dashboard.plaid.com/signup) → apply
  for Production (Sandbox is instant).
- **You get:** `client_id` + `secret` per environment. **Products:**
  `transactions`. **Review:** production approval ~days, asks for a privacy
  policy URL (you have PRIVACY.md — publish it on the site).
- **Cost:** free sandbox; production is pay-per-item (~$0.30/connected
  account/mo for transactions at small scale).
- **Why this is #2:** expenses are the missing half of the ladder — it unlocks
  B5 audit, true burn, margins without guessing.

### 3. Square OAuth
- **Where:** the same app in developer.squareup.com → OAuth tab.
- **You get:** Application ID + Secret; scopes `PAYMENTS_READ`,
  `ORDERS_READ`, `ITEMS_READ`, `MERCHANT_PROFILE_READ`.
- **Review:** app-marketplace listing optional; direct OAuth needs none.

### 4. Etsy (the maker persona)
- **Where:** [etsy.com/developers](https://www.etsy.com/developers/register)
  → create app.
- **You get:** keystring + shared secret (OAuth 2.0 + PKCE). **Scopes:**
  `transactions_r`, `shops_r`. **Review:** "commercial" approval queue —
  apply early, it can take weeks. Personal-access works immediately for
  your own shop testing.

### 5. Shopify public app (only when you outgrow custom-app tokens)
- **Where:** [partners.shopify.com](https://partners.shopify.com) (free) →
  Apps → Create.
- **You get:** API key + secret; OAuth with `read_orders`, `read_products`,
  `read_inventory_levels` (that last one unlocks live Stock & Shipments).
- **Review:** only if you list in the App Store; unlisted distribution is
  self-serve.

### 6. QuickBooks Online (expenses for service businesses)
- **Where:** [developer.intuit.com](https://developer.intuit.com) → create
  app → QuickBooks Online Accounting API.
- **You get:** Client ID + Secret (OAuth 2.0). **Scope:**
  `com.intuit.quickbooks.accounting` (read).
- **Review:** production keys need a security questionnaire (~1–2 weeks).

### 7. Xero (same slot as QBO, different geography)
- **Where:** [developer.xero.com](https://developer.xero.com/app/manage) →
  New app. **You get:** Client ID + Secret; scopes
  `accounting.transactions.read`, `accounting.reports.read`.
- **Review:** none for <25 connections (uncertified apps) — perfect for beta.

### 8. PayPal
- **Where:** [developer.paypal.com](https://developer.paypal.com/dashboard) →
  Apps & Credentials → Create app.
- **You get:** Client ID + Secret; call the Transaction Search API
  (needs enabling on the live app). **Review:** light; transaction search
  requires the account to opt in.

---

## Phase C — later or CSV-only (register only when the persona demands it)

| Platform | Persona | Path | Notes |
|---|---|---|---|
| **Toast** | restaurant | partner API | closed partner program — apply at pos.toasttab.com/partners; until then: nightly Sales Summary CSV export works |
| **Clover** | restaurant/retail | OAuth app | developer.clover.com — REST API, self-serve keys, straightforward |
| **Jobber** | landscaper/trades | OAuth app | developer.getjobber.com — GraphQL API, free dev account |
| **Housecall Pro** | trades | API key | API on Max plan only — most users will use CSV export |
| **FreshBooks** | freelancer | OAuth app | my.freshbooks.com/#/developer — self-serve |
| **Wave** | freelancer | — | API deprecated for new apps → CSV path |
| **AfterShip** | ecommerce shipping | user API key | key-paste model like Phase A — user's own key from admin.aftership.com |
| **Shippo** | ecommerce shipping | user API key | same — key-paste ready |
| **Meta / Instagram** | marketing | Meta app + Business verification | the long one: app review + business verification (weeks). The post log + UTM links already cover the insight without it. Do LAST. |
| **TikTok** | marketing | TikTok for Developers app | audited; same story — post log covers it |
| **Pinterest** | marketing | Pinterest app | trial access instant, standard access reviewed |
| **Google Business Profile** | reviews | GCP project + OAuth | needs Google's API access request form (weeks); reviews CSV via Takeout meanwhile |
| **Yelp** | reviews | Fusion API key | instant key, but reviews are limited to 3 excerpts — low value |
| **DoorDash / UberEats** | ghost kitchen | partner APIs | closed programs; payout CSV export works today |
| **Airbnb** | STR host | — | no public API; payout CSV export |
| **Etsy Ads / Meta Ads** | marketing spend | (with the above apps) | lands as expenses rows: `date, vendor, amount, category=ads` |

---

## counsel-cloud secrets checklist (as apps get registered)

```
npx wrangler secret put ENC_KEY            # set ✅ (rotating it = users reconnect)
npx wrangler secret put STRIPE_CLIENT_ID   # Phase B-1
npx wrangler secret put PLAID_CLIENT_ID    # Phase B-2
npx wrangler secret put PLAID_SECRET       # Phase B-2
npx wrangler secret put SQUARE_APP_ID      # Phase B-3
npx wrangler secret put SQUARE_APP_SECRET  # Phase B-3
…one pair per OAuth platform
```

**Rules that don't change:** every scope read-only · tokens encrypted at rest ·
business data pass-through only, never persisted server-side · disconnect
deletes the token · PRIVACY.md is the public contract.
