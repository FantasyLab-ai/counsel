// posture.ts — how serious is it, actually? Counsel's honesty isn't only
// about numbers; it's about REGISTER. A 5% dip deserves calm; spending at
// 2× revenue deserves urgency — and using the same soft voice for both is
// its own kind of lie. This engine computes one financial posture from the
// ledger with VISIBLE thresholds, and every surface calibrates its language
// to it. Levels:
//   steady    — margins healthy; the calm register is earned
//   attention — a real but small gap; watch it deliberately
//   urgent    — revenue isn't covering spending; pick a lever this week
//   critical  — survival math; act now, observation time is over
//
// Thresholds (cited on every output): uncovered = deficit / expenses.
//   deficit > 0            -> attention
//   uncovered >= 15%       -> urgent
//   uncovered >= 40%       -> critical
// Without expense data, the cash sentry's shortfall vs outgoings stands in.

import { getDaily, userExpenses } from "./dataSource";
import { cashSentry, liveMoneyBasis, money } from "./insights";

export type PostureLevel = "steady" | "attention" | "urgent" | "critical";

export interface Posture {
  level: PostureLevel;
  headline: string;   // <em>/<b> allowed — the voice-register sentence
  sub: string;        // the numbers behind it, plainly
  firstMove: string;  // what to do FIRST — always concrete
  deficit30: number;  // $ short over the last 30 days (0 when steady)
  coveragePct: number | null; // % of spending covered by revenue (null w/o expenses)
  cite: string;
}

const THRESHOLDS = "thresholds: any deficit → attention · ≥15% of spending uncovered → urgent · ≥40% → critical";

export async function financialPosture(): Promise<Posture> {
  const { dates, revenue } = await getDaily();
  const last = dates[dates.length - 1];
  const cut = last
    ? new Date(new Date(last + "T00:00:00").getTime() - 29 * 86400000).toISOString().slice(0, 10)
    : "";
  const rev30 = revenue.filter((_, i) => dates[i] >= cut).reduce((s, v) => s + v, 0);

  const exp = userExpenses();
  if (exp && exp.length) {
    const exp30 = exp.filter((e) => e.d >= cut).reduce((s, e) => s + e.amount, 0);
    const deficit = exp30 - rev30;
    const coverage = exp30 > 0 ? (rev30 / exp30) * 100 : 100;
    const uncovered = exp30 > 0 ? deficit / exp30 : 0;
    const cite = `last 30 recorded days: ${money(rev30)} in vs ${money(exp30)} out · ${THRESHOLDS}`;

    if (deficit <= 0) {
      return {
        level: "steady",
        headline: `Revenue covers spending with <b>${money(-deficit)}</b> to spare.`,
        sub: `${money(rev30)} in vs ${money(exp30)} out over the last 30 days.`,
        firstMove: "protect what's working — the engines will flag drift",
        deficit30: 0,
        coveragePct: Math.round(coverage),
        cite,
      };
    }
    if (uncovered >= 0.4) {
      return {
        level: "critical",
        headline: `Spending is <b>running ${(exp30 / Math.max(1, rev30)).toFixed(1)}× revenue</b> — this needs action now, not observation.`,
        sub: `Revenue covered only ${Math.round(coverage)}% of the last 30 days' spending — ${money(deficit)} left the business. At this pace that repeats every month.`,
        firstMove: "open the P&L, find the biggest expense category, and cut or renegotiate it THIS WEEK — then price and volume levers",
        deficit30: Math.round(deficit),
        coveragePct: Math.round(coverage),
        cite,
      };
    }
    if (uncovered >= 0.15) {
      return {
        level: "urgent",
        headline: `Revenue is covering only <b>${Math.round(coverage)}%</b> of spending — pick a lever this week.`,
        sub: `${money(deficit)} uncovered over the last 30 days. Not an emergency yet; ignoring it makes it one.`,
        firstMove: "one lever this week: the top expense category, the price test, or the win-back — and grade it",
        deficit30: Math.round(deficit),
        coveragePct: Math.round(coverage),
        cite,
      };
    }
    return {
      level: "attention",
      headline: `Spending edged past revenue by <b>${money(deficit)}</b> this month.`,
      sub: `${Math.round(coverage)}% covered — small gap, worth a deliberate look rather than a shrug.`,
      firstMove: "check the P&L's biggest movers vs last month",
      deficit30: Math.round(deficit),
      coveragePct: Math.round(coverage),
      cite,
    };
  }

  // No expense data: the sentry's banded shortfall stands in (labeled).
  try {
    const s = await cashSentry();
    if (s && !s.clears) {
      const basis = liveMoneyBasis();
      const ratio = basis.outgoings > 0 ? -s.marginOfSafety / basis.outgoings : 0;
      const level: PostureLevel = ratio >= 0.4 ? "urgent" : "attention"; // never "critical" on a forecast alone
      return {
        level,
        headline: level === "urgent"
          ? `The cautious case misses your bills by <b>${money(-s.marginOfSafety)}</b> — line up the buffer now.`
          : `The cautious case runs <b>${money(-s.marginOfSafety)}</b> short of bills — worth watching this week.`,
        sub: `Low-band forecast vs monthly outgoings. A projection, not a recorded deficit — which is why the register stays measured.`,
        firstMove: "chase receivables early or park a buffer before the tight stretch",
        deficit30: Math.round(-s.marginOfSafety),
        coveragePct: null,
        cite: `AR(1) low band vs outgoings · forecast shortfall ≥40% of outgoings → urgent · never critical on a forecast alone`,
      };
    }
  } catch { /* thin history */ }

  return {
    level: "steady",
    headline: `Nothing in the money math asks for urgency.`,
    sub: `Bands clear, no recorded deficit.`,
    firstMove: "business as usual — the sentinel is on watch",
    deficit30: 0,
    coveragePct: null,
    cite: THRESHOLDS,
  };
}
