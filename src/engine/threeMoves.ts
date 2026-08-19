// threeMoves.ts — the weekly operating cadence, composed. Every engine
// already PROPOSES; this module gathers every live proposal, adds the
// cross-cutting ones the screens keep to themselves (audit findings, a
// coming tight week), ranks by dollars-at-stake, and hands Today the
// three moves most worth a minute. Each carries its why and its receipt.

import { recommendations, type Recommendation } from "./recommend";
import { feeAudit } from "./tierMath";
import { cashView } from "./cashview";
import { money } from "./insights";

export type Move = Recommendation;

export async function threeMoves(): Promise<Move[]> {
  const out: Move[] = [];

  try {
    out.push(...await recommendations());
  } catch { /* engines that can't speak stay silent */ }

  // The audit's best finding, as a move (screens show it; Today should act on it).
  try {
    const findings = await feeAudit();
    const top = [...findings].sort((a, b) => b.annual - a.annual)[0];
    if (top && !out.some((m) => m.id === "mv-audit")) {
      out.push({
        id: "mv-audit",
        source: "B5 · the audit",
        action: top.kind === "duplicate" ? `Recover the duplicate: ${top.title}` : `Renegotiate or cancel: ${top.title}`,
        expected: `${top.detail} Worth ~${money(top.annual)}/yr.`,
        impact: Math.round(top.annual / 12),
        gradeInDays: 30,
        cite: "expense audit · duplicates, creep, fee drift",
      });
    }
  } catch { /* no expenses yet */ }

  // A tight week ahead is always move #1 material.
  try {
    const cv = await cashView();
    if (cv.ok && cv.firstTight) {
      out.push({
        id: "mv-tightweek",
        source: "13-week cash",
        action: `Shift cash before the week of ${cv.firstTight.label}`,
        expected: `${cv.tightWeeks} tight week${cv.tightWeeks > 1 ? "s" : ""} on the banded path — move a bill, chase an invoice, or delay a purchase before it lands.`,
        impact: Math.max(0, Math.round(-cv.firstTight.cumLo)),
        gradeInDays: 21,
        cite: cv.cite,
      });
    }
  } catch { /* not enough history */ }

  return out
    .sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))
    .slice(0, 3);
}
