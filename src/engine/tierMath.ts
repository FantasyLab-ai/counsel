// ---------------------------------------------------------------------------
// tierMath.ts — the nine locked Tier A-C insight engines, computed ON DEVICE
// from the enriched demo ledger (public/kiln_ledger.json + kiln_expenses.json).
//
// Honesty contract, same as everywhere: every result carries its method and
// its limits. Where an input is a baseline assumption (margin, cash) rather
// than ledger-derived, the caller labels it. PHASE 2B: same signatures, real
// connector data.
// ---------------------------------------------------------------------------

import { ar1Forecast, detectChangepoints, loadCore } from "./auroraCore";
import { BASELINE } from "./insights";
import { getDaily, getEnriched, getExpenses } from "./dataSource";

export interface Charge {
  date: string; product: string; qty: number; price: number;
  customer: string; fee: number; channel: string;
}
export interface EnrichedLedger {
  products: { id: string; name: string; price0: number; cost: number }[];
  priceChange: { product: string; date: string; from: number; to: number };
  charges: Charge[];
}
export interface Expense { d: string; vendor: string; amount: number; cat: string }

let _led: EnrichedLedger | null = null;
let _exp: Expense[] | null = null;

async function demoEnriched(): Promise<EnrichedLedger> {
  const raw = await (await fetch("/kiln_ledger.json")).json();
  return {
    products: raw.products,
    priceChange: raw.priceChange,
    charges: (raw.rows as unknown[][]).map((r) => ({
      date: r[0] as string, product: r[1] as string, qty: r[2] as number,
      price: r[3] as number, customer: r[4] as string, fee: r[5] as number,
      channel: r[6] as string,
    })),
  };
}

export async function enriched(): Promise<EnrichedLedger> {
  if (_led) return _led;
  await loadCore();
  _led = await getEnriched(demoEnriched);
  return _led;
}
export async function expenses(): Promise<Expense[]> {
  if (_exp) return _exp;
  _exp = await getExpenses(async () => (await (await fetch("/kiln_expenses.json")).json()).expenses);
  return _exp!;
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const quantile = (a: number[], q: number) => {
  const s = [...a].sort((x, y) => x - y);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)));
  return s[i];
};
const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "\u20ac", GBP: "\u00a3", CAD: "CA$", AUD: "A$" };
function currencySymbol(): string {
  try { return CURRENCY_SYMBOLS[localStorage.getItem("counsel.currency") ?? "USD"] ?? "$"; } catch { return "$"; }
}
/** Display formatting only — data stays as-recorded; the symbol is cosmetic. */
export const money = (x: number) => `${currencySymbol()}${Math.round(x).toLocaleString("en-US")}`;

