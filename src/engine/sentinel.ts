// sentinel.ts — the daily anomaly sentinel. Quiet by design: it speaks only
// when a completed day breaks its weekday norm, or a soft streak forms.
// Method: per-weekday median ± MAD bands over up to 12 weeks of history
// (robust to outliers, honest on thin data), holiday-aware so July 4th
// doesn't page anyone. Today (incomplete) is reported as "so far" and never
// judged — partial days can't fail a full-day norm.

import { getDaily } from "./dataSource";
import { money } from "./tierMath";

export interface SentinelOut {
  status: "quiet" | "watch" | "fired";
  headline: string;          // plain English, <b> allowed
  detail: string;            // the receipt
  todaySoFar: string | null; // "today so far: $312 (partial — not judged)"
}

// US federal holidays (fixed + common observed) — enough to stop the
// classic false alarms. Movable feasts computed cheaply for +/- 2 years.
function isHolidayish(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const fixed = [`1-1`, `7-4`, `12-24`, `12-25`, `12-31`, `11-11`, `6-19`];
  if (fixed.includes(`${m}-${d}`)) return true;
  const dt = new Date(iso + "T00:00:00");
  const dow = dt.getDay(), week = Math.ceil(d / 7);
  if (m === 11 && dow === 4 && week === 4) return true;             // Thanksgiving
  if (m === 11 && dow === 5 && d >= 23 && d <= 29) return true;     // Black Friday
  if (m === 9 && dow === 1 && week === 1) return true;              // Labor Day
  if (m === 5 && dow === 1 && d >= 25) return true;                 // Memorial Day
  if (m === 1 && dow === 1 && week === 3) return true;              // MLK
  if (m === 2 && dow === 1 && week === 3) return true;              // Presidents
  return false;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export async function sentinel(): Promise<SentinelOut> {
  const { dates, revenue } = await getDaily();
  if (dates.length < 21) {
    return {
      status: "quiet",
      headline: `Sentinel warming up — <b>${dates.length} of 21 days</b> before day-level norms are honest.`,
      detail: "weekday median ± MAD bands need ~3 samples per weekday",
      todaySoFar: null,
    };
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const rows = dates.map((d, i) => ({ d, rev: revenue[i] }));
  // Judge only COMPLETED days: drop today if present (partial by definition).
  const todayRow = rows.find((r) => r.d === todayIso) ?? null;
  const done = rows.filter((r) => r.d !== todayIso).slice(-84); // ≤12 weeks

  const lastDone = done[done.length - 1];
  const wd = new Date(lastDone.d + "T00:00:00").getDay();
  const peers = done
    .slice(0, -1)
    .filter((r) => new Date(r.d + "T00:00:00").getDay() === wd && !isHolidayish(r.d));
  const holidayNote = isHolidayish(lastDone.d);

  const dayName = new Date(lastDone.d + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
  const todaySoFar = todayRow
    ? `today so far: ${money(todayRow.rev)} (partial day — not judged)`
    : null;

  if (peers.length < 3) {
    return {
      status: "quiet",
      headline: `Sentinel warming up — needs 3 prior ${dayName}s to judge one (has ${peers.length}).`,
      detail: "weekday norms build one week at a time",
      todaySoFar,
    };
  }

  const med = median(peers.map((p) => p.rev));
  const mad = median(peers.map((p) => Math.abs(p.rev - med))) || med * 0.15 || 1;
  const lo = med - 2.5 * mad, hi = med + 2.5 * mad;
  const receipt = `${dayName} norm ${money(med)} ± ${money(2.5 * mad)} (median ± 2.5·MAD, ${peers.length} ${dayName}s, holidays excluded)`;

  // Soft streak: 3+ consecutive completed days below their weekday medians.
  let streak = 0;
  for (let i = done.length - 1; i >= 0 && i >= done.length - 6; i--) {
    const r = done[i];
    if (isHolidayish(r.d)) break;
    const w = new Date(r.d + "T00:00:00").getDay();
    const pm = median(
      done.slice(0, i).filter((x) => new Date(x.d + "T00:00:00").getDay() === w && !isHolidayish(x.d)).map((x) => x.rev),
    );
    if (pm > 0 && r.rev < pm) streak++;
    else break;
  }

  if (!holidayNote && lastDone.rev < lo) {
    return {
      status: "fired",
      headline: `<b>${dayName} broke its floor:</b> ${money(lastDone.rev)} against a ${money(lo)}–${money(hi)} band — worth a look at what was different.`,
      detail: receipt,
      todaySoFar,
    };
  }
  if (!holidayNote && lastDone.rev > hi) {
    return {
      status: "fired",
      headline: `<b>${dayName} broke its ceiling:</b> ${money(lastDone.rev)} against a ${money(lo)}–${money(hi)} band — find what worked and bottle it.`,
      detail: receipt,
      todaySoFar,
    };
  }
  if (streak >= 3) {
    return {
      status: "watch",
      headline: `<b>${streak}${streak >= 6 ? "+" : ""} days running under their weekday norms</b> — no single day broke a band, but the streak is soft. Watching.`,
      detail: `streak test over weekday medians · ${receipt}`,
      todaySoFar,
    };
  }
  return {
    status: "quiet",
    headline: holidayNote
      ? `${dayName} was a holiday — <b>not judged</b> against normal norms. Quiet otherwise.`
      : `Every recent day inside its weekday band. <b>Quiet is a finding</b> — checked, not assumed.`,
    detail: receipt,
    todaySoFar,
  };
}
