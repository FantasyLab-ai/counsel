# Counsel — Phase 1 + Phase 2 Handoff

Phase 1: a **clickable, mobile-first prototype** — five screens, the design
identity, and a typed mock API seam.

**Phase 2 (wired): the real brain.** `server/` is a thin Flask service whose
numbers all come from **Aurora's actual methods** run over a real ledger:

- **Change point:** `fantasyai.aurora.advanced_models.detect_changepoints`
  (ruptures/PELT, rbf) + Welch's t-test → real break date, p-value, effect + CI.
- **Forecast:** `fantasyai.aurora.math.forecasting.forecast_worldclass`
  (model-zoo: ETS/SARIMAX/seasonal-naive/AR1, backtest-selected) → honest range.
- Margin band / runway arithmetic / attribution / repeat trend: transparent
  pandas + scipy computations, cited as exactly that.

The engine is IMPORTED from the Aurora repo (`AURORA_REPO` env var), never
forked — the one-engine rule. Verdicts adapt to the data: the demo ledger's
post-break P&L genuinely flips the hire answer to "not right now."

### Run real mode

```powershell
# 1. backend (reuses the Aurora venv — all deps already there)
$env:AURORA_REPO = "C:\Users\bgrut\Desktop\Aurora_QIE"
C:\Users\bgrut\Desktop\Aurora_QIE\.venv\Scripts\python.exe server\server.py

# 2. frontend in real mode
$env:VITE_COUNSEL_API = "http://127.0.0.1:8100"
npm run dev
```

Unset `VITE_COUNSEL_API` (or deploy the static build) → mock replay mode.
`server/data/generate_ledger.py` regenerates the seeded demo ledger.

### Still Phase 3 / future
Real Stripe/Shopify OAuth · auth/accounts · persistence · hosted backend ·
on-device Rust core (see the local-vision brief; golden-parity required).

## The API contract (what the real backend must implement)

Everything the UI consumes lives in **`src/api/counsel.ts`**. The real Counsel
backend (Phase 2 — a thin service wrapping the **existing Python Aurora
engine**) must implement these functions with **identical types**:

| Function | Returns | Backing Aurora work (Phase 2) |
|---|---|---|
| `getBrief()` | `Brief` (voice state, triaged `Insight[]`, watching, sources) | run findings → ranked, narrated insights |
| `getMetrics(period)` | `Metric[]` — each with a `MathBlock` | change-point (BOCPD), normal-range band, arithmetic, attribution, trend |
| `ask(question)` | `AskAnswer` — cited, confidence-scored, honest fallback | Aurora computes; LLM narrates the cited result ONLY |
| `getConnections()` | `Source[]` | real OAuth-backed connector status |

Structural guarantees enforced by the types (do not weaken):
- Every `Insight`/`Metric` carries `confidence` + `citation`. **This is the product.**
- `Confidence` includes `"insufficient"` — the honest "not enough data" state is
  first-class, not an error.
- `MathBlock.viz` is a tagged union (`breakline | band | arithmetic |
  attribution | trend | fan | cushion`) — the engine picks the *shape* of the
  math per question; the UI already renders all seven.

Mock data: `src/api/mockData.ts` (all copy is product voice — port, don't
regenerate). Swapping in the real backend should change **zero component code**.

## Stubs awaiting Phase 2 (all marked with TODO comments)

- **Stripe/Shopify OAuth** — `Onboarding.tsx` step 3 button is a stub.
- **Aurora analysis** — every `src/api/counsel.ts` function.
- **Auth/accounts, persistence, billing, push notifications** — absent by design.
- **`ask()`** — canned answers for hire-affordability + forecast + honest fallback.

## Engine strategy (Brandon's standing constraint)

ONE engine. Phase 2 **wraps** the existing Python Aurora (studio_api) — never a
fork. Phase 3's on-device Rust core (see `counsel-local-vision-brief`) must pass
a golden-test parity suite against the Python reference before it ships. The
Aurora desktop app must never be destabilized by Counsel work.

## Run / build / deploy

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/
npx wrangler pages deploy dist --project-name counsel-demo
```