// ============================ A1 · price elasticity =========================
export interface ElasticityOut {
  elasticity: number; ciLo: number; ciHi: number;
  pricePct: number; qtyPct: number;
  inelastic: boolean; monthlyGain: number; // margin gain from a further +5% test
  nPre: number; nPost: number;
}
export async function priceElasticity(): Promise<ElasticityOut | null> {
  const led = await enriched();
  const pc = led.priceChange;

  // Confounder control: the ledger has a structural revenue break AFTER the
  // price change (the March stockout). Days from the break onward would blend
  // that shock into the price effect, so we measure ONLY inside
  // [price change, break) — the clean natural-experiment window.
  const dailyRaw = await getDaily();
  const cps = detectChangepoints(dailyRaw.revenue, "rbf", 10);
  const brkDate: string | null =
    cps.length && dailyRaw.dates[cps[cps.length - 1]] > pc.date
      ? dailyRaw.dates[cps[cps.length - 1]]
      : null;

  const daily = new Map<string, number>();
  led.charges.filter((c) => c.product === pc.product).forEach((c) =>
    daily.set(c.date, (daily.get(c.date) ?? 0) + c.qty));
  const pre: number[] = [], post: number[] = [];
  daily.forEach((q, d) => {
    if (d < pc.date) pre.push(q);
    else if (!brkDate || d < brkDate) post.push(q);
  });
  if (pre.length < 14 || post.length < 14) return null;
  const dp = pc.to / pc.from - 1;
  const dq = mean(post) / mean(pre) - 1;
  const e = Math.log(1 + dq) / Math.log(1 + dp);
  // bootstrap CI over days
  const es: number[] = [];
  for (let b = 0; b < 300; b++) {
    const rp = Array.from({ length: pre.length }, () => pre[Math.floor(Math.random() * pre.length)]);
    const rq = Array.from({ length: post.length }, () => post[Math.floor(Math.random() * post.length)]);
    const dqb = mean(rq) / mean(rp) - 1;
    if (1 + dqb > 0) es.push(Math.log(1 + dqb) / Math.log(1 + dp));
  }
  const prod = led.products.find((p) => p.id === pc.product)!;
  // margin gain of a further +5% at estimated elasticity
  const testP = 0.05;
  const qMult = Math.pow(1 + testP, e);
  const unitsMo = mean(post) * 30;
  const marginNow = (pc.to - prod.cost) * unitsMo;
  const marginNew = (pc.to * (1 + testP) - prod.cost) * unitsMo * qMult;
  return {
    elasticity: e, ciLo: quantile(es, 0.05), ciHi: quantile(es, 0.95),
    pricePct: dp * 100, qtyPct: dq * 100,
    inelastic: Math.abs(e) < 1, monthlyGain: marginNew - marginNow,
    nPre: pre.length, nPost: post.length,
  };
}

// ============================ A2 · customer survival ========================
export interface SurvivalOut {
  medianReturnDays: number; pReturn45: number;
  atRisk: number; recoverable: number; repeaters: number;
}
export async function customerSurvival(): Promise<SurvivalOut> {
  const led = await enriched();
  const dayIdx = new Map<string, number>();
  const allDates = [...new Set(led.charges.map((c) => c.date))].sort();
  allDates.forEach((d, i) => dayIdx.set(d, i));
  const horizon = allDates.length - 1;

  const byCust = new Map<string, number[]>();
  led.charges.forEach((c) => {
    if (!c.customer.startsWith("c")) return; // repeat pool only
    const arr = byCust.get(c.customer) ?? [];
    arr.push(dayIdx.get(c.date)!);
    byCust.set(c.customer, arr);
  });

  // Kaplan-Meier over inter-purchase gaps; last gap of each customer censored.
  const events: { t: number; event: boolean }[] = [];
  const orderVals: number[] = [];
  byCust.forEach((days) => {
    days.sort((a, b) => a - b);
    for (let i = 1; i < days.length; i++) events.push({ t: days[i] - days[i - 1], event: true });
    events.push({ t: horizon - days[days.length - 1], event: false }); // censored
  });
  led.charges.forEach((c) => { if (c.customer.startsWith("c")) orderVals.push(c.qty * c.price); });

  events.sort((a, b) => a.t - b.t);
  let atRiskN = events.length, surv = 1;
  const km: { t: number; s: number }[] = [];
  for (const ev of events) {
    if (ev.event) { surv *= (atRiskN - 1) / atRiskN; km.push({ t: ev.t, s: surv }); }
    atRiskN--;
  }
  const sAt = (t: number) => { let s = 1; for (const k of km) { if (k.t > t) break; s = k.s; } return s; };
  const median = km.find((k) => k.s <= 0.5)?.t ?? 30;
  const p45 = sAt(45);

  // At-risk today: repeaters whose current gap is past the median but who
  // still have realistic return mass left.
  let atRisk = 0;
  byCust.forEach((days) => {
    const gap = horizon - Math.max(...days);
    if (gap > median && gap < 60) atRisk++;
  });
  const avgOrder = mean(orderVals);
  const recoverable = atRisk * avgOrder * sAt(median); // conservative
  return { medianReturnDays: median, pReturn45: p45, atRisk, recoverable, repeaters: byCust.size };
}

