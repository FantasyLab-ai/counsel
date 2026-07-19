// paySelf.ts — the number nobody computes: what can the owner SAFELY pay
// themselves? Not a new model — a new question asked of the engine we
// already trust: the safe draw is the LARGEST monthly salary the 13-week
// view can carry on the cautious path (p15 revenue every single week)
// without cash ever dipping below the safety floor — after bills, variable
// spend, and the tax set-aside. Found by binary search over the simulator,
// so the number's receipt IS the 13-week ribbon.
//
// Refusals are the feature: critical posture -> "not yet, fix the bleed
// first"; no expenses/anchor/history -> say exactly what's missing. When
// the number finally exists, it means something.

import { cashView } from "./cashview";
import { getCashOnHand, monthlyOutgoings, taxSetAside } from "./money";
import { financialPosture } from "./posture";
import { dataMode, getDaily, userExpenses } from "./dataSource";
import { money } from "./tierMath";

export interface PayPlan {
  ok: true;
  safeMonthly: number;      // cautious-path maximum (rounded down to $50)
  midMonthly: number;       // if the mid path holds (labeled aspiration)
  floor: number;            // the safety floor used
  floorIsDefault: boolean;
  payday: string;           // "the 1st & 15th"
  taxMonthly: number;       // set-aside included in the sim
  warChest: string | null;  // seasonal-volatility note
  headline: string;         // <em> allowed
  sub: string;
  cite: string;
}

export interface PayRefusal {
  ok: false;
  reason: "posture" | "expenses" | "anchor" | "history" | "capacity";
  headline: string;
  sub: string;
}

const K_FLOOR = "counsel.payFloor";

export function getPayFloor(): number | null {
  try {
    const v = localStorage.getItem(K_FLOOR);
    return v ? parseFloat(v) : null;
  } catch { return null; }
}
export function setPayFloor(v: number): void {
  try { localStorage.setItem(K_FLOOR, String(Math.max(0, Math.round(v)))); } catch { /* fine */ }
}

const round50 = (v: number) => Math.floor(v / 50) * 50;

/** Simulate the 13 weeks carrying a draw. TWO constraints make it a salary
 * rather than a liquidation schedule:
 *   1. the floor — cash never dips below it mid-quarter (bill timing), and
 *   2. sustainability — the path ENDS no lower than it started: the draw is
 *      earned by the business, never eaten out of savings. */
async function simulate(drawMonthly: number, taxMonthly: number): Promise<{
  minLo: number; minMid: number; endLo: number; endMid: number; startCash: number;
} | null> {
  const extra = [
    { day: 1, label: "owner draw", amount: drawMonthly / 2 },
    { day: 15, label: "owner draw", amount: drawMonthly / 2 },
    ...(taxMonthly > 0 ? [{ day: 20, label: "tax set-aside", amount: taxMonthly }] : []),
  ];
  const cv = await cashView({ extraMonthly: extra });
  if (!cv.ok) return null;
  const last = cv.weeks[cv.weeks.length - 1];
  return {
    minLo: Math.min(...cv.weeks.map((w) => w.cumLo)),
    minMid: Math.min(...cv.weeks.map((w) => w.cumMid)),
    endLo: last.cumLo,
    endMid: last.cumMid,
    startCash: cv.startCash,
  };
}

async function maxDraw(taxMonthly: number, floor: number, path: "lo" | "mid"): Promise<number> {
  let lo = 0;
  let hi = 30000;
  const fits = async (d: number) => {
    const r = await simulate(d, taxMonthly);
    if (!r) return false;
    const dip = path === "lo" ? r.minLo : r.minMid;
    const end = path === "lo" ? r.endLo : r.endMid;
    return dip >= floor && end >= r.startCash; // earned, not eaten
  };
  if (!(await fits(0))) return 0;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (await fits(mid)) lo = mid; else hi = mid;
  }
  return round50(lo);
}

