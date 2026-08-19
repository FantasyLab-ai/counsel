// money.ts — cash calendar, tax set-aside, AR aging. Calendar inflows come
// from YOUR weekday revenue profile (ledger-derived); outgoings are the same
// schedule the Monte Carlo runway uses (single source of truth).

import { BASELINE } from "./insights";
import { userInvoices, dataMode, getDaily, userExpenses } from "./dataSource";

/* ---- cash on hand: the one number no connector knows yet ----------------
   Set by the owner (or later by Plaid balances). Anchors the calendar, the
   13-week view, and runway. Null = not set; engines then show NET FLOW and
   say so instead of inventing a balance. */
const K_CASH = "counsel.cashOnHand";
export function getCashOnHand(): number | null {
  try {
    const v = localStorage.getItem(K_CASH);
    return v ? parseFloat(v) : null;
  } catch { return null; }
}
export function setCashOnHand(v: number): void {
  try { localStorage.setItem(K_CASH, String(Math.max(0, Math.round(v)))); } catch { /* fine */ }
}

/** Total monthly outgoings — recorded bills in live mode, the demo schedule
 * otherwise. The Pay Yourself floor is denominated in these. */
export function monthlyOutgoings(): number {
  if (dataMode() === "live") {
    const lb = liveBills();
    return lb ? lb.totalMonthly : 0;
  }
  return OUTGOINGS.reduce((s2, o) => s2 + o.amount, 0);
}

/* ---- bills derived from RECORDED expenses (live mode) -------------------
   Recurring detection, honestly simple: a vendor seen >=2 times with a
   ~monthly gap (25-35d) bills on its median day-of-month; ~weekly (5-9d)
   bills on its median weekday; everything else pools into an average
   variable daily spend. Every bucket is reconstructable from the rows. */
export interface LiveBills {
  monthly: { day: number; label: string; amount: number }[];
  weekly: { weekday: number; label: string; amount: number }[];
  variableDaily: number;
  totalMonthly: number;
}
export function liveBills(): LiveBills | null {
  const exp = userExpenses();
  if (!exp || !exp.length) return null;
  const byVendor = new Map<string, { d: string; amount: number }[]>();
  exp.forEach((e) => byVendor.set(e.vendor, [...(byVendor.get(e.vendor) ?? []), { d: e.d, amount: e.amount }]));
  const med = (xs: number[]) => { const s2 = [...xs].sort((a, b) => a - b); return s2[Math.floor(s2.length / 2)] ?? 0; };
  const monthly: LiveBills["monthly"] = [];
  const weekly: LiveBills["weekly"] = [];
  let variableTotal = 0;
  const ds = exp.map((e) => e.d).sort();
  const spanDays = Math.max(28, (new Date(ds[ds.length - 1] + "T00:00:00").getTime() - new Date(ds[0] + "T00:00:00").getTime()) / 86400000 + 1);
  byVendor.forEach((rows, vendor) => {
    const sorted = [...rows].sort((a, b) => (a.d < b.d ? -1 : 1));
    if (sorted.length >= 2) {
      const gaps = sorted.slice(1).map((r, i) =>
        (new Date(r.d + "T00:00:00").getTime() - new Date(sorted[i].d + "T00:00:00").getTime()) / 86400000);
      const g = med(gaps);
      if (g >= 25 && g <= 35) {
        monthly.push({ day: Math.round(med(sorted.map((r) => Number(r.d.slice(8, 10))))), label: vendor, amount: Math.round(med(sorted.map((r) => r.amount))) });
        return;
      }
      if (g >= 5 && g <= 9) {
        weekly.push({ weekday: Math.round(med(sorted.map((r) => new Date(r.d + "T00:00:00").getDay()))), label: vendor, amount: Math.round(med(sorted.map((r) => r.amount))) });
        return;
      }
    }
    variableTotal += sorted.reduce((s2, r) => s2 + r.amount, 0);
  });
  const variableDaily = variableTotal / spanDays;
  const totalMonthly = Math.round(
    monthly.reduce((s2, b) => s2 + b.amount, 0) + weekly.reduce((s2, b) => s2 + b.amount, 0) * 4.33 + variableDaily * 30.4,
  );
  return { monthly: monthly.sort((a, b) => a.day - b.day), weekly, variableDaily, totalMonthly };
}

