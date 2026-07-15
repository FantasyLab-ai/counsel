# Counsel — your honest AI CFO

**Powered by [Aurora](https://github.com/FantasyLab-ai/aurora).** Counsel reads
a small business's real financial data and delivers plain-English, **cited,
confidence-scored** insights — and openly says *"not enough data yet"* instead
of guessing. Real statistical methods compute; an LLM only narrates cited
results. The honesty is the product.

**Phase 1** (this repo): a mobile-first clickable prototype — five screens,
full design identity, typed mock-API seam. See [HANDOFF.md](HANDOFF.md) for the
backend contract and phase plan.

## Screens

- **/welcome** — 5-step onboarding ending in a first cited finding
- **/** Today — the morning brief: advisor voice, triaged attention, numbers read
- **/numbers** — every metric can *show its math* (a different shape per method)
- **/ask** — conversational CFO: checked sources, verdicts, honest forecasts
- **/settings** — connections, glass-box controls, privacy & data

## Identity

Paper & forest & brass. Fraunces when Counsel *speaks* (dark stationery), Inter
when it *shows* (paper cards), JetBrains Mono for figures and citations. The
brass **break line** marks statistically real change — the hero device.
Confidence pills are calm, never alarm-red. All motion respects
`prefers-reduced-motion`.

## Develop

```bash
npm install && npm run dev
```
