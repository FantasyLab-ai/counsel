// periodMetrics.ts — the Numbers screen's period filters, made REAL. Any
// window (this month, last month, trailing quarter, or a custom range) is
// computed from the ledger against the equal-length window before it —
// works identically on the demo ledger and live data, because it reads
// through the same gate as every engine. Anchored to the data's last date,
// never the wall clock.

import type { Metric } from "../api/counsel";
import { enriched, money } from "./tierMath";

export type PeriodId = "month" | "lastMonth" | "quarter" | "custom";

export interface PeriodWindow {
  label: string;   // "March 2026" / "trailing 13 weeks" / "Feb 3 – Mar 1"
  start: string;   // inclusive ISO
  end: string;     // inclusive ISO
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
};

export async function anchorDate(): Promise<string> {
  const led = await enriched();
  const ds = led.charges.map((c) => c.date).sort();
  return ds[ds.length - 1] ?? iso(new Date());
}

export async function resolveWindow(period: PeriodId, custom?: { from: string; to: string }): Promise<PeriodWindow> {
  const anchor = await anchorDate();
  const a = new Date(anchor + "T00:00:00");
  if (period === "month") {
    const start = new Date(a.getFullYear(), a.getMonth(), 1);
    return { label: a.toLocaleDateString("en-US", { month: "long", year: "numeric" }), start: iso(start), end: anchor };
  }
  if (period === "lastMonth") {
    const start = new Date(a.getFullYear(), a.getMonth() - 1, 1);
    const end = new Date(a.getFullYear(), a.getMonth(), 0);
    return { label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }), start: iso(start), end: iso(end) };
  }
  if (period === "quarter") {
    return { label: "trailing 13 weeks", start: addDays(anchor, -90), end: anchor };
  }
  const from = custom?.from ?? addDays(anchor, -29);
  const to = custom?.to && custom.to <= anchor ? custom.to : anchor;
  const fmt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label: `${fmt(from)} – ${fmt(to)}`, start: from, end: to };
}

export async function periodMetrics(period: PeriodId, custom?: { from: string; to: string }): Promise<{ window: PeriodWindow; metrics: Metric[] }> {
  const win = await resolveWindow(period, custom);
  const led = await enriched();

  const days = Math.max(1, Math.round((new Date(win.end + "T00:00:00").getTime() - new Date(win.start + "T00:00:00").getTime()) / 86400000) + 1);
  const priorStart = addDays(win.start, -days), priorEnd = addDays(win.start, -1);

  const inWin = led.charges.filter((c) => c.date >= win.start && c.date <= win.end);
  const inPrior = led.charges.filter((c) => c.date >= priorStart && c.date <= priorEnd);

  const rev = (xs: typeof inWin) => xs.reduce((s, c) => s + c.qty * c.price, 0);
  const r1 = rev(inWin), r0 = rev(inPrior);
  const delta = r0 > 0 ? ((r1 - r0) / r0) * 100 : null;
  const dir = (v: number): "up" | "down" | "flat" => (v > 2 ? "up" : v < -2 ? "down" : "flat");

  const cust = new Set(inWin.filter((c) => c.customer && c.customer !== "guest").map((c) => c.customer));
  const custPrior = new Set(inPrior.filter((c) => c.customer && c.customer !== "guest").map((c) => c.customer));
  const avgSale = inWin.length ? r1 / inWin.length : 0;
  const avgPrior = inPrior.length ? r0 / inPrior.length : 0;

  // best weekday by median within the window
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const byDay = new Map<string, number>();
  inWin.forEach((c) => byDay.set(c.date, (byDay.get(c.date) ?? 0) + c.qty * c.price));
  const wd: number[][] = [[], [], [], [], [], [], []];
  byDay.forEach((v, d) => wd[new Date(d + "T00:00:00").getDay()].push(v));
  let bestDay = "—", bestMed = -1;
  wd.forEach((arr, i) => {
    if (arr.length >= 2) {
      const s = [...arr].sort((x, y) => x - y);
      const m = s[Math.floor(s.length / 2)];
      if (m > bestMed) { bestMed = m; bestDay = names[i]; }
    }
  });

  const priorLabel = `prior ${days}d`;
  const metrics: Metric[] = [
    {
      id: "p-revenue",
      label: `Revenue · ${win.label}`,
      value: money(Math.round(r1)),
      ...(delta !== null ? { delta: { text: `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% vs ${priorLabel}`, dir: dir(delta) } } : {}),
      meaning: inWin.length
        ? `<b>${inWin.length} transactions</b> across ${byDay.size} trading day${byDay.size === 1 ? "" : "s"} — summed, not modeled.` +
          (delta !== null ? ` The window before ran ${money(Math.round(r0))}.` : "")
        : `No transactions in this window.`,
      confidence: "high",
      confidenceLabel: "Exact",
      wide: true,
      math: {
        methodPlain: `Every transaction between ${win.start} and ${win.end}, summed (qty × price), compared against the equal-length window immediately before.`,
        keyStatPlain: `${money(Math.round(r1))} vs ${money(Math.round(r0))} in the ${priorLabel}.`,
        keyStatNotation: `Σ(qty×price) · ${days}-day window vs prior ${days}d`,
        viz: {
          kind: "arithmetic",
          lines: [
            { text: `${win.label}: ${inWin.length} transactions` },
            { text: `sum = ${money(Math.round(r1))}`, kind: "result" },
            { text: `${priorLabel}: ${money(Math.round(r0))}${delta !== null ? ` (${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%)` : ""}` },
          ],
        },
        citation: { method: "transparent arithmetic", source: "the ledger, exact window" },
      },
    },
    {
      id: "p-avgsale",
      label: "Average sale",
      value: money(Math.round(avgSale * 100) / 100),
      ...(avgPrior > 0 ? { delta: { text: `${avgSale >= avgPrior ? "+" : ""}${(((avgSale - avgPrior) / avgPrior) * 100).toFixed(0)}% vs ${priorLabel}`, dir: dir(((avgSale - avgPrior) / avgPrior) * 100) } } : {}),
      meaning: avgPrior > 0 && Math.abs(avgSale - avgPrior) / avgPrior > 0.05
        ? `Baskets are ${avgSale > avgPrior ? "growing" : "shrinking"} — worth a look at the drivers card for whether it's mix or price.`
        : `Basket size held steady across the two windows.`,
      confidence: "high",
      confidenceLabel: "Exact",
    },
    {
      id: "p-customers",
      label: "Customers",
      value: cust.size ? String(cust.size) : "—",
      meaning: cust.size
        ? `${cust.size} identified customers in the window${custPrior.size ? ` (${custPrior.size} in the ${priorLabel})` : ""}; repeat behavior feeds the at-risk engine.`
        : `This window's sales carry no customer ids — counts unlock with order/customer data.`,
      confidence: cust.size ? "moderate" : "insufficient",
      confidenceLabel: cust.size ? "Counted" : "No ids",
    },
    {
      id: "p-bestday",
      label: "Best day",
      value: bestDay,
      meaning: bestDay !== "—"
        ? `${bestDay}s carried the window (median ${money(Math.round(bestMed))}/day). Staff and stock to that shape.`
        : `Not enough repeated weekdays inside this window to call a best day honestly.`,
      confidence: bestDay !== "—" ? "moderate" : "insufficient",
      confidenceLabel: bestDay !== "—" ? "Weekday medians" : "Window too short",
    },
  ];

  return { window: win, metrics };
}
