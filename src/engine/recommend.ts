// recommend.ts — Counsel PROPOSES. The same engines that power the Insights
// cards surface here as decision contracts: a recommended action, the
// expected outcome, the $ at stake, and a judgment window. Track one and it
// enters the board as a contract with Counsel as the source; the grader
// closes the loop. Dismissals stick (per recommendation id).
//
// Honesty rules apply: every proposal is computed, engines that lack fuel
// propose nothing, and an empty list says "not enough history" — never filler.

import {
  customerSurvival, feeAudit, money, newsvendor, priceElasticity,
} from "./tierMath";
import { cashSentry } from "./insights";
import { menuMap } from "./menu";
import { cashView } from "./cashview";
import { arAging } from "./money";
import { dataMode, userExpenses } from "./dataSource";
import { listDecisions } from "./decisions";

export interface Recommendation {
  id: string;        // stable — used for dismissals + already-tracked matching
  source: string;    // "A1 · price power"
  action: string;
  expected: string;
  impact?: number;   // $/mo at stake
  gradeInDays: number;
  cite: string;      // the method receipt
}

const DISMISS_KEY = "counsel.recs.dismissed";

function dismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function dismissRecommendation(id: string): void {
  try {
    const d = dismissed();
    d.add(id);
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...d]));
  } catch { /* dismissal just won't stick */ }
}