export async function payYourself(): Promise<PayPlan | PayRefusal> {
  // ---- the refusals, in order of what matters most ----
  const posture = await financialPosture().catch(() => null);
  if (posture && posture.level === "critical") {
    return {
      ok: false, reason: "posture",
      headline: `Not yet — <em>the first move is the bleed.</em>`,
      sub: `${posture.sub} Fix that, and this number exists. That's a promise, not a brush-off.`,
    };
  }
  const live = dataMode() === "live";
  if (live && !userExpenses()?.length) {
    return {
      ok: false, reason: "expenses",
      headline: `This number needs your <em>expenses.</em>`,
      sub: `A safe salary is computed against your real bills — connect the bank or drop an expense CSV in Power Up.`,
    };
  }
  if (live && getCashOnHand() === null) {
    return {
      ok: false, reason: "anchor",
      headline: `Set your <em>cash on hand</em> first.`,
      sub: `The draw is anchored to your actual cash position — one number, set once on the Money screen.`,
    };
  }
  const { dates } = await getDaily();
  if (dates.length < 28) {
    return {
      ok: false, reason: "history",
      headline: `Warming up — <em>${dates.length} of 28 days.</em>`,
      sub: `A salary you can trust needs a month of revenue rhythm. I'll compute it the day the history is there.`,
    };
  }

  // ---- the number ----
  const outgo = monthlyOutgoings();
  const stored = getPayFloor();
  const floor = stored ?? Math.round(outgo / 2); // default: two weeks of bills
  const tax = await taxSetAside().catch(() => null);
  const taxMonthly = tax?.setAside ?? 0;

  const safeMonthly = await maxDraw(taxMonthly, floor, "lo");
  const midMonthly = Math.max(safeMonthly, await maxDraw(taxMonthly, floor, "mid"));

  if (safeMonthly <= 0) {
    return {
      ok: false, reason: "capacity",
      headline: `The cautious case can't carry a draw <em>yet.</em>`,
      sub: `On the p15 revenue path, any salary at all would either break the ${money(floor)} floor or eat into savings. The levers: the posture's first move, the price test, the win-back — then this number turns positive.`,
    };
  }

  // ---- seasonal war-chest note (weekly variability) ----
  const { revenue } = await getDaily();
  const weekly: number[] = [];
  for (let i = revenue.length - 1; i >= 0; i -= 7) {
    weekly.unshift(revenue.slice(Math.max(0, i - 6), i + 1).reduce((s, v) => s + v, 0));
    if (weekly.length >= 8) break;
  }
  const wMean = weekly.reduce((s, v) => s + v, 0) / (weekly.length || 1);
  const wSd = Math.sqrt(weekly.reduce((s, v) => s + (v - wMean) ** 2, 0) / (weekly.length || 1));
  const cv = wMean > 0 ? wSd / wMean : 0;
  const warChest = cv > 0.25
    ? `Your weeks swing ±${Math.round(cv * 100)}% — keep the draw LEVEL and bank the peak weeks; the flat salary is what makes the slow season survivable.`
    : null;

  return {
    ok: true,
    safeMonthly,
    midMonthly,
    floor,
    floorIsDefault: stored === null,
    payday: "the 1st & 15th",
    taxMonthly,
    warChest,
    headline: `You can safely pay yourself <em>${money(safeMonthly)}/mo.</em>`,
    sub: midMonthly > safeMonthly
      ? `${money(safeMonthly / 2)} on the 1st and the 15th — earned by the business, never eaten from savings: even on the cautious path, cash ends the quarter no lower than it starts and never dips below your ${money(floor)} floor. If the mid path holds, ${money(midMonthly)} fits — but the safe number is the one to sign.`
      : `${money(safeMonthly / 2)} on the 1st and the 15th — earned, not eaten: the cautious path ends the quarter no lower than it starts and never dips below your ${money(floor)} floor.`,
    cite: `the largest monthly draw the 13-week view carries on the p15 path with cash ENDING no lower than it started (earned, not eaten) and never breaching the floor · found by binary search over the same simulator behind the Money screen · draw split 1st & 15th · tax set-aside ${taxMonthly > 0 ? money(taxMonthly) + "/mo included (day 20)" : "none this window"} · floor ${stored === null ? "= two weeks of bills (default — set yours)" : "= your number"} · owner's draw, not payroll advice — S-corp owners: bring this to your CPA as the distribution conversation`,
  };
}
