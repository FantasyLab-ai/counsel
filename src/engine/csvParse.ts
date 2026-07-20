// csvParse.ts — on-device CSV parsing for the drop-in, built for the files
// small businesses ACTUALLY export: Square/Shopify/Stripe/Etsy sales, bank
// and card statements, Excel re-saves. No library. The rules, in the open:
//   * delimiter is sniffed (comma, semicolon, tab) — EU exports use ;
//   * headers are matched by alias ("Gross Sales", "Paid at", "Lineitem name")
//   * money survives $ € £, thousands separators, decimal COMMAS, (parens)
//     negatives, trailing minus, Swiss apostrophes
//   * dates survive ISO, slashes (day-first inferred from the whole column,
//     never guessed row by row), month names, Excel serials
//   * every parse returns an honest `note` saying exactly how the file was
//     read — the same receipt discipline as everything else in Counsel.

import type { Charge, Expense } from "./tierMath";

/* ------------------------------- raw CSV -------------------------------- */

function sniffDelimiter(text: string): string {
  // score candidates on the first line, counting only outside quotes
  const line = text.slice(0, text.indexOf("\n") < 0 ? text.length : text.indexOf("\n"));
  let best = ",", bestN = 0;
  for (const d of [",", ";", "\t"]) {
    let n = 0, inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === d && !inQ) n++;
    }
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}

export function parseCsv(text: string): Record<string, string>[] {
  text = text.replace(/^﻿/, ""); // Excel's BOM
  const delim = sniffDelimiter(text);
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
    else if (ch === delim) { cur.push(field); field = ""; }
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
  // headers normalized hard: "Unit_Price", "unit-price", "Unit Price ($)" all
  // become "unit price" so alias matching sees one spelling
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => { if (h) rec[h] = (r[i] ?? "").trim(); });
    return rec;
  });
}

/* -------------------------------- money --------------------------------- */

