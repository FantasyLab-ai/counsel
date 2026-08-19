// dayChange.ts — rehearse dropping or adding a trading day. Aurora's
// simulation posture in miniature: measure THIS business's weekday from
// its own history, band the answer, refuse when the history is thin.

import { getDaily } from "./dataSource";
import { money } from "./insights";

export interface DayChangeOut {
  ok: boolean;
  verdict: string;
  detail: string;
  cite: string;
  impactMo?: number; // signed $/mo midpoint
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function rehearseDay(weekday: number, mode: "drop" | "add"): Promise<DayChangeOut> {
  const { dates, revenue } = await getDaily();
  if (dates.length < 28) {
    return {
      ok: false,
      verdict: "Not enough history to rehearse this honestly.",
      detail: `Weekday rhythm needs ~4 weeks of sales — you have ${dates.length} days. I won't guess.`,
      cite: "honest refusal · needs 28+ days",
    };
  }
  // last 8 weeks, revenue by weekday
  const cut = Math.max(0, dates.length - 56);
  const byDay: number[][] = [[], [], [], [], [], [], []];
  for (let i = cut; i < dates.length; i++) {
    const wd = new Date(dates[i] + "T12:00:00").getDay();
    byDay[wd].push(revenue[i]);
  }
  const xs = byDay[weekday];
  const name = DAY_NAMES[weekday];
  if (mode === "drop" && xs.length < 3) {
    return {
      ok: false,
      verdict: `You barely trade on ${name}s.`,
      detail: `Only ${xs.length} ${name}${xs.length === 1 ? "" : "s"} with sales in the last 8 weeks — there's almost nothing to drop.`,
      cite: `weekday profile · last 8 weeks`,
    };
  }
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const m = med(xs);
  const mad = med(xs.map((v) => Math.abs(v - m))) || m * 0.2;
  const loMo = Math.round((m - 1.5 * mad) * 4.33);
  const hiMo = Math.round((m + 1.5 * mad) * 4.33);
  const midMo = Math.round(m * 4.33);

  if (mode === "drop") {
    return {
      ok: true,
      verdict: `Closing ${name}s costs roughly ${money(midMo)}/mo in revenue.`,
      detail: `Your typical ${name} does ${money(m)} (median, last 8 weeks). Dropping it forgoes ${money(loMo)}–${money(hiMo)}/mo before any cost savings — weigh that against the labor and hours you'd save. Some of it may migrate to other days; I can't promise how much, so I haven't counted any.`,
      cite: `median ± 1.5·MAD of ${xs.length} ${name}s · last 8 weeks · your ledger`,
      impactMo: -midMo,
    };
  }
  // add: project from your OWN comparable days, honestly labeled
  const openDays = byDay.map((d, i) => ({ i, n: d.length, m: med(d) })).filter((d) => d.n >= 3);
  const comparable = openDays.length ? Math.round(med(openDays.map((d) => d.m))) : 0;
  if (!comparable) {
    return { ok: false, verdict: "No comparable days to project from.", detail: "I need at least one weekday with 3+ weeks of sales to anchor an estimate.", cite: "honest refusal" };
  }
  const loA = Math.round(comparable * 0.5 * 4.33);
  const hiA = Math.round(comparable * 1.0 * 4.33);
  return {
    ok: true,
    verdict: `Opening ${name}s could add ~${money(loA)}–${money(hiA)}/mo.`,
    detail: `Anchored on your own typical open day (${money(comparable)}), haircut to 50–100% because a new day usually starts below an established one. This is an anchored range, not a promise — run it four weeks and I'll grade it against reality.`,
    cite: `anchored on your median open day · 50–100% haircut · last 8 weeks`,
    impactMo: Math.round(comparable * 0.75 * 4.33),
  };
}
