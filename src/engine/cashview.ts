// cashview.ts — the 13-week cash view: THE deliverable fractional CFOs are
// paid for. Week by week: banded cash-in (recent-regime revenue range ×
// margin, plus probability-weighted AR receipts) against the scheduled
// bills, cumulated into a runway ribbon with the tight weeks flagged
// months ahead. Small businesses die of cash surprises; this kills the
// surprise. Every weight visible; anchored to the data's last date.

import { dataMode, getDaily, userExpenses } from "./dataSource";
import { BASELINE } from "./insights";
import { arAging, getCashOnHand, liveBills, OUTGOINGS } from "./money";
import { money } from "./tierMath";

export interface CashWeek {
  label: string;      // "Apr 6"
  startIso: string;
  inLo: number; inMid: number; inHi: number;  // cash-in (margin-adjusted + AR)
  out: number;
  cumLo: number; cumMid: number;              // cumulative cash position
  tight: boolean;
  arIn: number;       // the AR portion (already inside in*)
  billLabels: string[];
}

export interface CashViewOut {
  ok: true;
  weeks: CashWeek[];
  startCash: number;
  anchored: boolean;   // false = net-flow mode from $0 (cash on hand unset)
  mode: "demo" | "live";
  tightWeeks: number;
  firstTight: CashWeek | null;
  headline: string;
  cite: string;
}

export interface CashViewThin { ok: false; reason: string }

const pct = (xs: number[], p: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
};

// AR payment probability by lateness bucket — visible, adjustable weights.
const AR_WEIGHT: Record<string, number> = { current: 0.9, "1-30": 0.8, "31-60": 0.6, "61+": 0.4 };

export interface CashViewOpts {
  /** Injected monthly outflows (e.g. the owner's draw on the 1st & 15th,
   * the tax set-aside) — same treatment as any recorded bill. */
  extraMonthly?: { day: number; label: string; amount: number }[];
  /** Simulations Lab: scale weekly cash-in (1 = unchanged). */
  revenueMult?: number;
  /** Simulations Lab: one-time outflows landing in week index 0-12. */
  extraOneTime?: { week: number; label: string; amount: number }[];
}