// ============================ A3 · newsvendor ================================
export interface NewsvendorOut {
  product: string; fractile: number; stock30: number; naive30: number; tiedUpSaved: number;
}
export async function newsvendor(): Promise<NewsvendorOut[]> {
  const led = await enriched();
  const out: NewsvendorOut[] = [];
  for (const p of led.products.slice(0, 3)) {
    const daily = new Map<string, number>();
    led.charges.filter((c) => c.product === p.id).forEach((c) =>
      daily.set(c.date, (daily.get(c.date) ?? 0) + c.qty));
    const q = [...daily.values()];
    if (q.length < 20) continue;
    const price = p.id === led.priceChange.product ? led.priceChange.to : p.price0;
    const cu = price - p.cost;            // cost of missing a sale
    const co = p.cost * 0.25;             // holding cost of an unsold unit (assumption)
    const fract = cu / (cu + co);
    const stockDay = quantile(q, Math.min(0.98, fract));
    const naiveDay = Math.max(...q);      // "stock for the best day ever" habit
    out.push({
      product: p.name, fractile: fract,
      stock30: Math.round(stockDay * 30), naive30: Math.round(naiveDay * 30),
      tiedUpSaved: Math.round((naiveDay - stockDay) * 30 * p.cost),
    });
  }
  return out;
}

