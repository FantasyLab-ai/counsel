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
  const wm = weekdayModel(led.dates, led.revenue);
  if (!wm) return null;
  const band = bandFromAdjusted(wm, 30);
  if (!band) return null;
  const ms = performance.now() - t0;
  const lo30 = band.totalLo;
  const hi30 = band.totalHi;
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

/** Revenue: recent history flowing into the AR(1) band ahead — the fan
 * chart. History = last 28 trading days; forecast = 14 days with 95%
 * analytic intervals from aurora-core. Null when history is too thin. */
export interface RevenueBand {
  history: number[];
  mid: number[]; hi: number[]; lo: number[];
  hi14: number; lo14: number;       // 80% planning band on the 14-day total
  hi14w: number; lo14w: number;     // 95% band — wider, still disclosed
  sigmaMethod: "robust" | "ols";    // which residual scale the fit used
}
/* --- weekday-aware banding ------------------------------------------------
   Two fixes over naive AR(1)-on-raw-days, both adding rigor:
   1. DESEASONALIZE: daily revenue is divided by its weekday factor before
      fitting, so the Sat-vs-Mon rhythm is modeled as STRUCTURE instead of
      inflating the residual noise (which blew the bands wide open).
   2. HONEST TOTALS: an h-day total band must NOT be the sum of daily
      extremes (that assumes every day bottoms out at once). We simulate
      2,000 paths of the fitted AR(1), re-seasonalize each day, sum, and
      read the total's own percentiles. */

interface WdayModel {
  adjusted: number[];      // series / weekday factor (partial today dropped)
  factors: number[];       // Sun..Sat, clamped to [0.25, 3]
  horizonFactors: (h: number) => number; // factor for forecast day h (0-based)
}

function weekdayModel(dates: string[], revenue: number[]): WdayModel | null {
  // Drop today's partial day: it isn't a finished observation.
  const todayIso = new Date().toISOString().slice(0, 10);
  let n = dates.length;
  if (n && dates[n - 1] === todayIso) n -= 1;
  if (n < 14) return null;

  const byWd: number[][] = [[], [], [], [], [], [], []];
  for (let i = 0; i < n; i++) byWd[new Date(dates[i] + "T00:00:00").getDay()].push(revenue[i]);
  const overall = revenue.slice(0, n).reduce((a, b) => a + b, 0) / n;
  if (!(overall > 0)) return null;
  const factors = byWd.map((arr) => {
    if (!arr.length) return 1;
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.min(3, Math.max(0.25, m / overall));
  });

  const adjusted: number[] = [];
  for (let i = 0; i < n; i++) {
    adjusted.push(revenue[i] / factors[new Date(dates[i] + "T00:00:00").getDay()]);
  }
  const lastDate = new Date(dates[n - 1] + "T00:00:00");
  return {
    adjusted,
    factors,
    horizonFactors: (h: number) => {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + h + 1);
      return factors[d.getDay()];
    },
  };
}

/** AR(1) fit in plain JS (OLS on lag-1), with a stationarity clamp.
 * NOTE: aurora-core's ac_ar1 also exports {a,b,residStd}, but those fields
 * had never been consumed before this feature and direct iteration with
 * them diverges — a parity gap flagged for the core's golden suite. Until
 * that's settled, the band math uses this transparent local fit; the fan,
 * totals and receipts describe exactly what runs. */
function fitAr1(x: number[]): {
  a: number; b: number; sigma: number; sigmaMethod: "robust" | "ols";
} | null {
  const n = x.length;
  if (n < 15) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let t = 0; t < n - 1; t++) {
    const u = x[t], v = x[t + 1];
    if (!isFinite(u) || !isFinite(v)) return null;
    sx += u; sy += v; sxx += u * u; sxy += u * v;
  }
  const m = n - 1;
  const denom = sxx - (sx * sx) / m;
  let b = denom > 1e-9 ? (sxy - (sx * sy) / m) / denom : 0;
  b = Math.max(-0.95, Math.min(0.95, b)); // stationary by construction
  const a = (sy - b * sx) / m;
  const resid: number[] = [];
  let ss = 0;
  for (let t = 0; t < n - 1; t++) {
    const e = x[t + 1] - (a + b * x[t]);
    resid.push(e);
    ss += e * e;
  }
  const sigmaOls = Math.sqrt(ss / Math.max(1, m - 2));
  // Robust scale: MAD x 1.4826. One promo spike or refund day should not
  // widen every forecast day's band — the OLS sd lets outliers do exactly
  // that. When the robust estimate is degenerate we fall back and say so.
  const sortedAbs = resid
    .map((e) => Math.abs(e - median(resid)))
    .sort((p2, q) => p2 - q);
  const mad = median(sortedAbs);
  const sigmaRobust = mad * 1.4826;
  const useRobust = isFinite(sigmaRobust) && sigmaRobust > 1e-9;
  const sigma = useRobust ? sigmaRobust : sigmaOls;
  if (!isFinite(a) || !isFinite(sigma)) return null;
  return { a, b, sigma, sigmaMethod: (useRobust ? "robust" : "ols") as "robust" | "ols" };
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((p2, q) => p2 - q);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Mean path + marginal 95% bands + simulated TOTAL band, re-seasonalized.
 * The total comes from 2,000 simulated paths (never from summing daily
 * extremes, which pretends every day bottoms out at once). */
