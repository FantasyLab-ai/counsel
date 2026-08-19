// ---------------------------------------------------------------------------
// dataSource.ts — ONE place every engine gets its fuel.
//
// Priority: the user's own dropped-in data (parsed on this device, stored in
// localStorage, never uploaded) > the bundled demo ledger. This is what turns
// the PWA into a real product with zero hosting: drop a CSV on your phone and
// every engine — sentry, elasticity, audit, calendar, staffing — recomputes
// on YOUR business. The privacy claim is literal: the file never leaves.
// ---------------------------------------------------------------------------

import type { Charge, EnrichedLedger, Expense } from "./tierMath";

const K_CHARGES = "counsel.user.charges";   // Charge[] (canonical, normalized)
const K_EXPENSES = "counsel.user.expenses"; // Expense[]
const K_META = "counsel.user.meta";         // { name, importedAt, rows }
const K_DEMO_VIEW = "counsel.demoView";     // "1" = showroom: engines see demo

export interface UserMeta { name: string; importedAt: string; rows: number }

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Demo showroom — a non-destructive VIEW switch. When on, every engine sees
 * the demo ledger (userCharges/userExpenses return null) while the user's
 * real data sits untouched in storage. Kept for testing & marketing. */
export function demoView(): boolean {
  try {
    return localStorage.getItem(K_DEMO_VIEW) === "1";
  } catch {
    return false;
  }
}

export function setDemoView(on: boolean): void {
  try {
    if (on) localStorage.setItem(K_DEMO_VIEW, "1");
    else localStorage.removeItem(K_DEMO_VIEW);
  } catch { /* view just won't stick */ }
}

/** The app-wide mode. "live" = real data present AND not in showroom view.
 * Screens use this to keep demo fixtures out of a live business's app. */
export function dataMode(): "demo" | "live" {
  return !demoView() && read<Charge[]>(K_CHARGES) !== null ? "live" : "demo";
}

export function userCharges(): Charge[] | null {
  if (demoView()) return null;
  return read<Charge[]>(K_CHARGES);
}
export function userExpenses(): Expense[] | null {
  if (demoView()) return null;
  return read<Expense[]>(K_EXPENSES);
}
export function userMeta(): UserMeta | null {
  return read<UserMeta>(K_META);
}
/** Raw: does stored user data exist (regardless of the showroom view)? */
export interface UserInvoice {
  id: string; client: string; issued: string; due: string; amount: number; paid: string | null;
}
const K_INVOICES = "counsel.user.invoices";

export function userInvoices(): UserInvoice[] | null {
  if (demoView()) return null;
  return read<UserInvoice[]>(K_INVOICES);
}

/** Store issued invoices (AR). Same no-mixing rule as every real import:
 *  arriving real data exits the showroom. */
export function storeInvoices(rows: UserInvoice[], name: string): void {
  try {
    localStorage.removeItem(K_DEMO_VIEW);
    localStorage.setItem(K_INVOICES, JSON.stringify(rows));
    const meta = read<UserMeta>(K_META);
    localStorage.setItem(K_META, JSON.stringify({
      name: meta?.name ? `${meta.name} + ${name}` : name,
      importedAt: new Date().toISOString().slice(0, 10),
      rows: (meta?.rows ?? 0) + rows.length,
    } satisfies UserMeta));
  } catch {
    throw new Error("Invoice file too large for on-device storage.");
  }
}

export function hasUserData(): boolean {
  return read<Charge[]>(K_CHARGES) !== null;
}

export function storeUserData(charges: Charge[] | null, expenses: Expense[] | null, name: string): void {
  try {
    // Real data arriving always exits the showroom: one connection or
    // import means the user came for THEIR numbers. Demo never mixes in.
    localStorage.removeItem(K_DEMO_VIEW);
    if (charges) localStorage.setItem(K_CHARGES, JSON.stringify(charges));
    if (expenses) localStorage.setItem(K_EXPENSES, JSON.stringify(expenses));
    localStorage.setItem(K_META, JSON.stringify({
      name,
      importedAt: new Date().toISOString().slice(0, 10),
      rows: (charges?.length ?? 0) + (expenses?.length ?? 0),
    } satisfies UserMeta));
  } catch (e) {
    throw new Error("File too large for on-device storage (~4 MB limit). Try a shorter date range.");
  }
}