export async function cashView(opts?: CashViewOpts): Promise<CashViewOut | CashViewThin> {
  const { dates, revenue } = await getDaily();
  if (dates.length < 28) return { ok: false, reason: `needs ~4 weeks of history (has ${dates.length} days)` };

  // ---- recent-regime weekly revenue range (last 8 completed weeks) ----
  const rows = dates.map((d, i) => ({ d, rev: revenue[i] }));
  const anchor = new Date(rows[rows.length - 1].d + "T00:00:00");
  const weekOf = (d: Date) => {
    const x = new Date(d);
    x.setDate(x.getDate() - x.getDay()); // week starts Sunday
    return x.toISOString().slice(0, 10);
  };
  const weekly = new Map<string, number>();
  rows.forEach((r) => {
    const w = weekOf(new Date(r.d + "T00:00:00"));
    weekly.set(w, (weekly.get(w) ?? 0) + r.rev);
  });
  const weeklyTotals = [...weekly.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);
  const recent = weeklyTotals.slice(-9, -1); // last 8 COMPLETE weeks (drop partial tail)
  if (recent.length < 4) return { ok: false, reason: "needs 4+ complete weeks" };
  const wLo = pct(recent, 15), wMid = pct(recent, 50), wHi = pct(recent, 85);

  // Live mode: recorded bills + variable spend out, GROSS revenue in (no
  // margin double-count), demo AR NEVER consulted, anchored at the owner's
  // stated cash on hand (or $0 net-flow with the label saying so).
  const live = dataMode() === "live";
  const lb = live ? liveBills() : null;

  // ---- AR expected receipts (demo invoice book only — live waits for real invoices) ----
  let ar: Awaited<ReturnType<typeof arAging>> | null = null;
  try { ar = await arAging(); } catch { /* no invoices — revenue-only view */ }

  // ---- build 13 weeks ----
  const weeks: CashWeek[] = [];
  const cashAnchor = getCashOnHand();
  const startCash = live ? (cashAnchor ?? 0) : BASELINE.cash;
  const anchored = live ? cashAnchor !== null : true;
  let cumLo = startCash, cumMid = startCash;
  const margin = BASELINE.margin;
  for (let w = 0; w < 13; w++) {
    const start = new Date(anchor);
    start.setDate(start.getDate() - start.getDay() + 7 * (w + 1)); // next full weeks
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const startIso = start.toISOString().slice(0, 10);

    // bills: recorded schedule (live) or the demo schedule, day by day
    let out = 0; const billLabels: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      for (const e of opts?.extraMonthly ?? []) {
        if (e.day === d.getDate()) { out += e.amount; billLabels.push(e.label); }
      }
      if (live && lb) {
        const hits = lb.monthly.filter((o) => o.day === d.getDate());
        const wk2 = lb.weekly.filter((o) => o.weekday === d.getDay());
        out += hits.reduce((s2, o) => s2 + o.amount, 0) + wk2.reduce((s2, o) => s2 + o.amount, 0) + lb.variableDaily;
        billLabels.push(...hits.map((o) => o.label));
      } else {
        const hit = OUTGOINGS.find((o) => o.day === d.getDate());
        if (hit) { out += hit.amount; billLabels.push(hit.label); }
      }
    }

    // AR landing: expected pay date = due + 14d (or now+7 if already past)
    let arIn = 0;
    if (ar) {
      for (const inv of ar.open) {
        const due = new Date(inv.due + "T00:00:00");
        const expected = new Date(Math.max(due.getTime() + 14 * 86400000, anchor.getTime() + 7 * 86400000));
        if (expected >= start && expected <= end) arIn += inv.amount * (AR_WEIGHT[inv.bucket] ?? 0.5);
      }
    }

    const rm = opts?.revenueMult ?? 1;
    for (const o of opts?.extraOneTime ?? []) {
      if (o.week === w) { out += o.amount; billLabels.push(o.label); }
    }
    const inLo = (live ? wLo : wLo * margin) * rm + arIn;
    const inMid = (live ? wMid : wMid * margin) * rm + arIn;
    const inHi = (live ? wHi : wHi * margin) * rm + arIn;
    cumLo += inLo - out;
    cumMid += inMid - out;
    weeks.push({
      label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      startIso,
      inLo: Math.round(inLo), inMid: Math.round(inMid), inHi: Math.round(inHi),
      out: Math.round(out),
      cumLo: Math.round(cumLo), cumMid: Math.round(cumMid),
      tight: cumLo < 2000,
      arIn: Math.round(arIn),
      billLabels,
    });
  }

  const tightOnes = weeks.filter((w) => w.tight);
  const firstTight = tightOnes[0] ?? null;
  const headlineUnanchored = live && !anchored;
  const headline = headlineUnanchored
    ? (firstTight
        ? `Showing <b>net cash flow from $0</b> — the cautious path dips ${money(Math.min(...weeks.map((w) => w.cumLo)))} low. Set your cash on hand above to see the real position.`
        : `Net cash flow runs <b>positive in the cautious case</b> — set your cash on hand above to anchor the actual position.`)
    : firstTight
    ? `In the cautious case, cash runs <b>tight the week of ${firstTight.label}</b> (${money(firstTight.cumLo)} low-band) — you have <b>${weeks.indexOf(firstTight) + 1} week${weeks.indexOf(firstTight) ? "s" : ""}</b> of runway to act, which is the point.`
    : `All 13 weeks clear in the <b>cautious case</b> — lowest point ${money(Math.min(...weeks.map((w) => w.cumLo)))}. Planned, not hoped.`;

  return {
    ok: true,
    weeks,
    startCash,
    anchored,
    mode: live ? "live" : "demo",
    tightWeeks: tightOnes.length,
    firstTight,
    headline,
    cite: live
      ? `weekly revenue range = p15/p50/p85 of your last ${recent.length} complete weeks (gross) · out = your RECORDED bills (recurring on their days + variable daily) · ${anchored ? `anchored at your stated cash on hand ${money(startCash)}` : "net flow from $0 — cash on hand not set"} · receivables join when invoices connect · cautious case = p15 every single week`
      : `weekly revenue range = p15/p50/p85 of your last ${recent.length} complete weeks × ${(margin * 100).toFixed(0)}% margin · AR weighted ${Object.entries(AR_WEIGHT).map(([k, v]) => `${k}:${v * 100}%`).join(" ")} landing due+14d · bills from the recurring schedule · cautious case = p15 every single week`,
  };
}
