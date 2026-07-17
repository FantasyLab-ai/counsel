// goals.ts — goal contracts: the steering wheel. The owner names a monthly
// revenue target; Counsel tracks PACE against it — not naive days-elapsed
// pace, but weekday-weighted pace (your Saturdays count for more than your
// Mondays), with an honest band from your recent weekly variability. Behind
// beyond the band -> a course-correction proposal, not a shrug.

import { getDaily } from "./dataSource";
import { money } from "./tierMath";

export interface Goal { monthlyTarget: number; setAt: string }

export interface GoalPace {
  ok: true;
  target: number;
  monthLabel: string;
  actualMTD: number;
  expectedShare: number;   // weekday-weighted fraction of the month elapsed
  expectedMTD: number;     // target × expectedShare
  paceRatio: number;       // actual / expected (1.0 = exactly on pace)
  bandLo: number;          // on-pace band from weekly variability
  bandHi: number;
  status: "ahead" | "on-pace" | "behind";
  projected: number;       // actual / expectedShare — the naive month-end read
  headline: string;
  cite: string;
}

export interface GoalThin { ok: false; reason: string }

const KEY = "counsel.goal";

export function getGoal(): Goal | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Goal) : null;
  } catch {
    return null;
  }
}

export function setGoal(monthlyTarget: number): Goal {
  const g: Goal = { monthlyTarget: Math.round(monthlyTarget), setAt: new Date().toISOString().slice(0, 10) };
  try { localStorage.setItem(KEY, JSON.stringify(g)); } catch { /* won't persist */ }
  return g;
}

export function clearGoal(): void {
  try { localStorage.removeItem(KEY); } catch { /* fine */ }
}

/** A sensible suggested target: median of recent complete months, +8%. */
export async function suggestTarget(): Promise<number | null> {
  const { dates, revenue } = await getDaily();
  const byMonth = new Map<string, number>();
  dates.forEach((d, i) => byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + revenue[i]));
  const months = [...byMonth.entries()].sort();
  const complete = months.slice(0, -1).map(([, v]) => v); // drop the partial tail month
  if (complete.length < 1) return null;
  const s = [...complete].sort((a, b) => a - b);
  const med = s[Math.floor(s.length / 2)];
  return Math.round((med * 1.08) / 100) * 100;
}

export async function goalPace(): Promise<GoalPace | GoalThin> {
  const goal = getGoal();
  if (!goal) return { ok: false, reason: "no target set" };
  const { dates, revenue } = await getDaily();
  if (dates.length < 14) return { ok: false, reason: "needs ~2 weeks of history for weekday weights" };

  // Anchor month = the month of the last data date (works for demo + live).
  const last = dates[dates.length - 1];
  const ym = last.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Weekday weights from ALL history (mean revenue per weekday).
  const byWd: number[][] = [[], [], [], [], [], [], []];
  dates.forEach((d, i) => byWd[new Date(d + "T00:00:00").getDay()].push(revenue[i]));
  const wdMean = byWd.map((a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0));
  const totalW = Array.from({ length: daysInMonth }, (_, i) =>
    wdMean[new Date(y, m - 1, i + 1).getDay()]).reduce((s, v) => s + v, 0);
  const elapsedW = Array.from({ length: Number(last.slice(8, 10)) }, (_, i) =>
    wdMean[new Date(y, m - 1, i + 1).getDay()]).reduce((s, v) => s + v, 0);
  const expectedShare = totalW > 0 ? elapsedW / totalW : 0;

  // Actual month-to-date.
  let actualMTD = 0;
  dates.forEach((d, i) => { if (d.slice(0, 7) === ym) actualMTD += revenue[i]; });

  // Band: weekly coefficient of variation over the last 8 complete weeks.
  const weekly = new Map<string, number>();
  dates.forEach((d, i) => {
    const dt = new Date(d + "T00:00:00");
    dt.setDate(dt.getDate() - dt.getDay());
    const w = dt.toISOString().slice(0, 10);
    weekly.set(w, (weekly.get(w) ?? 0) + revenue[i]);
  });
  const wk = [...weekly.entries()].sort().map(([, v]) => v).slice(-9, -1);
  const wMean = wk.reduce((s, v) => s + v, 0) / (wk.length || 1);
  const wSd = Math.sqrt(wk.reduce((s, v) => s + (v - wMean) ** 2, 0) / (wk.length || 1));
  const cv = wMean > 0 ? Math.min(0.35, wSd / wMean) : 0.2;

  const expectedMTD = goal.monthlyTarget * expectedShare;
  const paceRatio = expectedMTD > 0 ? actualMTD / expectedMTD : 0;
  const bandLo = 1 - cv, bandHi = 1 + cv;
  const status: GoalPace["status"] = paceRatio > bandHi ? "ahead" : paceRatio < bandLo ? "behind" : "on-pace";
  const projected = expectedShare > 0.05 ? actualMTD / expectedShare : 0;

  const gapNow = actualMTD - expectedMTD;
  const headline =
    status === "ahead"
      ? `<b>Ahead of pace</b> — ${money(actualMTD)} against an expected ${money(expectedMTD)} by now (${money(gapNow)} ahead). Projection: ${money(projected)}.`
      : status === "behind"
        ? `<b>Behind pace</b> — ${money(actualMTD)} against an expected ${money(expectedMTD)} by now (${money(-gapNow)} short, beyond the ±${(cv * 100).toFixed(0)}% band). Projection: ${money(projected)} vs the ${money(goal.monthlyTarget)} target.`
        : `<b>On pace</b> — ${money(actualMTD)} vs ${money(expectedMTD)} expected by now, inside your normal ±${(cv * 100).toFixed(0)}% weekly swing. Projection: ${money(projected)}.`;

  return {
    ok: true,
    target: goal.monthlyTarget,
    monthLabel,
    actualMTD: Math.round(actualMTD),
    expectedShare,
    expectedMTD: Math.round(expectedMTD),
    paceRatio,
    bandLo, bandHi,
    status,
    projected: Math.round(projected),
    headline,
    cite: `pace is weekday-weighted (your ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][wdMean.indexOf(Math.max(...wdMean))]}s count for more) · on-pace band = your last-8-weeks weekly variability (±${(cv * 100).toFixed(0)}%) · projection = simple pace extension, not a forecast promise`,
  };
}