export function clearUserData(): void {
  try {
    localStorage.removeItem(K_CHARGES);
    localStorage.removeItem(K_EXPENSES);
    localStorage.removeItem(K_INVOICES);
    localStorage.removeItem(K_META);
  } catch {
    /* nothing to clear */
  }
}

// ---- derived views ----------------------------------------------------------

export interface DailySeries { dates: string[]; revenue: number[] }

/** Daily revenue series — from user charges when present, else the demo file. */
export async function getDaily(): Promise<DailySeries> {
  const uc = userCharges();
  if (uc && uc.length) {
    const byDay = new Map<string, number>();
    uc.forEach((c) => byDay.set(c.date, (byDay.get(c.date) ?? 0) + c.qty * c.price));
    const dates = [...byDay.keys()].sort();
    return { dates, revenue: dates.map((d) => Math.round(byDay.get(d)! * 100) / 100) };
  }
  // Live mode NEVER falls back to the demo file — a connected business
  // with no revenue rows yet sees honest emptiness, not Kiln & Co.
  if (dataMode() === "live") return { dates: [], revenue: [] };
  return (await fetch("/kiln_daily.json")).json();
}

/** Enriched ledger — user charges when present, else the demo ledger file. */
export async function getEnriched(demoLoader: () => Promise<EnrichedLedger>): Promise<EnrichedLedger> {
  const uc = userCharges();
  if (uc && uc.length) {
    // Products inferred from the data itself; price change detection is left
    // to the engines (they detect, not assume). Costs unknown -> honest 55%
    // of median price assumption, labeled wherever it's used.
    const byProd = new Map<string, { prices: number[] }>();
    uc.forEach((c) => {
      const p = byProd.get(c.product) ?? { prices: [] };
      p.prices.push(c.price);
      byProd.set(c.product, p);
    });
    const products = [...byProd.entries()].map(([id, v]) => {
      const sorted = [...v.prices].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
      return { id, name: id, price0: med, cost: Math.round(med * 0.55 * 100) / 100 };
    });
    // Price-change hint: product whose mean price shifted most between the
    // first and second half of the window (engines still verify with math).
    let pc = { product: products[0]?.id ?? "", date: "", from: 0, to: 0 };
    let best = 0;
    const dates = [...new Set(uc.map((c) => c.date))].sort();
    const midDate = dates[Math.floor(dates.length / 2)] ?? "";
    byProd.forEach((_, id) => {
      const pre = uc.filter((c) => c.product === id && c.date < midDate).map((c) => c.price);
      const post = uc.filter((c) => c.product === id && c.date >= midDate).map((c) => c.price);
      if (pre.length < 5 || post.length < 5) return;
      const m = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
      const shift = Math.abs(m(post) / m(pre) - 1);
      if (shift > best && shift > 0.02) {
        best = shift;
        // first date where the new price appears
        const newPrice = m(post);
        const firstAt = uc.filter((c) => c.product === id && Math.abs(c.price - newPrice) / newPrice < 0.03)
          .map((c) => c.date).sort()[0] ?? midDate;
        pc = { product: id, date: firstAt, from: Math.round(m(pre) * 100) / 100, to: Math.round(m(post) * 100) / 100 };
      }
    });
    return { products, priceChange: pc, charges: uc };
  }
  if (dataMode() === "live") {
    return { products: [], priceChange: { product: "", date: "", from: 0, to: 0 }, charges: [] };
  }
  return demoLoader();
}

/** Expenses — user file when present, else the demo file. */
export async function getExpenses(demoLoader: () => Promise<Expense[]>): Promise<Expense[]> {
  const ue = userExpenses();
  if (ue && ue.length) return ue;
  // Same rule: a live business without expenses connected gets an empty
  // list (screens show their awaiting cards) — never demo spending.
  if (dataMode() === "live") return [];
  return demoLoader();
}
