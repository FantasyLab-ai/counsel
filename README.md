# Counsel — the whole C-suite in your pocket

> **Runs the numbers like a CFO. Watches operations like a COO. Calls the plays like a CEO. Honest like none of them.**

**Powered by [Aurora](https://github.com/FantasyLab-ai/aurora), the glass-box
engine.** Counsel reads a small business's real data and advises across the
whole company — money, operations, decisions — in plain English, **cited,
confidence-scored**, and openly saying *"not enough data yet"* instead of
guessing. Real statistical methods compute; a model only narrates cited
results. The honesty is the product.

## Pay Yourself — the number nobody computes

The most personal number in any small business: **what can the owner safely
pay themselves?** Counsel computes it — the largest monthly draw the 13-week
cautious path can carry with cash *ending the quarter no lower than it
started* (earned, never eaten from savings) and never dipping below the
owner's floor. Found by binary search over the same simulator behind the
Money screen, so the number's receipt is the ribbon itself. When the math
can't support a salary yet, Counsel refuses — and names the lever that turns
the number positive.

## Signed execution — Counsel's hands, under contract

Counsel can now *run* a decision contract, not just propose it: the owner
previews the exact diff (e.g. a Shopify price change), signs it, the
executor performs it with a before-snapshot, and a watchdog cron enforces a
measured rollback trigger — if volume runs below the floor for N straight
days, the price restores itself and the owner is told. Every action lives in
the Trust Ledger: signed → executed → watched → graded. The principled line:
**prices and messages, never money.**

## Receipts, not narratives

The incumbents now ship AI that *summarizes* your books — fluent paragraphs
with no error bars, no methods, no way to check the claim. Counsel is built
the other way around:

| Them (LLM narratives) | Counsel (receipts) |
|---|---|
| "Revenue looks a bit soft this month." | "Structural break Mar 6, −28%, p < 0.001 — Welch test, your ledger." |
| A single forecast number | A range with a confidence band — ranges are the honest answer |
| "Consider reviewing your pricing." | "Measured elasticity −0.7 from your own price change; a +5% test projects ≈ $310/mo. Track it; grade it in 30 days." |
| Insights you read | Insights that become **tracked, graded decisions** |
| Your books on their cloud | Analysis **on your device** — airplane mode works |

Every card carries the method that produced it and the confidence it
deserves — plus, sharpened by early user feedback, two more labels: the
date the data runs through and how complete that data is. When the math
can't support a claim, Counsel says so.

## Your pocket C-suite

**The CFO desk** — money, measured
- **Today** — the morning brief: what changed, what it means, what's watched
- **Numbers** — every metric *shows its math* (a different shape per method)
- **Money** — the cash calendar (every bill on its day vs your inflow rhythm), AR aging with a chase order + DSO, the tax pot
- **The Banker's Packet** — a lender-ready statement of record, every figure cited
- **The Ledger** — every consumed transaction listed with its source; outliers, duplicates and fee anomalies pinned by visible rules, each row expandable to its receipts

**The COO desk** — operations, watched
- **Stock & Shipments** — days-of-cover vs your real demand rate, reorder-by dates, overstock cash, stalled-shipment triage
- **Staffing-to-demand** — match people to your week's actual shape (and it says so when your week is flat)
- **The Watchlist** — Sentinel contracts: quiet by design, speaks only on structural change

**The CEO desk** — decisions, rehearsed and graded
- **Plan** — rehearse hires, price changes, purchases with honest bands, stress-tested against your worst month
- **"Was it worth it?"** — before/after significance on your own decisions
- **The Decisions Log** — Counsel grades its own advice against what happened
- **Ask** — a conversational partner with a privacy router: on-device for known analyses, and it *shows you exactly what would be sent* before any cloud call

**The Insights Lab** — nine deep engines: price elasticity from your own history,
customer survival analysis, newsvendor restock math, counterfactual months, the
fee & waste audit, benchmarks, credit readiness, Monte Carlo runway, season
adjustment. All computed on-device.

## The engine underneath

`core/` is **aurora-core** — Aurora's statistical methods ported to Rust with a
**golden parity suite** against the Python reference (`cargo test`). It ships
three ways from one codebase: WebAssembly (65 KB, live in the PWA today),
Android via uniffi/Kotlin (APK builds locally + in CI), iOS via uniffi/Swift
(xcframework builds in CI; needs a Mac only for device signing).

## Connect your data (or drop a file)

`server/connect.py` — one CLI, five faucets, all normalizing into the same
canonical schema the engines consume:

```bash
python connect.py stripe  --key sk_test_xxx --sync          # test mode works — no revenue needed
python connect.py square  --token EAAAxxx --sync            # sandbox seller
python connect.py shopify --shop my-store --token shpat_xxx --sync
python connect.py plaid   --client-id x --secret y --access-token z --sync
python connect.py csv     --file charges.csv --kind charges --sync   # zero accounts
```

Every mapper is pinned by offline fixture tests against the providers'
documented payload shapes: `python server/tests_connectors.py` (27 checks).
The in-app **Power Up** screen shows users the same map: what to connect,
what each source unlocks, and the exact CSV to drop in instead.

## Run it

```bash
npm install && npm run dev            # the app (mock/demo brain)
# real brain: set AURORA_REPO, run server/server.py, set VITE_COUNSEL_API
```

Live demo: **counsel-demo.pages.dev** · Android APK: `/CounselEngine.apk` on the
demo site · details: [HANDOFF.md](HANDOFF.md), [ROADMAP.md](ROADMAP.md), [core/MOBILE.md](core/MOBILE.md)

## Identity

Paper & forest & brass. Fraunces when Counsel *speaks* (dark stationery), Inter
when it *shows* (paper cards), JetBrains Mono for figures and citations. The
brass **break line** marks statistically real change — the hero device.
Confidence pills are calm, never alarm-red. All motion respects
`prefers-reduced-motion`.

## License

Two layers, honestly labeled:

- **The math is open source.** [Aurora](https://github.com/FantasyLab-ai/aurora),
  the statistical engine every claim runs on, is **Apache-2.0** — read it, test
  it, use it anywhere.
- **The product is source-available.** Counsel itself is under the
  [Elastic License 2.0](LICENSE): read every line, verify every claim, run it
  and modify it for your own business. What you can't do is resell it or offer
  it to others as a hosted service.

If you think the math is wrong somewhere, open an issue with the receipt — that
is exactly the standard this codebase asks to be held to.
