// pnl.ts — the Profit & Loss statement: the one artifact every owner already
// knows how to read. One month at a time, revenue by product and expenses by
// category (each line openable to its receipts), net with margin, deltas vs
// the prior month — and for the current partial month, an honest
// weekday-weighted month-end projection with a band. Same rules as
// everywhere: computed, cited, and silent where data doesn't exist.

import { dataMode, userExpenses } from "./dataSource";
import { enriched, expenses as loadExpenses, type Charge, type Expense } from "./tierMath";

export interface PnlChild { name: string; amount: number; note?: string }

export interface PnlLine {
  name: string;
  amount: number;
  prev: number | null;      // same line, prior month (null = no prior data)
  children: PnlChild[];
}

export interface PnlForecast {
  share: number;            // weekday-weighted fraction of the month elapsed
  revLo: number; revMid: number; revHi: number;
  expProj: number;
  netLo: number; netMid: number; netHi: number;
  cv: number;               // the band width source (weekly variability)
}

export interface PnlOut {
  ok: true;
  monthIso: string;         // "2026-07"
  monthLabel: string;       // "July 2026"
  months: string[];         // every month present in the data (for the pager)
  isLatest: boolean;
  revenue: { total: number; prevTotal: number | null; lines: PnlLine[] };
  expensesAvailable: boolean;
  expenses: { total: number; prevTotal: number | null; lines: PnlLine[] };
  net: { amount: number; marginPct: number; prevAmount: number | null } | null;
  forecast: PnlForecast | null; // only for the latest, partial month
  cite: string;
}

export interface PnlThin { ok: false; reason: string }

