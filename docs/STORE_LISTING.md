# Counsel — store listing pack

One source of truth for both stores. Paste from here; keep the voice:
plain, honest, zero hype-slop. No em dashes in store copy.

## Identity

| Field | Value |
|---|---|
| App name | **Counsel: Honest AI CFO** (fallback if free: "Counsel by FantasyLab") |
| Bundle / package | `ai.fantasylab.counsel` (both stores) |
| Category | Business (primary) · Finance (secondary where allowed) |
| Price | Free |
| Privacy policy URL | https://counsel-site.pages.dev/privacy.html |
| Website | https://counsel-site.pages.dev |
| Support email | bgrutkowski13@gmail.com |

## Short description (Play, 80 chars max)

> The CFO who shows the math. Your numbers, read honestly, on your device.

(72 chars)

## Full description (Play 4000 max / App Store description)

> Counsel reads your business numbers the way a careful CFO would, and
> then does something no dashboard does: it shows you the math behind
> every single claim.
>
> Every number in Counsel opens. Tap it and you get the receipt: what
> was computed, over what window, from which of your records, and how
> sure the answer is. When the data is not enough to call something,
> Counsel says "not ready to call" instead of guessing. That refusal is
> the product.
>
> WHAT IT DOES
> - The morning read: what changed, what needs a minute, what can wait
> - A 14 day revenue band you can plan on, with the uncertainty stated
> - Change detection that knows its own error rate, measured on
>   thousands of stress tests, and says when a "break" might be noise
> - Pay Yourself: the largest owner draw your cash floor can support
> - 13 week cash view, profit and loss, price power, customer risk,
>   restock math, fee audit, and a decision tracker that grades itself
>
> YOUR DATA STAYS YOURS
> Your records live on your device. Connect Stripe, Square, Shopify, or
> your bank, or just drop in a CSV. Nothing is uploaded to us; sync
> passes through, and the analysis runs locally. No ads, no tracking,
> no selling data. Delete everything with one tap in Settings.
>
> HONEST BY CONSTRUCTION
> Counsel is powered by Aurora, an open source statistical engine. The
> methods are named, the thresholds are visible, and the false-fire
> rates of its detectors are published. If you find one claim you
> disagree with, you can trace it to the exact numbers that produced it.
>
> Built by a solo founder for real small businesses: the food truck,
> the salon, the twelve person firm. Try it on demo data first; connect
> your own when you trust it.

## Play data-safety questionnaire (answers)

| Question | Answer |
|---|---|
| Does your app collect or share user data? | **Collects**: crash telemetry only (error name + screen path, no personal data, no financial data). **Shares**: nothing. |
| Data encrypted in transit? | Yes (HTTPS everywhere) |
| Can users request deletion? | Yes — Settings → delete my data wipes the device store; no server copy exists |
| Financial info collected? | No (financial records stay on device; sync is pass-through, never stored server side) |
| Location, contacts, identifiers? | None |
| Ads? | No |
| Target audience | 18+ (business tool) |

## App Store privacy ("nutrition label") answers

- Data Not Collected for: contact info, financial info, location,
  identifiers, usage data, browsing, purchases.
- Diagnostics: crash data, NOT linked to identity, no tracking.
- No third-party advertising, no tracking across apps.

## Content rating (Play IARC)

Business/productivity, no user-generated content, no violence, no
gambling (what-if scenarios are arithmetic, not wagering), no data
sharing. Expected rating: Everyone / PEGI 3.

## Screenshots plan (both stores)

Shoot on a real phone once the closed test build is installed (store
rules want truthful captures of the shipping app):
1. Today: the voice card + "how to read this page" coach
2. A tapped receipt: the math sheet with pedigree + calibration box
3. The band ahead card (80% planning band)
4. Pay Yourself card on Plan
5. Trust Ledger (the register of refusal conditions)
Play feature graphic (1024x500): dark surface, lime accent, the line
"The CFO who shows the math." over the receipt motif. Build when the
first screenshots exist so the style matches.

## Release tracks

- **Play**: closed testing track first (12 testers, 14 days, required
  for new personal accounts). AAB comes from
  `mobile/android/app/build/outputs/bundle/release/app-release.aab`
  (build ritual in the repo README; keystore in C:\Users\bgrut\counsel-keys, BACKED UP off-machine).
- **App Store**: TestFlight via `.github/workflows/ios-testflight.yml`
  (tag `ios-v*`). Internal testers get builds instantly; external
  testers need one-time beta review (usually about a day).