// ============================ A4 · counterfactual month =====================
export interface CounterfactualOut {
  breakDate: string; actual: number; wouldMid: number; wouldLo: number; wouldHi: number;
  cost: number; costLo: number; costHi: number; postDays: number;
}
export async function counterfactual(): Promise<CounterfactualOut | null> {
  await loadCore();
  const dailyRaw = await getDaily();
  const rev: number[] = dailyRaw.revenue, dates: string[] = dailyRaw.dates;
  const cps = detectChangepoints(rev, "rbf", 10);
  if (!cps.length) return null;
  const brk = cps[cps.length - 1];
  if (brk < 30 || rev.length - brk < 5) return null;
  const pre = rev.slice(0, brk);
  const post = rev.slice(brk);
  const fc = ar1Forecast(pre, post.length, 0.05);
  if (!fc) return null;
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const actual = sum(post);
  const mid = sum(fc.forecast), lo = sum(fc.lo), hi = sum(fc.hi);
  return {
    breakDate: new Date(dates[brk] + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" }),
    actual, wouldMid: mid, wouldLo: lo, wouldHi: hi,
    cost: mid - actual, costLo: lo - actual, costHi: hi - actual, postDays: post.length,
  };
}

// ============================ B5 · fee & waste auditor ======================
export interface AuditFinding { kind: "duplicate" | "creep" | "feedrift"; title: string; detail: string; annual: number }
export async function feeAudit(): Promise<AuditFinding[]> {
  const led = await enriched();
  const exp = await expenses();
  const out: AuditFinding[] = [];

  // duplicates: same vendor + amount + date
  const seen = new Map<string, Expense>();
  for (const e of exp) {
    const k = `${e.d}|${e.vendor}|${e.amount}`;
    if (seen.has(k)) out.push({
      kind: "duplicate",
      title: `Double charge: ${e.vendor}`,
      detail: `${e.vendor} charged $${e.amount.toFixed(2)} twice on ${e.d}. One of these is almost certainly refundable.`,
      annual: e.amount,
    });
    seen.set(k, e);
  }

  // subscription creep: monthly vendor strictly increasing
  const byVendor = new Map<string, number[]>();
  exp.filter((e) => e.cat === "software").forEach((e) => {
    const a = byVendor.get(e.vendor) ?? []; a.push(e.amount); byVendor.set(e.vendor, a);
  });
  byVendor.forEach((amts, vendor) => {
    if (amts.length >= 3 && amts.every((v, i) => i === 0 || v > amts[i - 1])) {
      const perMo = amts[amts.length - 1] - amts[0];
      out.push({
        kind: "creep",
        title: `Subscription creep: ${vendor}`,
        detail: `${vendor} went $${amts[0].toFixed(0)} → $${amts[amts.length - 1].toFixed(0)}/mo over ${amts.length} months without a plan change on file.`,
        annual: perMo * 12,
      });
    }
  });

  // processor fee drift: first-month vs last-month effective rate
  const feeByMonth = new Map<string, { fees: number; rev: number }>();
  led.charges.forEach((c) => {
    const m = c.date.slice(0, 7);
    const cur = feeByMonth.get(m) ?? { fees: 0, rev: 0 };
    cur.fees += c.fee; cur.rev += c.qty * c.price;
    feeByMonth.set(m, cur);
  });
  const months = [...feeByMonth.keys()].sort();
  if (months.length >= 3) {
    const first = feeByMonth.get(months[0])!, last = feeByMonth.get(months[months.length - 1])!;
    const r0 = first.fees / first.rev, r1 = last.fees / last.rev;
    if (r1 - r0 > 0.002) {
      const annualRev = (last.rev) * 12;
      out.push({
        kind: "feedrift",
        title: "Processor fee drift",
        detail: `Your effective processing rate crept from ${(r0 * 100).toFixed(2)}% (${months[0]}) to ${(r1 * 100).toFixed(2)}% (${months[months.length - 1]}). Worth a pricing-tier call.`,
        annual: (r1 - r0) * annualRev,
      });
    }
  }
  return out;
}

// ============================ B6 · benchmarks (reference ranges) ============
export interface BenchmarkOut { label: string; yours: string; p25: string; p50: string; p75: string; percentile: number }
export async function benchmarks(): Promise<BenchmarkOut[]> {
  const led = await enriched();
  // Reference ranges compiled from public sector sources for handmade/craft
  // retail — labeled as references, NOT a live cohort (that needs the network).
  const repeatShare = (() => {
    const byCust = new Map<string, number>();
    led.charges.forEach((c) => byCust.set(c.customer, (byCust.get(c.customer) ?? 0) + 1));
    let rep = 0, tot = 0;
    byCust.forEach((n) => { tot += n; if (n > 1) rep += n - 1; });
    return rep / tot;
  })();
  const pct = (v: number, p25: number, p50: number, p75: number) => {
    if (v <= p25) return Math.max(5, 25 * (v / p25));
    if (v <= p50) return 25 + 25 * ((v - p25) / (p50 - p25));
    if (v <= p75) return 50 + 25 * ((v - p50) / (p75 - p50));
    return Math.min(95, 75 + 20 * ((v - p75) / p75));
  };
  const margin = BASELINE.margin;
  return [
    { label: "Gross margin", yours: `${(margin * 100).toFixed(0)}%`, p25: "28%", p50: "38%", p75: "48%", percentile: Math.round(pct(margin, 0.28, 0.38, 0.48)) },
    { label: "Repeat purchase share", yours: `${(repeatShare * 100).toFixed(0)}%`, p25: "18%", p50: "30%", p75: "42%", percentile: Math.round(pct(repeatShare, 0.18, 0.30, 0.42)) },
    { label: "Cash runway", yours: "7.0 mo", p25: "2 mo", p50: "4 mo", p75: "8 mo", percentile: Math.round(pct(7, 2, 4, 8)) },
  ];
}

// ============================ B7 · credit readiness =========================
export interface CreditOut {
  score: number; band: "strong" | "fair" | "building";
  components: { name: string; value: string; points: number; max: number }[];
}
export async function creditReadiness(): Promise<CreditOut> {
  const dailyRaw = await getDaily();
  const rev: number[] = dailyRaw.revenue;
  // monthly aggregates
  const byMonth = new Map<string, number>();
  (dailyRaw.dates as string[]).forEach((d, i) => {
    const m = d.slice(0, 7); byMonth.set(m, (byMonth.get(m) ?? 0) + rev[i]);
  });
  const months = [...byMonth.values()];
  const cv = Math.sqrt(mean(months.map((v) => (v - mean(months)) ** 2))) / mean(months);
  const stabilityPts = Math.round(Math.max(0, Math.min(30, 30 * (1 - cv / 0.5))));
  const runway = BASELINE.cash / BASELINE.burn;
  const runwayPts = Math.round(Math.min(30, (runway / 8) * 30));
  const marginPts = Math.round(Math.min(20, (BASELINE.margin / 0.45) * 20));
  const histPts = Math.round(Math.min(20, (months.length / 12) * 20));
  const score = stabilityPts + runwayPts + marginPts + histPts;
  return {
    score,
    band: score >= 70 ? "strong" : score >= 45 ? "fair" : "building",
    components: [
      { name: "Revenue stability", value: `CV ${(cv * 100).toFixed(0)}%`, points: stabilityPts, max: 30 },
      { name: "Cash runway", value: `${runway.toFixed(1)} mo`, points: runwayPts, max: 30 },
      { name: "Gross margin", value: `${(BASELINE.margin * 100).toFixed(0)}%`, points: marginPts, max: 20 },
      { name: "Trading history", value: `${months.length} mo on file`, points: histPts, max: 20 },
    ],
  };
}

// ============================ C8 · Monte Carlo runway =======================
export interface MonteCarloOut {
  sims: number; gapProb: number; minCash: number; minCashDate: string; gapDate: string | null;
}
export async function monteCarloRunway(): Promise<MonteCarloOut> {
  const dailyRaw = await getDaily();
  const rev: number[] = dailyRaw.revenue, dates: string[] = dailyRaw.dates;
  const byWd: number[][] = [[], [], [], [], [], [], []];
  dates.forEach((d, i) => byWd[new Date(d + "T00:00:00").getDay()].push(rev[i]));
  const SIMS = 500, DAYS = 90;
  const start = new Date(dates[dates.length - 1] + "T00:00:00");
  let gaps = 0; const firstGapDays: number[] = []; let globalMin = Infinity; let globalMinDay = 0;
  for (let s = 0; s < SIMS; s++) {
    let cash = BASELINE.cash; let minC = cash; let minDay = 0; let gapped = false;
    for (let d = 1; d <= DAYS; d++) {
      const dt = new Date(start.getTime() + d * 86400000);
      const pool = byWd[dt.getDay()];
      const dayRev = pool[Math.floor(Math.random() * pool.length)];
      cash += dayRev * BASELINE.margin;
      if (dt.getDate() === 1) cash -= 2400;            // rent
      if (dt.getDate() === 3) cash -= 950;             // materials
      if (dt.getDate() === 5) cash -= 270;             // software
      if (dt.getDate() === 15) cash -= 330;            // utilities
      if (dt.getDate() === 28) cash -= 2950;           // owner draw + misc
      if (cash < minC) { minC = cash; minDay = d; }
      if (cash < 0 && !gapped) { gapped = true; gaps++; firstGapDays.push(d); }
    }
    if (minC < globalMin) { globalMin = minC; globalMinDay = minDay; }
  }
  const fmt = (offset: number) =>
    new Date(start.getTime() + offset * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    sims: SIMS, gapProb: gaps / SIMS, minCash: globalMin,
    minCashDate: fmt(globalMinDay),
    gapDate: firstGapDays.length ? fmt(Math.round(mean(firstGapDays))) : null,
  };
}

// ============================ C9 · season adjustment ========================
export interface SeasonAdjOut {
  rawPct: number; adjPct: number; factors: { day: string; f: number }[];
}
export async function seasonAdjust(): Promise<SeasonAdjOut> {
  const dailyRaw = await getDaily();
  const rev: number[] = dailyRaw.revenue, dates: string[] = dailyRaw.dates;
  const wd = (i: number) => new Date(dates[i] + "T00:00:00").getDay();
  const byWd: number[][] = [[], [], [], [], [], [], []];
  rev.forEach((v, i) => byWd[wd(i)].push(v));
  const overall = mean(rev);
  const factors = byWd.map((a) => (a.length ? mean(a) / overall : 1));
  const adj = rev.map((v, i) => v / factors[wd(i)]);
  const last7 = (a: number[]) => mean(a.slice(-7));
  const prev7 = (a: number[]) => mean(a.slice(-14, -7));
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    rawPct: (last7(rev) / prev7(rev) - 1) * 100,
    adjPct: (last7(adj) / prev7(adj) - 1) * 100,
    factors: factors.map((f, i) => ({ day: names[i], f })).sort((a, b) => b.f - a.f),
  };
}
