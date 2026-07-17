// dayEconomics.ts — persona unit economics: the working-day P&L. A food
// truck thinks in service days, a landscaper in job days, a maker in
// selling days — so Counsel speaks THAT unit: what a typical day earns
// (banded), what a day must clear (the owner's own number, editable), and
// how many days actually clear it. No projections — counted days.

import { getDaily, dataMode } from "./dataSource";
import { getPersona } from "./persona";
import { money } from "./tierMath";

export interface DayEconomics {
  ok: true;
  unit: string;          // "service day" / "job day" / "selling day" / "working day"
  activePerWeek: number; // distinct active days per week (recent 8 weeks)
  p25: number; median: number; p75: number;
  threshold: number;     // $ a day must clear
  thresholdIsDefault: boolean;
  pctClearing: number;   // % of active days above threshold
  bestDay: string;       // weekday name with the highest median
  headline: string;
  cite: string;
}

export interface DayEconThin { ok: false; reason: string }

const KEY = "counsel.dayCost";
const DEMO_DEFAULT = 265; // demo outgoings ≈ $6,900/mo over ~26 working days

const UNIT_BY_GROUP: Record<string, string> = {
  "Food & drink": "service day",
  "Trades & field": "job day",
  "Retail & products": "selling day",
  "Appointments & studios": "booked day",
  "Professional services": "billable day",
  "Property & transport": "working day",
};

export function getDayCost(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? parseFloat(v) : null;
  } catch {
    return null;
  }
}

export function setDayCost(v: number): void {
  try { localStorage.setItem(KEY, String(Math.max(1, Math.round(v)))); } catch { /* fine */ }
}

const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
};

export async function dayEconomics(): Promise<DayEconomics | DayEconThin> {
  const { dates, revenue } = await getDaily();
  if (dates.length < 14) return { ok: false, reason: `needs ~2 weeks of trading days (has ${dates.length})` };

  // Recent regime: last 56 days of ACTIVE days (revenue > 0).
  const rows = dates.map((d, i) => ({ d, rev: revenue[i] })).filter((r) => r.rev > 0).slice(-56);
  if (rows.length < 10) return { ok: false, reason: "needs 10+ active days in the recent window" };

  const revs = rows.map((r) => r.rev);
  const spanDays = (new Date(rows[rows.length - 1].d).getTime() - new Date(rows[0].d).getTime()) / 86400000 + 1;
  const activePerWeek = Math.round((rows.length / Math.max(7, spanDays)) * 7 * 10) / 10;

  const stored = getDayCost();
  const threshold = stored ?? DEMO_DEFAULT;
  const clearing = revs.filter((v) => v >= threshold).length;

  // Best weekday by median.
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const byWd: number[][] = [[], [], [], [], [], [], []];
  rows.forEach((r) => byWd[new Date(r.d + "T00:00:00").getDay()].push(r.rev));
  let bestDay = "—", bestMed = -1;
  byWd.forEach((a, i) => {
    if (a.length >= 2) {
      const m = pct(a, 50);
      if (m > bestMed) { bestMed = m; bestDay = names[i]; }
    }
  });

  const persona = getPersona();
  const unit = UNIT_BY_GROUP[persona?.group ?? ""] ?? "working day";
  const median = pct(revs, 50);
  const pctClearing = Math.round((clearing / revs.length) * 100);

  const headline =
    pctClearing >= 80
      ? `A typical ${unit} brings <b>${money(median)}</b> — and <b>${pctClearing}%</b> of your days clear the ${money(threshold)} bar. The unit works; scale it.`
      : pctClearing >= 55
        ? `A typical ${unit} brings <b>${money(median)}</b>; <b>${pctClearing}%</b> of days clear your ${money(threshold)} bar — the shape of the week decides the month.`
        : `A typical ${unit} brings <b>${money(median)}</b>, but only <b>${pctClearing}%</b> of days clear the ${money(threshold)} bar — worth choosing days, not just adding them.`;

  return {
    ok: true,
    unit,
    activePerWeek,
    p25: Math.round(pct(revs, 25)), median: Math.round(median), p75: Math.round(pct(revs, 75)),
    threshold,
    thresholdIsDefault: stored === null,
    pctClearing,
    bestDay,
    headline,
    cite: `last ${rows.length} active days · band = p25–p75 of real days, median marked · the bar is ${stored === null ? (dataMode() === "live" ? "a placeholder until you set YOUR daily cost" : "the demo's fixed costs ÷ 26 working days") : "your number"} · best ${unit}: ${bestDay}`,
  };
}