// "$1,234.56" "1.234,56 €" "(45.00)" "45.00-" "1'234.50" -> number | null
export function parseMoney(v: string | undefined): number | null {
  if (v == null) return null;
  let s = String(v).trim();
  if (s === "") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }        // (accounting)
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }              // trailing minus
  if (/^-/.test(s)) { neg = true; s = s.slice(1); }
  s = s.replace(/[$€£¥\s  ']/g, "").replace(/[a-z]{3}$/i, ""); // symbols, spaces, "USD"
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // both present: whichever comes LAST is the decimal mark
    s = lastComma > lastDot
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // comma only: ",dd" at the end is a decimal comma; ",ddd" groups are thousands
    const decimal = /,\d{1,2}$/.test(s) && (s.match(/,/g) || []).length === 1;
    s = decimal ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/* -------------------------------- dates --------------------------------- */

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
const pad = (x: string) => x.padStart(2, "0");

// dayFirst applies only to the ambiguous numeric forms (5/6/2026).
export function normDate(v: string, dayFirst = false): string | null {
  const s = v.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/))) {
    let a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;   // 13/05 must be day-first
    if (b > 12 && a <= 12) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;   // 05/13 must be month-first
    return dayFirst ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  }
  if ((m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/))) {
    const a = +m[1], b = +m[2];
    const df = a > 12 ? true : b > 12 ? false : dayFirst;
    return df ? `20${m[3]}-${pad(m[2])}-${pad(m[1])}` : `20${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  }
  if ((m = s.match(/^([a-zA-Z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${pad(m[2])}`;                        // Jul 5, 2026
  }
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-zA-Z]{3,9})\.?,?[\s-]+(\d{4})/))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${pad(m[1])}`;                        // 5 Jul 2026
  }
  if (/^\d{5}$/.test(s)) {
    const serial = +s;                                                  // Excel re-save artifact
    if (serial > 30000 && serial < 60000) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
    }
  }
  return null;
}

// Column-level call, never row-level: if ANY row proves day-first (13/05/…),
// the whole column reads day-first. Mixed proof both ways stays month-first.
function inferDayFirst(values: string[]): boolean {
  let proofDay = 0, proofMonth = 0;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) proofDay++;
    if (+m[2] > 12) proofMonth++;
  }
  return proofDay > 0 && proofMonth === 0;
}

/* ------------------------- header alias matching ------------------------- */

function pickCol(cols: string[], aliases: string[]): string | null {
  for (const a of aliases) if (cols.includes(a)) return a;
  return null;
}

const DATE_ALIASES = [
  "date", "transaction date", "order date", "sale date", "payment date", "posted date",
  "post date", "paid at", "created utc", "created at", "created", "posted", "day",
  "datetime", "date time", "time", "processed at",
];
const CHARGE_AMOUNT_ALIASES = [
  "amount", "total", "total amount", "gross sales", "total collected", "sale amount",
  "subtotal", "gross", "net sales", "net", "paid", "total price", "product sales",
  "amount usd", "charge amount", "item total",
];
const PRODUCT_ALIASES = [
  "product", "item", "item name", "product name", "lineitem name", "line item",
  "description", "title", "sku", "details", "memo", "category",
];
const QTY_ALIASES = ["qty", "quantity", "lineitem quantity", "units", "count", "number of items"];
const UNIT_PRICE_ALIASES = ["unit price", "lineitem price", "price per unit", "item price", "price", "unit cost", "rate"];
const CUSTOMER_ALIASES = ["customer id", "customer", "customer email", "customer name", "email", "buyer", "client"];
const FEE_ALIASES = ["fee", "fees", "processing fee", "transaction fee", "payment processing fees", "stripe fee", "square fees"];
const CHANNEL_ALIASES = ["channel", "sales channel", "source", "platform", "location", "register", "payment method"];

const VENDOR_ALIASES = ["vendor", "merchant", "merchant name", "payee", "name", "description", "details"];
const EXPENSE_AMOUNT_ALIASES = ["amount", "total", "amount usd", "charge", "payment", "cost", "withdrawal"];
const CATEGORY_ALIASES = ["category", "cat", "type", "personal finance category"];

/* ------------------------------- charges --------------------------------- */

export interface ParseResult<T> { rows: T[]; skipped: number; error?: string; note?: string }

export function parseCharges(text: string): ParseResult<Charge> {
  const recs = parseCsv(text);
  if (!recs.length) return { rows: [], skipped: 0, error: "empty file" };
  const cols = Object.keys(recs[0]);

  const cDate = pickCol(cols, DATE_ALIASES);
  if (!cDate) return { rows: [], skipped: 0, error: `no date column found (columns: ${cols.join(", ")})` };
  const cAmt = pickCol(cols, CHARGE_AMOUNT_ALIASES);
  const cQty = pickCol(cols, QTY_ALIASES);
  const cUnit = pickCol(cols, UNIT_PRICE_ALIASES);
  if (!cAmt && !(cUnit && cQty)) {
    return { rows: [], skipped: 0, error: `no amount column found — need one of amount/total/gross sales, or unit price + qty (columns: ${cols.join(", ")})` };
  }
  const cProd = pickCol(cols, PRODUCT_ALIASES);
  const cCust = pickCol(cols, CUSTOMER_ALIASES);
  const cFee = pickCol(cols, FEE_ALIASES);
  const cChan = pickCol(cols, CHANNEL_ALIASES);

  const dayFirst = inferDayFirst(recs.map((r) => r[cDate] ?? ""));
  const rows: Charge[] = [];
  let badDate = 0, badAmount = 0, nonPositive = 0;
  for (const r of recs) {
    const date = normDate(r[cDate] ?? "", dayFirst);
    if (!date) { badDate++; continue; }
    const qty = Math.max(1, Math.round(parseMoney(cQty ? r[cQty] : undefined) ?? 1));
    let amount = cAmt ? parseMoney(r[cAmt]) : null;
    const unit = cUnit ? parseMoney(r[cUnit]) : null;
    if (amount == null && unit != null) amount = unit * qty;
    if (amount == null) { badAmount++; continue; }
    if (amount <= 0) { nonPositive++; continue; } // refunds and voids stay out of revenue
    rows.push({
      date,
      product: ((cProd && r[cProd]) || "sale").slice(0, 60),
      qty,
      price: unit != null && unit > 0 ? unit : Math.round((amount / qty) * 100) / 100,
      customer: (cCust && r[cCust]) || "guest",
      fee: Math.abs(parseMoney(cFee ? r[cFee] : undefined) ?? 0),
      channel: ((cChan && r[cChan]) || "import").slice(0, 30),
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));

  const skipped = badDate + badAmount + nonPositive;
  const bits = [
    `read "${cDate}" as date${dayFirst ? " (day-first)" : ""}, "${cAmt ?? `${cUnit} × ${cQty}`}" as amount`,
  ];
  if (cProd) bits.push(`"${cProd}" as product`);
  if (skipped) {
    const why = [
      badDate ? `${badDate} unreadable dates` : "",
      badAmount ? `${badAmount} unreadable amounts` : "",
      nonPositive ? `${nonPositive} refunds/zero rows` : "",
    ].filter(Boolean).join(", ");
    bits.push(`skipped ${skipped} (${why})`);
  }
  return { rows, skipped, note: bits.join(" · ") };
}

/* ------------------------------- expenses -------------------------------- */

export function parseExpenses(text: string): ParseResult<Expense> {
  const recs = parseCsv(text);
  if (!recs.length) return { rows: [], skipped: 0, error: "empty file" };
  const cols = Object.keys(recs[0]);

  const cDate = pickCol(cols, DATE_ALIASES);
  if (!cDate) return { rows: [], skipped: 0, error: `no date column found (columns: ${cols.join(", ")})` };
  const cDebit = pickCol(cols, ["debit", "debit amount", "money out", "paid out", "outflow"]);
  const cCredit = pickCol(cols, ["credit", "credit amount", "money in", "paid in", "inflow"]);
  const cAmt = pickCol(cols, EXPENSE_AMOUNT_ALIASES);
  if (!cAmt && !cDebit) {
    return { rows: [], skipped: 0, error: `no amount column found — need amount/total or a debit column (columns: ${cols.join(", ")})` };
  }
  const cVend = pickCol(cols, VENDOR_ALIASES);
  const cCat = pickCol(cols, CATEGORY_ALIASES);

  // signed single column with BOTH signs = a full bank statement: the
  // negatives are the spending; positives are deposits, not expenses.
  let signedStatement = false;
  if (!cDebit && cAmt) {
    let pos = 0, neg = 0;
    for (const r of recs) {
      const n = parseMoney(r[cAmt]);
      if (n != null) { if (n > 0) pos++; else if (n < 0) neg++; }
    }
    signedStatement = pos > 0 && neg > 0;
  }

  const dayFirst = inferDayFirst(recs.map((r) => r[cDate] ?? ""));
  const rows: Expense[] = [];
  let badDate = 0, badAmount = 0, inflows = 0;
  for (const r of recs) {
    const d = normDate(r[cDate] ?? "", dayFirst);
    if (!d) { badDate++; continue; }
    let amount: number | null;
    if (cDebit) {
      amount = parseMoney(r[cDebit]);
      if ((amount == null || amount === 0) && cCredit && parseMoney(r[cCredit])) { inflows++; continue; }
      if (amount == null || amount === 0) { badAmount++; continue; }
    } else {
      amount = parseMoney(r[cAmt!]);
      if (amount == null || amount === 0) { badAmount++; continue; }
      if (signedStatement && amount > 0) { inflows++; continue; } // deposits are not expenses
    }
    rows.push({
      d,
      vendor: ((cVend && r[cVend]) || "unknown").slice(0, 60),
      amount: Math.abs(amount),
      cat: ((cCat && r[cCat]) || "other").toLowerCase().slice(0, 40),
    });
  }
  rows.sort((a, b) => (a.d < b.d ? -1 : 1));

  const skipped = badDate + badAmount;
  const bits = [
    `read "${cDate}" as date${dayFirst ? " (day-first)" : ""}, "${cDebit ?? cAmt}" as amount`,
  ];
  if (signedStatement) bits.push(`signed statement: kept the outflows, left ${inflows} deposits out`);
  else if (inflows) bits.push(`left ${inflows} credit rows out`);
  if (skipped) bits.push(`skipped ${skipped} (${badDate ? `${badDate} unreadable dates` : ""}${badDate && badAmount ? ", " : ""}${badAmount ? `${badAmount} unreadable amounts` : ""})`);
  return { rows, skipped, note: bits.join(" · ") };
}

/* ---- posts.csv (social analytics exports / manual logs) ----------------- */

export interface ParsedPosts {
  rows: { date: string; platform: string; label?: string }[];
  skipped: number;
  error?: string;
}
export function parsePosts(text: string): ParsedPosts {
  const recs = parseCsv(text);
  if (!recs.length) return { rows: [], skipped: 0, error: "empty file" };
  const cols = Object.keys(recs[0]);
  const dateKey = pickCol(cols, ["date", "publish time", "published", "created", "post date", "day"]);
  if (!dateKey) return { rows: [], skipped: 0, error: "no date column found (looked for: date, publish time, published, created, post date)" };
  const platKey = pickCol(cols, ["platform", "source", "network", "channel"]);
  const labelKey = pickCol(cols, ["label", "title", "caption", "name", "description", "post"]);
  const dayFirst = inferDayFirst(recs.map((r) => r[dateKey] ?? ""));
  const rows: { date: string; platform: string; label?: string }[] = [];
  let skipped = 0;
  for (const r of recs) {
    const d = normDate(r[dateKey] ?? "", dayFirst);
    if (!d) { skipped++; continue; }
    rows.push({
      date: d,
      platform: ((platKey && r[platKey]) || "").toLowerCase() || "social",
      label: labelKey ? (r[labelKey] || "").slice(0, 80) || undefined : undefined,
    });
  }
  return { rows, skipped };
}
