# Counsel — the road to game-changing

What makes Counsel different is already decided: **real math, cited, honest,
on your device.** The roadmap below is ordered by how hard each item leans on
that moat — things generic "business dashboards" structurally cannot copy.

## Tier 1 — the killers (unique to Aurora's engine)

1. **"Was it worth it?" — causal readouts on your own decisions.**
   You changed your price Feb 1. Every other app shows before/after averages —
   confounded by season, promos, weather. Aurora's do-calculus + change-point
   engine can answer the real question: *"your price increase caused −3%
   volume but +9% revenue — keep it."* Every small-business decision becomes
   a measured experiment. Nobody else in SMB software does causal inference.

2. **The What-If planner (simulate before you commit).**
   Port Aurora's intervention simulator: "If I hire at $1,400/mo…", "If I
   raise prices 5%…", "If I buy the $8k kiln…" → projected cash, margin and
   runway *with honest confidence bands*, stress-tested against your worst
   month. The cushion chart in Ask is the seed of this; make it a first-class
   screen. Decisions rehearsed, not gambled.

3. **Sentinel for your business (decision contracts).**
   Aurora's contract engine, pointed at a business: "Text me ONLY if margin
   structurally breaks below 30%," "Alert me if a product's sales regime
   shifts." Quiet by design — the anti-notification-spam pitch: *Counsel
   watches so you don't have to.* Ports the existing desktop contract engine.

4. **Cash-crunch early warning.**
   Forecast bands + payroll/rent dates = *"87% chance you clear April payroll;
   the 13% risk comes from the Sunset Mug restock slipping."* The single
   scariest moment in small business, de-fanged by banded math. This is the
   feature people tell their friends about.

## Tier 2 — trust compounders

5. **The Decisions Log (advice → outcome → track record).**
   Every recommendation Counsel makes gets logged; 30 days later it grades
   itself against what actually happened — publicly, in-app. Aurora already
   has the recommendations/outcome plumbing. No other advisor (human or AI)
   shows you its batting average. Honesty becomes measurable.

6. **Benchmarks with receipts.**
   "Your 34% margin vs. 41% median for handmade goods (cited source)." Later:
   opt-in anonymous cohort benchmarks across Counsel users — a network moat
   that gets stronger with every signup, in keeping with the privacy story
   (aggregates only, on-device derivation).

7. **The Banker's Packet.**
   One tap → a lender/accountant-ready PDF: revenue trend with change-points,
   margins, runway, forecast bands — every figure cited and methodologically
   footnoted. Small businesses pay for this the week they apply for a loan.

## Tier 3 — daily-habit builders

8. **Morning brief push** (already designed in Settings) — the 7:30 AM
   one-glance read; quiet unless something structurally changed.
9. **Week-in-review narration** — Sunday evening, 60 seconds, plain English,
   every claim tappable to its math.
10. **Seasonality coach** — "your Decembers run 2.1× November; start inventory
    buildup by Oct 15" from the seasonality profile the engine already fits.

## Connector expansion (Phase 2B order)

Stripe → Square → Shopify → **Plaid (bank feed — unlocks runway/cash truth)**
→ QuickBooks → Etsy → Toast/Clover → Amazon/eBay. Users OAuth into their own
accounts, read-only, revocable; Counsel piggybacks nothing.

## The one-line strategy

Everyone else summarizes what happened. Counsel proves what *caused* it,
rehearses what happens *next*, and keeps a public score of its own advice.

---

## LOCKED · 2026-07-15 — the math/data expansion (build after connectors)

Agreed order: **A1 → B5 → A2**, then the rest. All build on aurora-core /
Aurora methods; each output stays cited + confidence-scored + honest.

### Tier A — Aurora-native (hard to copy)
- **A1. Price elasticity from own history** — every past price change as a
  natural experiment (RD-style around change dates) → "raise X by 8%,
  worth ~$740/mo." Revenue-printing sentence.
- **A2. Customer survival analysis** (Kaplan-Meier/hazard) → "41 customers in
  the at-risk window ≈ $3.8k recoverable."
- **A3. Newsvendor inventory** — reorder points from demand distribution +
  margin asymmetry ("stock 92, not 120").
- **A4. Counterfactual month** (synthetic-control-lite) → "the stockout cost
  you ~$9k."

### Tier B — trust compounders
- **B5. Fee & waste auditor** — anomaly detection on expenses: duplicate
  charges, subscription creep, processor-fee drift. Pays for the app visibly.
- **B6. Peer benchmarks with honest CIs** — KB + user cohorts; network moat.
- **B7. Credit-readiness score** — DSCR, stability index; Banker's Packet
  grown up.

### Tier C — the daily habit
- **C8. Monte Carlo cash runway** — payroll dates + seasonality + receivable
  timing → "3% chance of a gap, clusters April 3."
- **C9. STL season-adjustment everywhere** — "down 12% raw, +2% adjusted" —
  kills false alarms.

Store path (locked): validate on PWA → Phase 2B connectors (Stripe+Plaid) →
native shells (SwiftUI/Compose + aurora-core, Apple FM narration) → Play
first, then App Store via TestFlight. Submit when ~20 real businesses are
connected and retained 2+ weeks on the PWA.
