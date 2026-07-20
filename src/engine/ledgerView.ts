// ledgerView.ts — the ground truth, listed. Every transaction Counsel
// consumes (sales and expenses, all sources merged) as inspectable rows:
// source, value, what it was for — with the egregious ones PINNED by
// transparent rules, each flag naming the claim it feeds. This is the
// "trace any claim back to the rows" promise made into a screen.

import { dataMode, userExpenses } from "./dataSource";
import { enriched, expenses as loadExpenses, money, type Charge, type Expense } from "./tierMath";

export interface TxFlag {
  code: "price-outlier" | "top-sale" | "duplicate" | "vendor-outlier" | "fee-outlier" | "best-day";
  reason: string;   // plain English, names the claim it feeds
}

export interface TxRow {
  id: string;
  kind: "sale" | "expense";
  date: string;
  source: string;   // channel (sales) or vendor's category (expenses)
  label: string;    // product or vendor
  amount: number;   // qty*price for sales, amount for expenses
  qty?: number;
  price?: number;
  fee?: number;
  customer?: string;
  cat?: string;
  context?: string; // "typical for this product: $34 (median of 214 sales)"
  flags: TxFlag[];
}

export interface LedgerViewOut {
  ok: true;
  rows: TxRow[];      // newest first, unpinned
  pinned: TxRow[];    // flagged, newest first
  saleCount: number;
  expenseCount: number;
  saleTotal: number;
  expenseTotal: number;
  cite: string;
}

export interface LedgerViewThin { ok: false; reason: string }

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mad = (xs: number[], med: number): number =>
  median(xs.map((x) => Math.abs(x - med)));