// The one outgoing schedule — shared story with C8's simulation.
export const OUTGOINGS: { day: number; label: string; amount: number }[] = [
  { day: 1, label: "Studio rent", amount: 2400 },
  { day: 3, label: "Materials", amount: 950 },
  { day: 5, label: "Software", amount: 270 },
  { day: 15, label: "Utilities", amount: 330 },
  { day: 28, label: "Owner draw + misc", amount: 2950 },
];

export interface CalDay {
  iso: string; dom: number; weekday: number;
  inflow: number; outflow: number; outLabel: string | null;
  running: number; tightest: boolean; inMonth: boolean;
}
export interface CalendarOut {
  monthLabel: string; days: CalDay[]; tightestIso: string; tightestCash: number;
  totalIn: number; totalOut: number;
  mode: "demo" | "live";
  anchored: boolean;
  startCash: number;
}

export async function cashCalendar(): Promise<CalendarOut> {
  const dailyRaw = await getDaily();
  const rev: number[] = dailyRaw.revenue, dates: string[] = dailyRaw.dates;
  const byWd: number[][] = [[], [], [], [], [], [], []];
  dates.forEach((d, i) => byWd[new Date(d + "T00:00:00").getDay()].push(rev[i]));
  const wdMean = byWd.map((a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0));

  // Calendar month = the month after the ledger ends (the month you plan for).
  const last = new Date(dates[dates.length - 1] + "T00:00:00");
  const first = new Date(last.getFullYear(), last.getMonth() + 1, 1);
  const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();

  // Live mode: gross revenue in, ALL recorded spending out (recurring bills
  // on their days + variable daily) — no demo margin, no demo bill schedule.
  const live = dataMode() === "live";
  const bills = live ? liveBills() : null;
  const anchor = getCashOnHand();
  const startCash = live ? (anchor ?? 0) : BASELINE.cash;
  const anchored = live ? anchor !== null : true;

  let running = startCash;
  const days: CalDay[] = [];
  // leading blanks so the grid starts on Sunday
  for (let i = 0; i < first.getDay(); i++) {
    days.push({ iso: `blank-${i}`, dom: 0, weekday: i, inflow: 0, outflow: 0, outLabel: null, running: 0, tightest: false, inMonth: false });
  }
  let tightest = Infinity, tightestIso = "";
  let totalIn = 0, totalOut = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(first.getFullYear(), first.getMonth(), d);
    const inflow = live ? wdMean[dt.getDay()] : wdMean[dt.getDay()] * BASELINE.margin;
    let outflow: number;
    let outLabel: string | null;
    if (live && bills) {
      const outs = bills.monthly.filter((o) => o.day === d);
      const wk = bills.weekly.filter((o) => o.weekday === dt.getDay());
      outflow = outs.reduce((s, o) => s + o.amount, 0) + wk.reduce((s, o) => s + o.amount, 0) + bills.variableDaily;
      const labels = [...outs.map((o) => o.label), ...wk.map((o) => o.label)];
      outLabel = labels.length ? labels.join(" + ") : null;
    } else {
      const outs = OUTGOINGS.filter((o) => o.day === d);
      outflow = outs.reduce((s, o) => s + o.amount, 0);
      outLabel = outs.length ? outs.map((o) => o.label).join(" + ") : null;
    }
    running += inflow - outflow;
    totalIn += inflow; totalOut += outflow;
    const iso = dt.toISOString().slice(0, 10);
    if (running < tightest) { tightest = running; tightestIso = iso; }
    days.push({
      iso, dom: d, weekday: dt.getDay(), inflow, outflow, outLabel,
      running, tightest: false, inMonth: true,
    });
  }
  days.forEach((d) => { d.tightest = d.iso === tightestIso; });
  return { monthLabel, days, tightestIso, tightestCash: tightest, totalIn, totalOut, mode: live ? "live" : "demo", anchored, startCash };
}

