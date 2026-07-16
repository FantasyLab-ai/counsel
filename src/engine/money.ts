// money.ts — cash calendar, tax set-aside, AR aging. Calendar inflows come
// from YOUR weekday revenue profile (ledger-derived); outgoings are the same
// schedule the Monte Carlo runway uses (single source of truth).

import { BASELINE } from "./insights";
import { getDaily } from "./dataSource";

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

  let running = BASELINE.cash;
  const days: CalDay[] = [];
  // leading blanks so the grid starts on Sunday
  for (let i = 0; i < first.getDay(); i++) {
    days.push({ iso: `blank-${i}`, dom: 0, weekday: i, inflow: 0, outflow: 0, outLabel: null, running: 0, tightest: false, inMonth: false });
  }
  let tightest = Infinity, tightestIso = "";
  let totalIn = 0, totalOut = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(first.getFullYear(), first.getMonth(), d);
    const inflow = wdMean[dt.getDay()] * BASELINE.margin;
    const outs = OUTGOINGS.filter((o) => o.day === d);
    const outflow = outs.reduce((s, o) => s + o.amount, 0);
    running += inflow - outflow;
    totalIn += inflow; totalOut += outflow;
    const iso = dt.toISOString().slice(0, 10);
    if (running < tightest) { tightest = running; tightestIso = iso; }
    days.push({
      iso, dom: d, weekday: dt.getDay(), inflow, outflow,
      outLabel: outs.length ? outs.map((o) => o.label).join(" + ") : null,
      running, tightest: false, inMonth: true,
    });
  }
  days.forEach((d) => { d.tightest = d.iso === tightestIso; });
  return { monthLabel, days, tightestIso, tightestCash: tightest, totalIn, totalOut };
}

// ---- tax set-aside (transparent, assumption-labeled) ------------------------
export interface TaxOut {
  monthlyProfit: number; rate: number; setAside: number; ytdPot: number; months: number;
}
export function taxSetAside(): TaxOut {
  // Simplified sole-prop math, every assumption visible in the UI:
  // SE tax ~15.3% on 92.35% of net + ~12% federal bracket ≈ 26% effective.
  const rate = 0.26;
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
  const raw = await (await fetch("/kiln_money.json")).json();
  const asof = new Date(raw.asof + "T00:00:00").getTime();
  const open: ArInvoice[] = [];
  let dsoNum = 0, dsoN = 0;
  for (const inv of raw.invoices as { id: string; client: string; issued: string; due: string; amount: number; paid: string | null }[]) {
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
