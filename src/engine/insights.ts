// ---------------------------------------------------------------------------
// insights.ts — the Plan tab's math. Everything here is either
//   (a) computed live from the bundled ledger via aurora-core (WASM), or
//   (b) a baseline figure from the P&L mock (marked), consistent with the
//       rest of the prototype.
// PHASE 2: baselines come from the Counsel backend; the wasm calls stay.
// ---------------------------------------------------------------------------

import { ar1Forecast, detectChangepoints, loadCore, welch } from "./auroraCore";

export interface Ledger {
  dates: string[];
  revenue: number[];
}

import { getDaily, userExpenses } from "./dataSource";

let _ledger: Ledger | null = null;

export async function ledger(): Promise<Ledger> {
  if (_ledger) return _ledger;
  await loadCore();
  _ledger = (await getDaily()) as Ledger;
  return _ledger;
}

// --- baselines (P&L mock — same figures as the rest of the prototype) -------
export const BASELINE = {
  avgProfit: 3050, // $/mo, trailing 3
  worstProfit: 2050, // Feb
  cash: 48300,
  burn: 6900, // avg net monthly outgoings
  margin: 0.34,
  fixedOutgoings: 6900, // rent + materials + software, monthly
  variancePct: 30,
};

export const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

// --- cash sentry: on-device band forecast vs outgoings -----------------------
export interface CashSentry {
  lo30: number; // low band, next 30 days revenue
  hi30: number;
  clears: boolean; // even the LOW band covers outgoings
  marginOfSafety: number; // lo30 * margin - outgoings piece... plain$ cushion
  ms: number;
}

/** Real outgoings + margin when the user's expenses exist; demo baseline
 * otherwise. Returns null margin when revenue is too thin to divide. */
export function liveMoneyBasis(): { outgoings: number; margin: number | null; live: boolean } {
  const exp = userExpenses();
  if (!exp || !exp.length) return { outgoings: BASELINE.fixedOutgoings, margin: BASELINE.margin, live: false };
  const dates = exp.map((e) => e.d).sort();
  const spanDays = Math.max(
    28,
    (new Date(dates[dates.length - 1] + "T00:00:00").getTime() - new Date(dates[0] + "T00:00:00").getTime()) / 86400000 + 1,
  );
  const total = exp.reduce((s, e) => s + e.amount, 0);
  const outgoings = Math.round((total / spanDays) * 30.4); // monthly burn from recorded rows
  return { outgoings, margin: null, live: true };
}

