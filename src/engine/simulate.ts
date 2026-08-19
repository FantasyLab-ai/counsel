// simulate.ts — the Simulations Lab engine. Compose SEVERAL business
// decisions into one scenario and run them against the banded 13-week
// cash path together. Aurora's posture throughout: measured effects when
// a measurement exists (elasticity, weekday rhythm), declared assumptions
// when it doesn't — every move carries a note saying which it was.

import { cashView, type CashViewOut } from "./cashview";
import { enriched, priceElasticity } from "./tierMath";
import { rehearseDay } from "./dayChange";
import { getDaily } from "./dataSource";
import { money } from "./insights";

export type SimMove =
  | { kind: "hire"; label: string; amountMo: number }
  | { kind: "draw"; label: string; amountMo: number }
  | { kind: "purchase"; label: string; amount: number; week: number }
  | { kind: "price"; label: string; pct: number }
  | { kind: "day"; label: string; weekday: number; mode: "drop" | "add" }
  | { kind: "push"; label: string; pct: number };

export interface SimResult {
  ok: boolean;
  reason?: string;
  base?: CashViewOut;
  scen?: CashViewOut;
  endDelta?: number;   // scenario end cash vs baseline end cash (mid path)
  tightDelta?: number; // change in tight weeks
  notes: string[];     // one honest line per move: measured vs assumed
  verdict?: string;
}

async function weeklyRevMid(): Promise<number> {
  const { dates, revenue } = await getDaily();
  const weekly = new Map<string, number>();
  dates.forEach((d, i) => {
    const x = new Date(d + "T00:00:00");
    x.setDate(x.getDate() - x.getDay());
    const w = x.toISOString().slice(0, 10);
    weekly.set(w, (weekly.get(w) ?? 0) + revenue[i]);
  });
  const totals = [...weekly.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v).slice(-9, -1);
  const s = [...totals].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export async function simulate(moves: SimMove[]): Promise<SimResult> {
  const base = await cashView();
  if (!base.ok) return { ok: false, reason: base.reason, notes: [] };

  let revenueMult = 1;
  const extraMonthly: { day: number; label: string; amount: number }[] = [];
  const extraOneTime: { week: number; label: string; amount: number }[] = [];
  const notes: string[] = [];
  const wRev = await weeklyRevMid();

  for (const m of moves) {
    if (m.kind === "hire") {
      extraMonthly.push({ day: 1, label: m.label, amount: m.amountMo });
      notes.push(`${m.label}: −${money(m.amountMo)}/mo from day one — treated as a real bill, no ramp-up optimism.`);
    } else if (m.kind === "draw") {
      extraMonthly.push({ day: 1, label: m.label, amount: m.amountMo / 2 }, { day: 15, label: m.label, amount: m.amountMo / 2 });
      notes.push(`${m.label}: ${money(m.amountMo)}/mo, paid 1st & 15th like a real salary.`);
    } else if (m.kind === "purchase") {
      extraOneTime.push({ week: m.week, label: m.label, amount: m.amount });
      notes.push(`${m.label}: ${money(m.amount)} lands in week ${m.week + 1} — the path absorbs it in one hit.`);
    } else if (m.kind === "price") {
      const p = m.pct / 100;
      const e = await priceElasticity();
      if (e) {
        const led = await enriched();
        const pid = led.priceChange.product;
        const tot = led.charges.reduce((s, c) => s + c.qty * c.price, 0);
        const pr = led.charges.filter((c) => c.product === pid).reduce((s, c) => s + c.qty * c.price, 0);
        const share = tot ? pr / tot : 0.3;
        const eff = (1 + p) * (1 + e.elasticity * p) - 1;
        revenueMult *= 1 + eff * share;
        notes.push(`${m.label}: MEASURED — your elasticity ${e.elasticity.toFixed(2)} on ${e.productName} (~${Math.round(share * 100)}% of revenue) → ${(eff * share * 100).toFixed(1)}% total revenue effect.`);
      } else {
        const eff = p * 0.7;
        revenueMult *= 1 + eff;
        notes.push(`${m.label}: ASSUMED — no measured price change in your history yet, so I used a conservative 30% demand give-back. Run a tracked price test and this becomes a measurement.`);
      }
    } else if (m.kind === "day") {
      const d = await rehearseDay(m.weekday, m.mode);
      if (d.ok && d.impactMo && wRev > 0) {
        revenueMult *= 1 + (d.impactMo / 4.33) / wRev;
        notes.push(`${m.label}: MEASURED — ${d.verdict.toLowerCase()}`);
      } else {
        notes.push(`${m.label}: ${d.verdict} ${d.ok ? "" : "(left out of the math)"}`);
      }
    } else if (m.kind === "push") {
      revenueMult *= 1 + m.pct / 100;
      notes.push(`${m.label}: +${m.pct}% revenue is YOUR assumption, not my measurement — if you run it, track it and I'll grade it against reality.`);
    }
  }

  const scen = await cashView({ extraMonthly, extraOneTime, revenueMult });
  if (!scen.ok) return { ok: false, reason: scen.reason, notes };

  const endDelta = scen.weeks[12].cumMid - base.weeks[12].cumMid;
  const tightDelta = scen.tightWeeks - base.tightWeeks;
  const dir = endDelta >= 0 ? "up" : "down";
  const verdict = scen.tightWeeks === 0
    ? `This plan holds. Cash stays above water for all 13 weeks and ends ${dir} ${money(Math.abs(endDelta))} vs today's path.`
    : `Careful: ${scen.tightWeeks} tight week${scen.tightWeeks > 1 ? "s" : ""} on this plan (first: week of ${scen.firstTight?.label}). It ends ${money(Math.abs(endDelta))} ${endDelta >= 0 ? "above" : "below"} today's path.`;

  return { ok: true, base, scen, endDelta, tightDelta, notes, verdict };
}
