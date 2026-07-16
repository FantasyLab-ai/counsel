// csvParse.ts — on-device CSV parsing for the drop-in. Mirrors the server
// importer's schemas + normalization (dates, $, case-insensitive headers)
// so a file behaves identically whether dropped in the app or fed to the
// CLI. No library: RFC-4180-enough parser for quoted fields.

import type { Charge, Expense } from "./tierMath";

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { cur.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = "";
      if (cur.some((c) => c.trim() !== "")) rows.push(cur);
      cur = [];
    } else field += ch;
  }
  cur.push(field);
  if (cur.some((c) => c.trim() !== "")) rows.push(cur);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/^﻿/, ""));
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => { rec[h] = (r[i] ?? "").trim(); });
    return rec;
  });
}

const DATE_RES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(\d{4})-(\d{2})-(\d{2})/, (m) => `${m[1]}-${m[2]}-${m[3]}`],
  [/^(\d{4})\/(\d{1,2})\/(\d{1,2})/, (m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`],
  [/^(\d{1,2})\/(\d{1,2})\/(\d{4})/, (m) => `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`],
  [/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, (m) => `20${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`],
  [/^(\d{1,2})-(\d{1,2})-(\d{4})/, (m) => `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`],
];
export function normDate(v: string): string | null {
  const s = v.trim();
  for (const [re, fmt] of DATE_RES) {
    const m = s.match(re);
    if (m) return fmt(m);
  }
  return null;
}
const num = (v: string | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = parseFloat(v.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export interface ParseResult<T> { rows: T[]; skipped: number; error?: string }

export function parseCharges(text: string): ParseResult<Charge> {
  const recs = parseCsv(text);
  if (!recs.length) return { rows: [], skipped: 0, error: "empty file" };
  const cols = Object.keys(recs[0]);
  for (const req of ["date", "amount"]) {
    if (!cols.includes(req)) return { rows: [], skipped: 0, error: `missing required column "${req}" (found: ${cols.join(", ")})` };
  }
  const rows: Charge[] = [];
  let skipped = 0;
  for (const r of recs) {
    const date = normDate(r.date ?? "");
    const amount = num(r.amount);
    if (!date || amount == null || amount <= 0) { skipped++; continue; }
    const qty = Math.max(1, Math.round(num(r.qty) ?? 1));
    rows.push({
      date,
      product: (r.product || r.description || r.item || "sale").slice(0, 60),
      qty,
      price: num(r.unit_price) ?? Math.round((amount / qty) * 100) / 100,
      customer: r.customer_id || r.customer || r.email || "guest",
      fee: num(r.fee) ?? 0,
      channel: r.channel || r.source || "import",
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { rows, skipped };
}

export function parseExpenses(text: string): ParseResult<Expense> {
  const recs = parseCsv(text);
  if (!recs.length) return { rows: [], skipped: 0, error: "empty file" };
  const cols = Object.keys(recs[0]);
  for (const req of ["date", "amount"]) {
    if (!cols.includes(req)) return { rows: [], skipped: 0, error: `missing required column "${req}" (found: ${cols.join(", ")})` };
  }
  const rows: Expense[] = [];
  let skipped = 0;
  for (const r of recs) {
    const d = normDate(r.date ?? "");
    const amount = num(r.amount);
    if (!d || amount == null || amount === 0) { skipped++; continue; }
    rows.push({
      d,
      vendor: (r.vendor || r.merchant || r.name || "unknown").slice(0, 60),
      amount: Math.abs(amount),
      cat: (r.category || r.cat || "other").toLowerCase(),
    });
  }
  rows.sort((a, b) => (a.d < b.d ? -1 : 1));
  return { rows, skipped };
}