const label = (ym: string) =>
  new Date(ym + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

const prevYm = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function revenueLines(charges: Charge[], ym: string): { total: number; byProduct: Map<string, { amount: number; units: number; prices: number[] }> } {
  const by = new Map<string, { amount: number; units: number; prices: number[] }>();
  let total = 0;
  for (const c of charges) {
    if (c.date.slice(0, 7) !== ym) continue;
    const amt = c.qty * c.price;
    total += amt;
    const p = by.get(c.product) ?? { amount: 0, units: 0, prices: [] };
    p.amount += amt; p.units += c.qty; p.prices.push(c.price);
    by.set(c.product, p);
  }
  return { total, byProduct: by };
}

function expenseLines(exp: Expense[], ym: string): { total: number; byCat: Map<string, Map<string, number>> } {
  const byCat = new Map<string, Map<string, number>>();
  let total = 0;
  for (const e of exp) {
    if (e.d.slice(0, 7) !== ym) continue;
    total += e.amount;
    const cat = e.cat || "other";
    const vendors = byCat.get(cat) ?? new Map<string, number>();
    vendors.set(e.vendor, (vendors.get(e.vendor) ?? 0) + e.amount);
    byCat.set(cat, vendors);
  }
  return { total, byCat };
}

export async function pnl(monthIso?: string): Promise<PnlOut | PnlThin> {
  const led = await enriched();
  const charges = led.charges;
  if (!charges.length) return { ok: false, reason: "no transactions yet" };

  // Live mode: only REAL expenses count — never the demo's.
  const live = dataMode() === "live";
  const exp: Expense[] = live ? (userExpenses() ?? []) : await loadExpenses();
  const expensesAvailable = !live || !!(userExpenses() && userExpenses()!.length);

  const months = [...new Set([
    ...charges.map((c) => c.date.slice(0, 7)),
    ...exp.map((e) => e.d.slice(0, 7)),
  ])].sort();
  const latest = months[months.length - 1];
  const ym = monthIso && months.includes(monthIso) ? monthIso : latest;
  const prior = prevYm(ym);
  const hasPrior = months.includes(prior);

  // ---- revenue ----
  const rev = revenueLines(charges, ym);
  const revPrev = hasPrior ? revenueLines(charges, prior) : null;
  const revLines: PnlLine[] = [...rev.byProduct.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([prod, v]) => {
      const med = [...v.prices].sort((x, y) => x - y)[Math.floor(v.prices.length / 2)] ?? 0;
      return {
        name: prod,
        amount: Math.round(v.amount),
        prev: revPrev ? Math.round(revPrev.byProduct.get(prod)?.amount ?? 0) : null,
        children: [
          { name: "units sold", amount: v.units, note: "count" },
          { name: "typical price", amount: Math.round(med * 100) / 100, note: "median" },
          { name: "share of revenue", amount: rev.total > 0 ? Math.round((v.amount / rev.total) * 100) : 0, note: "%" },
        ],
      };
    });

  // ---- expenses ----
  const ex = expenseLines(exp, ym);
  const exPrev = hasPrior ? expenseLines(exp, prior) : null;
  const expLines: PnlLine[] = [...ex.byCat.entries()]
    .map(([cat, vendors]) => ({
      name: cat,
      amount: Math.round([...vendors.values()].reduce((s, v) => s + v, 0)),
      prev: exPrev
        ? Math.round([...(exPrev.byCat.get(cat)?.values() ?? [])].reduce((s: number, v: number) => s + v, 0))
        : null,
      children: [...vendors.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([vendor, amt]) => ({ name: vendor, amount: Math.round(amt) })),
    }))
    .sort((a, b) => b.amount - a.amount);

  const net = expensesAvailable && rev.total > 0
    ? {
        amount: Math.round(rev.total - ex.total),
        marginPct: ((rev.total - ex.total) / rev.total) * 100,
        prevAmount: revPrev && exPrev ? Math.round(revPrev.total - exPrev.total) : null,
      }
    : null;

  // ---- month-end projection (latest partial month only) ----
  let forecast: PnlForecast | null = null;
  const isLatest = ym === latest;
  if (isLatest && charges.length > 30) {
    const [y, m] = ym.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const lastDate = charges.map((c) => c.date).sort()[charges.length - 1];
    const lastDom = Number(lastDate.slice(8, 10));
    // weekday weights from all history
    const byWd: number[][] = [[], [], [], [], [], [], []];
    const daily = new Map<string, number>();
    charges.forEach((c) => daily.set(c.date, (daily.get(c.date) ?? 0) + c.qty * c.price));
    daily.forEach((v, d) => byWd[new Date(d + "T00:00:00").getDay()].push(v));
    const wdMean = byWd.map((a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0));
    const w = (dom: number) => wdMean[new Date(y, m - 1, dom).getDay()];
    const totalW = Array.from({ length: daysInMonth }, (_, i) => w(i + 1)).reduce((s, v) => s + v, 0);
    const elapsedW = Array.from({ length: lastDom }, (_, i) => w(i + 1)).reduce((s, v) => s + v, 0);
    const share = totalW > 0 ? elapsedW / totalW : 1;

    if (share < 0.97 && share > 0.08) {
      // band from weekly variability (same standard as the goal contract)
      const weekly = new Map<string, number>();
      daily.forEach((v, d) => {
        const dt = new Date(d + "T00:00:00");
        dt.setDate(dt.getDate() - dt.getDay());
        const k = dt.toISOString().slice(0, 10);
        weekly.set(k, (weekly.get(k) ?? 0) + v);
      });
      const wk = [...weekly.entries()].sort().map(([, v]) => v).slice(-9, -1);
      const wMean = wk.reduce((s, v) => s + v, 0) / (wk.length || 1);
      const wSd = Math.sqrt(wk.reduce((s, v) => s + (v - wMean) ** 2, 0) / (wk.length || 1));
      const cv = wMean > 0 ? Math.min(0.35, wSd / wMean) : 0.2;

      const revMid = rev.total / share;
      // expenses: recorded so far + trailing burn rate over the remaining days
      const expDaily = (() => {
        if (!exp.length) return 0;
        const ds = exp.map((e) => e.d).sort();
        const span = Math.max(28, (new Date(ds[ds.length - 1] + "T00:00:00").getTime() - new Date(ds[0] + "T00:00:00").getTime()) / 86400000 + 1);
        return exp.reduce((s, e) => s + e.amount, 0) / span;
      })();
      const expProj = ex.total + expDaily * (daysInMonth - lastDom);
      forecast = {
        share,
        revLo: Math.round(revMid * (1 - cv)),
        revMid: Math.round(revMid),
        revHi: Math.round(revMid * (1 + cv)),
        expProj: Math.round(expProj),
        netLo: Math.round(revMid * (1 - cv) - expProj),
        netMid: Math.round(revMid - expProj),
        netHi: Math.round(revMid * (1 + cv) - expProj),
        cv,
      };
    }
  }

  return {
    ok: true,
    monthIso: ym,
    monthLabel: label(ym),
    months,
    isLatest,
    revenue: { total: Math.round(rev.total), prevTotal: revPrev ? Math.round(revPrev.total) : null, lines: revLines },
    expensesAvailable,
    expenses: { total: Math.round(ex.total), prevTotal: exPrev ? Math.round(exPrev.total) : null, lines: expLines },
    net,
    forecast,
    cite: `straight ledger arithmetic — revenue by product, expenses by recorded category, net = the difference · deltas vs ${hasPrior ? label(prior) : "(no prior month yet)"}${forecast ? ` · projection = weekday-weighted pace (${(forecast.share * 100).toFixed(0)}% of the month elapsed by weight), band = your ±${(forecast.cv * 100).toFixed(0)}% weekly swing, expenses at recorded burn rate` : ""}`,
  };
}