export async function cashSentry(): Promise<CashSentry | null> {
  const led = await ledger();
  const t0 = performance.now();
  const fc = ar1Forecast(led.revenue, 30, 0.05);
  const ms = performance.now() - t0;
  if (!fc) return null;
  const lo30 = fc.lo.reduce((s, v) => s + v, 0);
  const hi30 = fc.hi.reduce((s, v) => s + v, 0);
  // Profit at the LOW band vs outgoings — the honest stress line. With real
  // expenses on file, BOTH sides come from the user's own data: margin from
  // the last 30 recorded days (rev vs exp), outgoings from recorded burn.
  const basis = liveMoneyBasis();
  let margin = BASELINE.margin;
  if (basis.live) {
    const exp = userExpenses()!;
    const last = led.dates[led.dates.length - 1];
    const cut = new Date(new Date(last + "T00:00:00").getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const rev30 = led.revenue.filter((_, i) => led.dates[i] >= cut).reduce((s, v) => s + v, 0);
    const exp30 = exp.filter((e) => e.d >= cut).reduce((s, e) => s + e.amount, 0);
    if (rev30 > 0) margin = Math.max(0.05, Math.min(0.95, (rev30 - exp30) / rev30));
  }
  const lowProfit = lo30 * margin;
  return {
    lo30,
    hi30,
    clears: lowProfit >= basis.outgoings,
    marginOfSafety: lowProfit - basis.outgoings,
    ms,
  };
}

// --- what-if scenarios (transparent arithmetic + honest bands) ---------------
export interface HireResult {
  cushionAvg: number;
  cushionWorst: number;
  verdict: "comfortable" | "workable" | "tight";
}
export function hireScenario(monthlyCost: number): HireResult {
  const cushionAvg = BASELINE.avgProfit - monthlyCost;
  const cushionWorst = BASELINE.worstProfit - monthlyCost;
  return {
    cushionAvg,
    cushionWorst,
    verdict: cushionWorst > 500 ? "comfortable" : cushionWorst > 0 ? "workable" : "tight",
  };
}

export interface PriceResult {
  // We do NOT know true elasticity — we show the band across plausible ones.
  bestProfitDelta: number; // e = -0.5 (inelastic)
  worstProfitDelta: number; // e = -1.5 (elastic)
  monthlyRevenue: number;
}
export function priceScenario(pctChange: number): PriceResult {
  const monthlyRevenue = 61200; // March MTD from the prototype's Numbers
  const p = pctChange / 100;
  const delta = (e: number) => {
    const volume = 1 + e * p; // linear approximation, honest for small p
    const revenue = monthlyRevenue * (1 + p) * volume;
    return (revenue - monthlyRevenue) * BASELINE.margin;
  };
  return { bestProfitDelta: delta(-0.5), worstProfitDelta: delta(-1.5), monthlyRevenue };
}

export interface PurchaseResult {
  runwayAfter: number; // months
  runwayBefore: number;
  monthsToRecoup: number | null; // at stated margin uplift, null if none
}
export function purchaseScenario(cost: number, monthlyReturn: number): PurchaseResult {
  const runwayBefore = BASELINE.cash / BASELINE.burn;
  const runwayAfter = (BASELINE.cash - cost) / BASELINE.burn;
  return {
    runwayBefore,
    runwayAfter,
    monthsToRecoup: monthlyReturn > 0 ? cost / monthlyReturn : null,
  };
}

// --- "was it worth it?" — before/after significance around a decision date ---
export interface WorthIt {
  found: boolean;
  beforeMean: number;
  afterMean: number;
  pctChange: number;
  p: number;
  pPlain: string;
  nBefore: number;
  nAfter: number;
}

const pPlain = (p: number) =>
  p < 0.001 ? "less than a 1-in-1,000 chance this is noise"
  : p < 0.01 ? "less than a 1-in-100 chance this is noise"
  : p < 0.05 ? "less than a 1-in-20 chance this is noise"
  : "within normal variation — no detectable effect";

export async function wasItWorthIt(dateISO: string): Promise<WorthIt | null> {
  const led = await ledger();
  const idx = led.dates.findIndex((d) => d >= dateISO);
  if (idx < 8 || led.revenue.length - idx < 5) return null;
  const before = led.revenue.slice(Math.max(0, idx - 30), idx);
  const after = led.revenue.slice(idx);
  const w = welch(before, after);
  const bMean = before.reduce((s, v) => s + v, 0) / before.length;
  const aMean = after.reduce((s, v) => s + v, 0) / after.length;
  return {
    found: w.p < 0.05,
    beforeMean: bMean,
    afterMean: aMean,
    pctChange: (aMean / bMean - 1) * 100,
    p: w.p,
    pPlain: pPlain(w.p),
    nBefore: before.length,
    nAfter: after.length,
  };
}

// --- sentinel watchlist: live contract evaluation ----------------------------
export interface ContractStatus {
  id: string;
  title: string;
  rule: string;
  fired: boolean;
  statusLine: string;
}

export async function evaluateContracts(): Promise<ContractStatus[]> {
  const led = await ledger();
  const out: ContractStatus[] = [];

  // 1. Revenue regime break (PELT on the ledger, penalty 10).
  const cps = detectChangepoints(led.revenue, "rbf", 10);
  const brk = cps.length ? cps[cps.length - 1] : null;
  const brkDate =
    brk !== null
      ? new Date(led.dates[brk] + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;
  out.push({
    id: "regime",
    title: "Revenue regime break",
    rule: "speak only if PELT finds a structural break",
    fired: brk !== null,
    statusLine: brk !== null ? `FIRED — break detected ${brkDate}` : "quiet — one regime",
  });

  // 2. Margin floor (baseline mock margin vs 30%).
  out.push({
    id: "margin",
    title: "Margin floor · 30%",
    rule: "speak only if margin structurally drops below 30%",
    fired: BASELINE.margin < 0.3,
    statusLine: BASELINE.margin < 0.3 ? "FIRED — margin below floor" : `quiet — margin ${(BASELINE.margin * 100).toFixed(0)}%, inside its band`,
  });

  // 3. Runway floor (4 months).
  const runway = BASELINE.cash / BASELINE.burn;
  out.push({
    id: "runway",
    title: "Runway under 4 months",
    rule: "speak only if cash runway crosses 4 months",
    fired: runway < 4,
    statusLine: runway < 4 ? "FIRED — runway thin" : `quiet — ${runway.toFixed(1)} months on hand`,
  });

  return out;
}

// --- seasonality (Tier 3 slice): weekday profile from the ledger -------------
export interface Seasonality {
  strongest: string;
  weakest: string;
  ratio: number; // strongest/weakest
}
export async function seasonality(): Promise<Seasonality> {
  const led = await ledger();
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  led.dates.forEach((d, i) => {
    const wd = new Date(d + "T00:00:00").getDay();
    sums[wd] += led.revenue[i];
    counts[wd]++;
  });
  const means = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
  const names = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  let hi = 0, lo = 0;
  means.forEach((m, i) => {
    if (m > means[hi]) hi = i;
    if (m > 0 && (means[lo] === 0 || m < means[lo])) lo = i;
  });
  return { strongest: names[hi], weakest: names[lo], ratio: means[lo] ? means[hi] / means[lo] : 1 };
}
