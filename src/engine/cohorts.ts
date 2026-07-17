// cohorts.ts — who your best customers are. Every tool prints a fake
// point-LTV; Counsel prints TO-DATE value by acquisition cohort and by
// first-touch channel, with repeat rates — and refuses to project a
// lifetime it hasn't observed. "To-date, not projected" is the label.

import { enriched, money, type Charge } from "./tierMath";

export interface CohortRow {
  cohort: string;        // "2026-01"
  customers: number;
  repeatRate: number;    // % with 2+ purchase days
  valueToDate: number;   // avg revenue per customer so far
}

export interface ChannelValue {
  channel: string;
  customers: number;
  repeatRate: number;
  valueToDate: number;
}

export interface CohortsOut {
  ok: true;
  rows: CohortRow[];         // most recent 4 cohorts with n>=5
  channels: ChannelValue[];  // channels with n>=10
  bestChannel: ChannelValue | null;
  headline: string;
  cite: string;
}

export interface CohortsThin { ok: false; reason: string }

export async function cohorts(): Promise<CohortsOut | CohortsThin> {
  const led = await enriched();
  const named = led.charges.filter((c) => c.customer && c.customer !== "guest");
  if (named.length / (led.charges.length || 1) < 0.5) {
    return { ok: false, reason: "most sales are guest checkouts — cohort math needs customer ids (they arrive with order/customer data)" };
  }

  interface Cust { first: string; firstChannel: string; days: Set<string>; revenue: number }
  const custs = new Map<string, Cust>();
  const sorted = [...named].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const c of sorted) {
    const cur = custs.get(c.customer);
    if (!cur) {
      custs.set(c.customer, { first: c.date, firstChannel: c.channel || "untracked", days: new Set([c.date]), revenue: c.qty * c.price });
    } else {
      cur.days.add(c.date);
      cur.revenue += c.qty * c.price;
    }
  }
  if (custs.size < 10) return { ok: false, reason: `needs ~10 identified customers (has ${custs.size})` };

  // ---- cohorts by first-purchase month ----
  const byCohort = new Map<string, Cust[]>();
  custs.forEach((c) => {
    const k = c.first.slice(0, 7);
    byCohort.set(k, [...(byCohort.get(k) ?? []), c]);
  });
  const rows: CohortRow[] = [...byCohort.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .filter(([, cs]) => cs.length >= 5)
    .slice(-4)
    .map(([k, cs]) => ({
      cohort: new Date(k + "-01T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      customers: cs.length,
      repeatRate: Math.round((cs.filter((c) => c.days.size >= 2).length / cs.length) * 100),
      valueToDate: Math.round(cs.reduce((s, c) => s + c.revenue, 0) / cs.length),
    }));

  // ---- by first-touch channel ----
  const byChannel = new Map<string, Cust[]>();
  custs.forEach((c) => byChannel.set(c.firstChannel, [...(byChannel.get(c.firstChannel) ?? []), c]));
  const channels: ChannelValue[] = [...byChannel.entries()]
    .filter(([ch, cs]) => cs.length >= 10 && ch !== "untracked" && ch !== "unknown" && ch !== "")
    .map(([ch, cs]) => ({
      channel: ch,
      customers: cs.length,
      repeatRate: Math.round((cs.filter((c) => c.days.size >= 2).length / cs.length) * 100),
      valueToDate: Math.round(cs.reduce((s, c) => s + c.revenue, 0) / cs.length),
    }))
    .sort((a, b) => b.valueToDate - a.valueToDate);

  const best = channels[0] ?? null;
  const worst = channels[channels.length - 1] ?? null;
  const headline =
    best && worst && best.channel !== worst.channel && worst.valueToDate > 0
      ? `<b>${best.channel}</b> customers are worth <b>${(best.valueToDate / worst.valueToDate).toFixed(1)}×</b> ${worst.channel} customers to date (${money(best.valueToDate)} vs ${money(worst.valueToDate)}) — and ${best.repeatRate}% come back.`
      : best
        ? `Your identified customers average <b>${money(best.valueToDate)}</b> to date via ${best.channel}.`
        : `Cohorts are forming — channel comparisons unlock at 10+ customers per channel.`;

  return {
    ok: true,
    rows,
    channels,
    bestChannel: best,
    headline,
    cite: `TO-DATE value, deliberately not "LTV" — I don't project lifetimes I haven't observed · cohort = first-purchase month · channel = first touch · repeat = 2+ distinct purchase days`,
  };
}
