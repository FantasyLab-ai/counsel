// dataBasis.ts — the three labels every claim deserves (sharpened by early
// user feedback): CONFIDENCE lives on each claim already; this engine adds
// the other two — data FRESHNESS (what date the numbers run through, and
// how stale that is) and COMPLETENESS (which slots are actually filled,
// and how well). A transparent method on bad inputs can still mislead;
// these labels make the input quality part of the receipt.

import { dataMode, userCharges, userExpenses, userMeta } from "./dataSource";
import { enriched } from "./tierMath";

export interface DataBasis {
  mode: "demo" | "live";
  throughDate: string | null;  // last transaction date in the ledger
  staleDays: number | null;    // days between throughDate and today (live only)
  loadedAt: string | null;     // when the data arrived ("demo ledger" in demo)
  salesDays: number;           // distinct trading days on file
  hasExpenses: boolean;
  hasInvoices: boolean;
  idCoverage: number | null;   // % of sales rows carrying a customer id
  line: string;                // the compact basis line, ready to render
  flags: string[];             // honest caveats ("expenses missing", "sync is 5 days old")
}

export async function dataBasis(): Promise<DataBasis> {
  const mode = dataMode();
  const led = await enriched();
  const charges = led.charges;

  const dates = [...new Set(charges.map((c) => c.date))].sort();
  const throughDate = dates[dates.length - 1] ?? null;

  let staleDays: number | null = null;
  if (mode === "live" && throughDate) {
    staleDays = Math.max(0, Math.round(
      (Date.now() - new Date(throughDate + "T00:00:00").getTime()) / 86400000,
    ));
  }

  const named = charges.filter((c) => c.customer && c.customer !== "guest").length;
  const idCoverage = charges.length ? Math.round((named / charges.length) * 100) : null;

  const hasExpenses = mode === "live" ? !!(userExpenses()?.length) : true;
  const hasInvoices = mode !== "live"; // real invoices arrive with a later connector

  const meta = userMeta();
  const loadedAt = mode === "live" ? (meta?.importedAt ?? null) : "demo ledger";

  const flags: string[] = [];
  if (mode === "live" && !hasExpenses) flags.push("expenses not connected — margin, runway and the audit are waiting");
  if (mode === "live" && !hasInvoices) flags.push("invoices not connected — receivables invisible to the cash views");
  if (idCoverage !== null && idCoverage < 50) flags.push(`customer ids on only ${idCoverage}% of sales — repeat and at-risk math is limited`);
  if (staleDays !== null && staleDays > 3) flags.push(`data ends ${staleDays} days ago — press Sync for the current picture`);

  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const freshBit = throughDate
    ? `through ${fmt(throughDate)}${staleDays !== null ? (staleDays === 0 ? " (today)" : staleDays === 1 ? " (yesterday)" : ` (${staleDays}d ago)`) : ""}`
    : "no data yet";
  const slotBit = `sales ✓ · expenses ${hasExpenses ? "✓" : "✗"} · invoices ${hasInvoices ? "✓" : "✗"}`;
  const idBit = idCoverage !== null ? ` · ids ${idCoverage}%` : "";

  return {
    mode,
    throughDate,
    staleDays,
    loadedAt,
    salesDays: dates.length,
    hasExpenses,
    hasInvoices,
    idCoverage,
    line: `${freshBit} · ${dates.length} trading days · ${slotBit}${idBit}`,
    flags,
  };
}