export async function ledgerView(): Promise<LedgerViewOut | LedgerViewThin> {
  const led = await enriched();
  const charges = led.charges;
  if (!charges.length) return { ok: false, reason: "no transactions on file yet" };

  const live = dataMode() === "live";
  const exp: Expense[] = live ? (userExpenses() ?? []) : await loadExpenses();

  // ---- per-product stats for outlier rules ----
  const byProd = new Map<string, number[]>();
  charges.forEach((c) => byProd.set(c.product, [...(byProd.get(c.product) ?? []), c.price]));
  const prodStats = new Map<string, { med: number; mad: number; n: number }>();
  byProd.forEach((prices, prod) => {
    const m = median(prices);
    prodStats.set(prod, { med: m, mad: mad(prices, m) || m * 0.1 || 1, n: prices.length });
  });

  const priceFreq = new Map<string, number>();
  charges.forEach((c) => {
    const k = `${c.product}|${c.price}`;
    priceFreq.set(k, (priceFreq.get(k) ?? 0) + 1);
  });

  const saleAmounts = charges.map((c) => c.qty * c.price).sort((a, b) => a - b);
  const p99 = saleAmounts[Math.floor(saleAmounts.length * 0.99)] ?? Infinity;
  const feeRates = charges.filter((c) => c.fee > 0 && c.qty * c.price > 0).map((c) => c.fee / (c.qty * c.price));
  const feeMed = median(feeRates);

  // best revenue day (a positive pin — the day worth studying)
  const byDay = new Map<string, number>();
  charges.forEach((c) => byDay.set(c.date, (byDay.get(c.date) ?? 0) + c.qty * c.price));
  let bestDay = "", bestVal = -1;
  byDay.forEach((v, d) => { if (v > bestVal) { bestVal = v; bestDay = d; } });
  // the day's emblem: its single largest transaction, not its whole roster
  let bestDayEmblem = -1, bestDayMax = -1;
  charges.forEach((c, i) => {
    if (c.date === bestDay && c.qty * c.price > bestDayMax) { bestDayMax = c.qty * c.price; bestDayEmblem = i; }
  });

  // ---- vendor stats + duplicate detection for expenses ----
  const byVendor = new Map<string, Expense[]>();
  exp.forEach((e) => byVendor.set(e.vendor, [...(byVendor.get(e.vendor) ?? []), e]));
  const dupIds = new Set<string>();
  byVendor.forEach((rows) => {
    const sorted = [...rows].sort((a, b) => (a.d < b.d ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      const gap = (new Date(sorted[i].d + "T00:00:00").getTime() - new Date(sorted[i - 1].d + "T00:00:00").getTime()) / 86400000;
      if (gap === 0 && Math.abs(sorted[i].amount - sorted[i - 1].amount) < 0.01) {
        dupIds.add(`${sorted[i].vendor}|${sorted[i].d}|${sorted[i].amount}`);
      }
    }
  });

  // ---- price outliers, two-pass: gather candidates, then keep only the
  // rare and extreme. A product where "outliers" are common is running
  // TIERED pricing (wholesale, discounts) — that's structure for the
  // engines, not rows for the pin board.
  const priceCandidates = new Map<string, { idx: number; dev: number }[]>();
  charges.forEach((c, i) => {
    const ps = prodStats.get(c.product)!;
    const sharedLevel = (priceFreq.get(`${c.product}|${c.price}`) ?? 0);
    const dev = Math.abs(c.price - ps.med);
    if (ps.n >= 8 && dev > 4 * ps.mad && dev > 0.15 * ps.med && sharedLevel <= 2) {
      priceCandidates.set(c.product, [...(priceCandidates.get(c.product) ?? []), { idx: i, dev }]);
    }
  });
  const priceFlagIdx = new Set<number>();
  priceCandidates.forEach((cands, prod) => {
    const n = prodStats.get(prod)!.n;
    if (cands.length / n > 0.2) return; // tiered pricing — structure, skip
    [...cands].sort((a, b) => b.dev - a.dev).slice(0, 2).forEach((c2) => priceFlagIdx.add(c2.idx));
  });

  // ---- build rows ----
  const rows: TxRow[] = [];
  charges.forEach((c, i) => {
    const amount = c.qty * c.price;
    const ps = prodStats.get(c.product)!;
    const flags: TxFlag[] = [];
    if (priceFlagIdx.has(i)) {
      flags.push({ code: "price-outlier", reason: `price far outside ${c.product}'s normal (${money(ps.med)} median) · the kind of row that skews A1 price power` });
    }
    if (saleAmounts.length >= 50 && amount >= p99 && amount > ps.med * 2) {
      flags.push({ code: "top-sale", reason: "top 1% sale by size · moves daily totals the sentinel judges" });
    }
    if (c.fee > 0 && amount > 0 && feeMed > 0 && c.fee / amount > 2 * feeMed) {
      flags.push({ code: "fee-outlier", reason: `fee rate ${((c.fee / amount) * 100).toFixed(1)}% vs your ${(feeMed * 100).toFixed(1)}% norm · feeds B5 the audit` });
    }
    if (i === bestDayEmblem) {
      flags.push({ code: "best-day", reason: `the biggest sale of your best day on record (${money(bestVal)} that day) · worth studying, then repeating` });
    }
    rows.push({
      id: `s-${i}`,
      kind: "sale",
      date: c.date,
      source: c.channel || "sale",
      label: c.product,
      amount: Math.round(amount * 100) / 100,
      qty: c.qty,
      price: c.price,
      fee: c.fee || undefined,
      customer: c.customer !== "guest" ? c.customer : undefined,
      context: ps.n >= 3 ? `typical for ${c.product}: ${money(ps.med)} (median of ${ps.n} sales)` : undefined,
      flags,
    });
  });

  exp.forEach((e, i) => {
    const vendorRows = byVendor.get(e.vendor) ?? [];
    const vMed = median(vendorRows.map((r) => r.amount));
    const flags: TxFlag[] = [];
    if (dupIds.has(`${e.vendor}|${e.d}|${e.amount}`)) {
      flags.push({ code: "duplicate", reason: `same vendor, same amount, within a day · exactly what B5 the audit hunts — worth a refund call` });
    }
    if (vendorRows.length >= 3 && e.amount > 3 * vMed && e.amount - vMed > 50) {
      flags.push({ code: "vendor-outlier", reason: `${(e.amount / Math.max(1, vMed)).toFixed(1)}× ${e.vendor}'s usual ${money(vMed)} · pressure on the posture's coverage math` });
    }
    rows.push({
      id: `e-${i}`,
      kind: "expense",
      date: e.d,
      source: e.cat || "expense",
      label: e.vendor,
      amount: Math.round(e.amount * 100) / 100,
      cat: e.cat,
      context: vendorRows.length >= 3 ? `typical for ${e.vendor}: ${money(vMed)} (${vendorRows.length} charges)` : undefined,
      flags,
    });
  });

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const pinned = rows.filter((r) => r.flags.length > 0);
  const unpinned = rows.filter((r) => r.flags.length === 0);

  return {
    ok: true,
    rows: unpinned,
    pinned,
    saleCount: charges.length,
    expenseCount: exp.length,
    saleTotal: Math.round(charges.reduce((s, c) => s + c.qty * c.price, 0)),
    expenseTotal: Math.round(exp.reduce((s, e) => s + e.amount, 0)),
    cite: `every consumed row, all sources merged · flag rules, all visible: the 2 most extreme rare prices per product (tiered pricing recognized as structure, never pinned) · top-1% sale size · fee rate over 2× your norm · same vendor+amount on the same day · 3×+ a vendor's usual · the biggest sale of your best day`,
  };
}