// ---- tax set-aside (transparent, assumption-labeled) ------------------------
export interface TaxOut {
  monthlyProfit: number; rate: number; setAside: number; ytdPot: number; months: number;
}
export async function taxSetAside(): Promise<TaxOut> {
  // Simplified sole-prop math, every assumption visible in the UI:
  // SE tax ~15.3% on 92.35% of net + ~12% federal bracket ≈ 26% effective.
  const rate = 0.26;
  if (dataMode() === "live" && userExpenses()?.length) {
    const { dates, revenue } = await getDaily();
    const last = dates[dates.length - 1];
    const cut = new Date(new Date(last + "T00:00:00").getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const rev30 = revenue.filter((_, i) => dates[i] >= cut).reduce((s2, v) => s2 + v, 0);
    const exp30 = userExpenses()!.filter((e) => e.d >= cut).reduce((s2, e) => s2 + e.amount, 0);
    const profit = Math.max(0, rev30 - exp30);
    const monthsSet = new Set(userExpenses()!.map((e) => e.d.slice(0, 7))).size;
    return {
      monthlyProfit: Math.round(rev30 - exp30), rate,
      setAside: Math.round(profit * rate),
      ytdPot: Math.round(profit * rate * monthsSet),
      months: monthsSet,
    };
  }
  const monthlyProfit = BASELINE.avgProfit;
  const months = 3; // Jan-Mar of the demo year
  return {
    monthlyProfit, rate,
    setAside: monthlyProfit * rate,
    ytdPot: monthlyProfit * rate * months,
    months,
  };
}

// ---- AR aging ---------------------------------------------------------------
export interface ArInvoice {
  id: string; client: string; issued: string; due: string; amount: number;
  daysLate: number; bucket: "current" | "1-30" | "31-60" | "61+";
}
export interface ArOut {
  open: ArInvoice[]; totalOpen: number; overdue: number; dso: number;
  chase: ArInvoice[]; // sorted: oldest+largest first
}
export async function arAging(): Promise<ArOut> {
  // LIVE: the user's own issued invoices (CSV drop or Stripe/QuickBooks
  // pull). No invoices yet -> an honest empty book, never demo fixtures.
  let invoiceRows: { id: string; client: string; issued: string; due: string; amount: number; paid: string | null }[];
  let asof: number;
  if (dataMode() === "live") {
    invoiceRows = userInvoices() ?? [];
    asof = Date.now();
  } else {
    const raw = await (await fetch("/kiln_money.json")).json();
    invoiceRows = raw.invoices;
    asof = new Date(raw.asof + "T00:00:00").getTime();
  }
  const open: ArInvoice[] = [];
  let dsoNum = 0, dsoN = 0;
  for (const inv of invoiceRows) {
    if (inv.paid) {
      dsoNum += (new Date(inv.paid + "T00:00:00").getTime() - new Date(inv.issued + "T00:00:00").getTime()) / 86400000;
      dsoN++;
      continue;
    }
    const daysLate = Math.max(0, Math.round((asof - new Date(inv.due + "T00:00:00").getTime()) / 86400000));
    open.push({
      id: inv.id, client: inv.client, issued: inv.issued, due: inv.due, amount: inv.amount,
      daysLate,
      bucket: daysLate === 0 ? "current" : daysLate <= 30 ? "1-30" : daysLate <= 60 ? "31-60" : "61+",
    });
  }
  const overdueList = open.filter((i) => i.daysLate > 0);
  return {
    open,
    totalOpen: open.reduce((s, i) => s + i.amount, 0),
    overdue: overdueList.reduce((s, i) => s + i.amount, 0),
    dso: dsoN ? Math.round(dsoNum / dsoN) : 0,
    chase: [...overdueList].sort((a, b) => b.daysLate * b.amount - a.daysLate * a.amount),
  };
}

// ---- staffing-to-demand (weekday factors -> coverage suggestion) ------------
export interface StaffDay { day: string; factor: number; people: number; note?: string }
export async function staffingPlan(): Promise<StaffDay[]> {
  const dailyRaw = await getDaily();
  const rev: number[] = dailyRaw.revenue, dates: string[] = dailyRaw.dates;
  const byWd: number[][] = [[], [], [], [], [], [], []];
  dates.forEach((d, i) => byWd[new Date(d + "T00:00:00").getDay()].push(rev[i]));
  const overall = rev.reduce((s, v) => s + v, 0) / rev.length;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const factors = byWd.map((a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length / overall : 1));
  const min = Math.min(...factors);
  return names.map((day, i) => ({
    day,
    factor: factors[i],
    people: factors[i] >= 1.1 ? 2 : 1,
    note: factors[i] >= 1.1 ? "add the helper" : factors[i] === min ? "kiln/batch day" : undefined,
  }));
}