function bandFromAdjusted(
  wm: WdayModel, horizon: number,
): {
  mid: number[]; lo: number[]; hi: number[];
  totalLo: number; totalHi: number;       // 80% (p10-p90) — the planning band
  totalLoW: number; totalHiW: number;     // 95% — disclosed alongside
  sigmaMethod: "robust" | "ols";
} | null {
  const fit = fitAr1(wm.adjusted);
  if (!fit) return null;
  const { a, b, sigma, sigmaMethod } = fit;
  const last = wm.adjusted[wm.adjusted.length - 1];

  // Analytic mean path + marginal 80% band on the adjusted scale.
  // 80% (z=1.282) is the PLANNING band: 8 in 10 simulated paths land
  // inside. The 95% totals are computed too and shown in the receipt —
  // coverage is a labeled choice here, never a hidden one.
  const Z80 = 1.282;
  const mid: number[] = [], lo: number[] = [], hi: number[] = [];
  let mean = last, varAcc = 0;
  for (let h = 0; h < horizon; h++) {
    mean = a + b * mean;
    varAcc = varAcc * b * b + sigma * sigma;
    const sd = Math.sqrt(varAcc);
    const f = wm.horizonFactors(h);
    mid.push(Math.max(0, mean * f));
    lo.push(Math.max(0, (mean - Z80 * sd) * f));
    hi.push(Math.max(0, (mean + Z80 * sd) * f));
  }

  // Simulated total band — DETERMINISTIC seed derived from the data, so
  // the same ledger always draws the same band (a forecast that wobbles
  // between app-opens reads as guesswork, and would be).
  const SIMS = 2000;
  let seed = (wm.adjusted.length * 2654435761 ^ Math.round(last * 1000)) >>> 0;
  const rand = () => {
    // mulberry32 — small, seedable, plenty for band quantiles
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const sums = new Float64Array(SIMS);
  let spare: number | null = null;
  const gauss = () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0, s2 = 0;
    do { u = rand() * 2 - 1; v = rand() * 2 - 1; s2 = u * u + v * v; } while (s2 >= 1 || s2 === 0);
    const mul = Math.sqrt(-2 * Math.log(s2) / s2);
    spare = v * mul;
    return u * mul;
  };
  for (let k = 0; k < SIMS; k++) {
    let x = last, total = 0;
    for (let h = 0; h < horizon; h++) {
      x = a + b * x + sigma * gauss();
      total += Math.max(0, x) * wm.horizonFactors(h);
    }
    sums[k] = total;
  }
  const sorted = [...sums].sort((p2, q) => p2 - q);
  const q = (frac: number) => Math.max(0, sorted[Math.min(SIMS - 1, Math.floor(SIMS * frac))]);
  const totalLo = q(0.10), totalHi = q(0.90);
  const totalLoW = q(0.025), totalHiW = q(0.975);
  if (!isFinite(totalLo) || !isFinite(totalHi)) return null;
  return { mid, lo, hi, totalLo, totalHi, totalLoW, totalHiW, sigmaMethod };
}

export async function revenueBand(): Promise<RevenueBand | null> {
  const led = await ledger();
  const wm = weekdayModel(led.dates, led.revenue);
  if (!wm) return null;
  const band = bandFromAdjusted(wm, 14);
  if (!band) return null;
  return {
    history: led.revenue.slice(-28),
    mid: band.mid, hi: band.hi, lo: band.lo,
    hi14: band.totalHi,
    lo14: band.totalLo,
    hi14w: band.totalHiW,
    lo14w: band.totalLoW,
    sigmaMethod: band.sigmaMethod,
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