export async function recommendations(): Promise<Recommendation[]> {
  const live = dataMode() === "live";
  const hasExp = !!userExpenses();
  const out: Recommendation[] = [];

  // A1 — price power (needs a detected price change + clean windows)
  try {
    const e = await priceElasticity();
    if (e && e.inelastic && e.monthlyGain > 0) {
      out.push({
        id: "rec-a1-price",
        source: "A1 · price power",
        action: "Run the +5% price test",
        expected: `margin gain ≈ ${money(e.monthlyGain)}/mo; volume drop stays inside the CI`,
        impact: e.monthlyGain,
        gradeInDays: 30,
        cite: `measured elasticity ${e.elasticity.toFixed(2)} from your own price change · 90% CI [${e.ciLo.toFixed(2)}, ${e.ciHi.toFixed(2)}]`,
      });
    }
  } catch { /* not enough history — propose nothing */ }

  // A2 — customers at risk
  try {
    const s = await customerSurvival();
    if (s && s.atRisk >= 3 && s.recoverable > 50) {
      out.push({
        id: "rec-a2-winback",
        source: "A2 · customers at risk",
        action: `Win-back nudge to ${s.atRisk} at-risk regulars`,
        expected: `recover a meaningful share of ${money(s.recoverable)}`,
        impact: s.recoverable,
        gradeInDays: 21,
        cite: `Kaplan–Meier on ${s.repeaters} repeat customers · median return ${s.medianReturnDays}d`,
      });
    }
  } catch { /* needs repeat customers */ }

  // A3 — restock math
  try {
    const n = await newsvendor();
    if (n.length && n[0].tiedUpSaved > 25) {
      out.push({
        id: `rec-a3-${n[0].product}`,
        source: "A3 · restock math",
        action: `Restock ${n[0].product} to ${n[0].stock30} units`,
        expected: `~${(n[0].fractile * 100).toFixed(0)}% demand coverage · ${money(n[0].tiedUpSaved)} freed vs max-stocking`,
        impact: n[0].tiedUpSaved,
        gradeInDays: 30,
        cite: "critical-fractile inventory math on the product's real demand distribution",
      });
    }
  } catch { /* needs product variety */ }

  // B5 — the audit (real expenses only; never propose from demo spending)
  if (!live || hasExp) {
    try {
      const a = await feeAudit();
      if (a.length) {
        const annual = a.reduce((s, f) => s + f.annual, 0);
        out.push({
          id: "rec-b5-audit",
          source: "B5 · the audit",
          action: `Fix ${a.length} audit finding${a.length === 1 ? "" : "s"}`,
          expected: `recover ~${money(annual)}/yr (refund duplicates, cancel creep, call the processor)`,
          impact: annual / 12,
          gradeInDays: 14,
          cite: "duplicate scan + monotone-creep + fee-drift, every claim traceable to charges",
        });
      }
    } catch { /* no expenses yet */ }
  }

  // Cash sentry — only when the low band runs short
  try {
    const c = await cashSentry();
    if (c && !c.clears) {
      out.push({
        id: "rec-cash-buffer",
        source: "Cash sentry",
        action: "Move a cash buffer ahead of the tight week",
        expected: `cover the ${money(-c.marginOfSafety)} low-band shortfall vs monthly outgoings`,
        impact: -c.marginOfSafety,
        gradeInDays: 30,
        cite: "AR(1) banded forecast · low band vs fixed outgoings",
      });
    }
  } catch { /* sentry needs more days */ }

  // Menu engineering — proposals from the product map
  try {
    const m = await menuMap();
    if (m.ok) {
      for (const p of m.proposals.slice(0, 2)) {
        out.push({
          id: `rec-menu-${p.action.slice(0, 30)}`,
          source: p.source,
          action: p.action,
          expected: p.expected,
          ...(p.impact != null ? { impact: p.impact } : {}),
          gradeInDays: 21,
          cite: p.cite,
        });
      }
    }
  } catch { /* needs product variety */ }

  // 13-week tight spot — propose action while there's runway to act
  if (!live || hasExp) {
    try {
      const cv = await cashView();
      if (cv.ok && cv.firstTight) {
        out.push({
          id: `rec-cw-${cv.firstTight.startIso}`,
          source: "13-week cash view",
          action: `Cover the week of ${cv.firstTight.label} (cautious case dips to ${money(cv.firstTight.cumLo)})`,
          expected: "chase AR early, shift a bill, or set aside a buffer — chosen and done BEFORE the tight week",
          gradeInDays: Math.min(60, 7 * (cv.weeks.indexOf(cv.firstTight) + 1)),
          cite: "cautious path = p15 revenue every week × margin + weighted AR − bill schedule",
        });
      }
    } catch { /* thin history */ }
  }

  // The posture — when spending outruns revenue, stopping the bleed IS the
  // top proposal, ahead of every optimization.
  try {
    const { financialPosture } = await import("./posture");
    const po = await financialPosture();
    if (po.level === "critical" || po.level === "urgent") {
      out.unshift({
        id: `rec-posture-${po.level}`,
        source: po.level === "critical" ? "The posture · act now" : "The posture · this week",
        action: po.level === "critical"
          ? "Stop the bleed: cut or renegotiate the top expense category"
          : "Close the coverage gap: one lever this week",
        expected: `${money(po.deficit30)}/mo stops leaving the business — first move: ${po.firstMove}`,
        impact: po.deficit30,
        gradeInDays: po.level === "critical" ? 7 : 14,
        cite: po.cite,
      });
    }
  } catch { /* posture needs data */ }

  // Goal contract — course-correct only when genuinely behind the band
  try {
    const { goalPace } = await import("./goals");
    const g = await goalPace();
    if (g.ok && g.status === "behind") {
      out.push({
        id: `rec-goal-${g.monthLabel}`,
        source: "Goal contract",
        action: `Close the ${money(g.expectedMTD - g.actualMTD)} pace gap on ${g.monthLabel}`,
        expected: `pick ONE lever this week — the price test, the win-back, or a spotlight post — and grade it against pace`,
        impact: g.target - g.projected > 0 ? Math.round(g.target - g.projected) : undefined,
        gradeInDays: 14,
        cite: "behind beyond your own weekly-variability band — signal, not noise",
      });
    }
  } catch { /* no goal set */ }

  // Best-channel double-down — only when cohorts have real spread
  try {
    const { cohorts } = await import("./cohorts");
    const c = await cohorts();
    if (c.ok && c.bestChannel && c.channels.length >= 2) {
      const worst = c.channels[c.channels.length - 1];
      if (c.bestChannel.valueToDate > worst.valueToDate * 1.5) {
        out.push({
          id: `rec-channel-${c.bestChannel.channel}`,
          source: "Cohorts · channel value",
          action: `Shift next week's marketing push to ${c.bestChannel.channel}`,
          expected: `its customers are worth ${(c.bestChannel.valueToDate / Math.max(1, worst.valueToDate)).toFixed(1)}× ${worst.channel}'s to date (${c.bestChannel.repeatRate}% repeat)`,
          gradeInDays: 21,
          cite: "to-date value by first-touch channel — measured, not projected",
        });
      }
    }
  } catch { /* ids too thin */ }

  // AR chase — demo/showroom only until real invoices exist
  if (!live) {
    try {
      const ar = await arAging();
      if (ar.chase[0]) {
        out.push({
          id: `rec-ar-${ar.chase[0].id}`,
          source: "Money · AR aging",
          action: `Chase ${ar.chase[0].client} (${money(ar.chase[0].amount)}, ${ar.chase[0].daysLate}d late)`,
          expected: "payment or a plan within 14 days; escalate if silent",
          impact: ar.chase[0].amount,
          gradeInDays: 14,
          cite: "chase order = days late × amount",
        });
      }
    } catch { /* fixture unavailable */ }
  }

  // Filter: dismissed, or already on the board (matched by action prefix)
  const d = dismissed();
  const tracked = listDecisions().filter((x) => x.note !== "__deleted__" && x.action);
  return out.filter((r) =>
    !d.has(r.id) &&
    !tracked.some((t) => t.action.startsWith(r.action.slice(0, 24))),
  );
}
