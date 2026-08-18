// capability.ts — the capability ledger. Counsel discloses confidence on
// every number; this module discloses capability on the whole app: which
// engines are LIVE on this business's data, which are WARMING (source
// present, history still short — with an honest ETA), and which are
// LOCKED behind a source that isn't connected yet — with the exact
// unlock. Computed from what actually landed on the device, not from
// which buttons were pressed.

import { dataMode, userCharges, userExpenses } from "./dataSource";
import { listPosts } from "./socialMath";

export interface EngineCap {
  id: string;
  name: string;
  gives: string; // what the owner gets from it, plain words
  status: "live" | "warming" | "locked";
  note?: string;   // warming ETA or live nuance
  unlock?: string; // locked: the exact action that unlocks it
  unlockKind?: "source" | "expenses" | "posts";
}

export interface CapabilityRead {
  mode: "demo" | "live";
  engines: EngineCap[];
  live: number;
  warming: number;
  locked: number;
  pct: number; // live / total
}

export function capabilityRead(): CapabilityRead {
  const mode = dataMode();
  const charges = userCharges() ?? [];
  const expenses = userExpenses() ?? [];
  const posts = (() => { try { return listPosts(); } catch { return []; } })();

  const days = new Set(charges.map((c) => c.date)).size;
  const hasSales = days > 0;
  const productDetail = charges.some((c) => c.product && c.product.trim() !== "" && c.price > 0);
  // "has customers" means REAL distinct ids — a parser placeholder or a
  // single repeated value can't power survival curves honestly.
  const custSet = new Set(charges.map((c) => c.customer?.trim()).filter(Boolean));
  const customers = custSet.size >= 8;
  const channels = charges.some((c) => c.channel && c.channel.trim() !== "" && c.channel !== "import");
  const hasExpenses = expenses.length > 0;
  const hasPosts = posts.length > 0;

  const CONNECT = "connect a register or drop a sales file";
  const EXP = "connect your bank/QuickBooks or drop an expenses file";

  // Sales-history engines share one gate: enough days to see a rhythm.
  const salesGate = (need: number, name: string, gives: string, id: string): EngineCap =>
    !hasSales
      ? { id, name, gives, status: "locked", unlock: CONNECT, unlockKind: "source" }
      : days >= need
        ? { id, name, gives, status: "live" }
        : { id, name, gives, status: "warming", note: `wakes at ${need} days of sales — you have ${days}` };

  const engines: EngineCap[] = [
    salesGate(14, "Morning brief", "the daily read: what changed, what's normal, what to do", "brief"),
    salesGate(14, "Forecast band", "next 30 days of revenue, honestly banded", "forecast"),
    salesGate(14, "Weekly rhythm", "your strongest and weakest days, measured", "season"),
    salesGate(14, "Staffing to demand", "people-per-day matched to your real week", "staffing"),
    salesGate(14, "Day sentinel", "quiet alarm when a day breaks ITS OWN normal", "sentinel"),
    salesGate(56, "Driver decomposition", "when revenue moves, WHY: traffic, basket, or price", "drivers"),
    { id: "changepoint", name: "Change-point scan", gives: "the day your revenue structurally shifted, with p-value",
      ...(hasSales ? (days >= 21 ? { status: "live" as const } : { status: "warming" as const, note: `wakes at 21 days — you have ${days}` })
        : { status: "locked" as const, unlock: CONNECT, unlockKind: "source" as const }) },
    { id: "elasticity", name: "Price power", gives: "what a price move actually did to demand — measured, not guessed",
      ...(productDetail ? { status: "live" as const, note: "measures when a price change appears in your history — or run a tracked test" }
        : { status: "locked" as const, unlock: "sales data needs product + price columns", unlockKind: "source" as const }) },
    { id: "menu", name: "Product map", gives: "margin × velocity quadrants: what to push, fix, or drop",
      ...(productDetail ? { status: "live" as const }
        : { status: "locked" as const, unlock: "sales data needs product + price columns", unlockKind: "source" as const }) },
    { id: "restock", name: "Restock math", gives: "order quantities that free cash instead of trapping it",
      ...(productDetail ? { status: "live" as const }
        : { status: "locked" as const, unlock: "sales data needs product + qty columns", unlockKind: "source" as const }) },
    { id: "survival", name: "Customers at risk", gives: "regulars past their usual gap — before they quietly leave",
      ...(customers ? { status: "live" as const }
        : { status: "locked" as const, unlock: "sales data needs a customer id column", unlockKind: "source" as const }) },
    { id: "cohorts", name: "Cohorts & channels", gives: "which channel's customers actually come back",
      ...(customers && channels ? { status: "live" as const }
        : { status: "locked" as const, unlock: "needs customer + channel columns in sales", unlockKind: "source" as const }) },
    { id: "audit", name: "The audit", gives: "duplicate charges, subscription creep, fee drift — found",
      ...(hasExpenses ? { status: "live" as const }
        : { status: "locked" as const, unlock: EXP, unlockKind: "expenses" as const }) },
    { id: "runway", name: "True burn & runway", gives: "months of air, from your real spend — not a guess",
      ...(hasExpenses ? { status: "live" as const }
        : { status: "locked" as const, unlock: EXP, unlockKind: "expenses" as const }) },
    { id: "cashview", name: "13-week cash view", gives: "the banded cash path a fractional CFO would draw",
      ...(hasExpenses ? { status: "live" as const }
        : { status: "locked" as const, unlock: EXP, unlockKind: "expenses" as const }) },
    { id: "payself", name: "Pay Yourself", gives: "the largest owner draw your cash floor can support (Pro)",
      ...(hasExpenses && hasSales ? { status: "live" as const }
        : { status: "locked" as const, unlock: EXP, unlockKind: "expenses" as const }) },
    { id: "postlift", name: "Post lift", gives: "did that post actually sell anything? Event-study answer",
      ...(hasPosts && hasSales ? { status: "live" as const }
        : { status: "locked" as const, unlock: "log a post (or import post analytics) on Marketing", unlockKind: "posts" as const }) },
    { id: "calibration", name: "Receipts & calibration", gives: "every number opens; change-point verdicts carry measured error rates",
      status: "live", note: "always on — honesty is not optional equipment" },
  ];

  const live = engines.filter((e) => e.status === "live").length;
  const warming = engines.filter((e) => e.status === "warming").length;
  const locked = engines.filter((e) => e.status === "locked").length;
  return { mode, engines, live, warming, locked, pct: Math.round((live / engines.length) * 100) };
}
