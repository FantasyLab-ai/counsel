// fileIntake.ts — the universal drop. One handler for whatever an owner
// actually has: CSVs (auto-detected as sales vs expenses), PDF statements
// (text layer → dated transaction lines), and receipt photos (OCR).
// Everything parses ON THIS DEVICE. The single network exception: the OCR
// reader downloads once, on first photo — the photo itself never leaves.

import type { Charge, Expense } from "./tierMath";
import { normDate, parseCharges, parseExpenses, parseMoney } from "./csvParse";

export interface IntakeResult {
  charges: Charge[];
  expenses: Expense[];
  notes: string[]; // one honest line per file — what was read, or why not
  okFiles: number;
  failFiles: number;
}

const MAX_FILES = 12;

/* ------------------------------ CSV autodetect ---------------------------- */
// Run both parsers; more usable rows wins. Ties break on header smell —
// vendor/debit words read as money-out, product/qty words as sales.
function detectCsv(text: string): { kind: "charges"; rows: Charge[]; note?: string } | { kind: "expenses"; rows: Expense[]; note?: string } | { kind: "none"; error: string } {
  const c = parseCharges(text);
  const e = parseExpenses(text);
  const cn = c.error ? 0 : c.rows.length;
  const en = e.error ? 0 : e.rows.length;
  if (!cn && !en) return { kind: "none", error: c.error || e.error || "no usable rows" };
  const head = text.slice(0, 400).toLowerCase();
  const expHint = /vendor|payee|category|debit|withdrawal|merchant/.test(head);
  const chgHint = /product|item|sku|qty|quantity|unit_price|customer/.test(head);
  const pickExpenses = en > cn || (en === cn && expHint && !chgHint);
  return pickExpenses
    ? { kind: "expenses", rows: e.rows, note: e.note }
    : { kind: "charges", rows: c.rows, note: c.note };
}

/* ------------------------- dated-line transaction read --------------------- */
const AMOUNT_RE = /\(?-?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?/g;
const DATE_RES = [
  /\b(\d{4}-\d{2}-\d{2})\b/,
  /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/,
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/i,
];
const CREDIT_RE = /\b(deposit|refund|payment received|payment thank|interest paid|credit)\b/i;

function lineToTxn(line: string): { d: string; vendor: string; amount: number } | null {
  let d: string | null = null;
  let rest = line;
  for (const re of DATE_RES) {
    const m = re.exec(line);
    if (m) {
      d = normDate(m[1]);
      rest = line.replace(m[0], " ");
      break;
    }
  }
  if (!d) return null;
  const amounts = rest.match(AMOUNT_RE);
  if (!amounts?.length) return null;
  // last amount on a statement line is the transaction (earlier ones are
  // usually balances or units); parentheses mean negative
  const raw = amounts[amounts.length - 1];
  const amount = Math.abs(parseMoney(raw.replace(/[()]/g, "")) ?? 0);
  if (!(amount > 0.009)) return null;
  const vendor = rest.replace(AMOUNT_RE, " ").replace(/[^\p{L}\p{N} .&'-]/gu, " ")
    .replace(/\s+/g, " ").trim().slice(0, 60) || "unknown";
  return { d, vendor, amount };
}

function linesToExpenses(lines: string[], cat: string): { rows: Expense[]; credits: number } {
  const rows: Expense[] = [];
  let credits = 0;
  for (const line of lines) {
    if (CREDIT_RE.test(line)) { credits++; continue; }
    const t = lineToTxn(line);
    if (t) rows.push({ d: t.d, vendor: t.vendor, amount: t.amount, cat });
  }
  return { rows, credits };
}

// A document of dated amounts is usually money OUT (a statement) — but a
// sales report reads as money IN. Decide from the document's own words:
// statement vocabulary wins outright; otherwise enough sales vocabulary
// flips the read to sales rows. Ambiguity defaults to expenses, and the
// per-file note always says which way it was read.
const STATEMENT_RE = /\b(withdrawal|debit|beginning balance|ending balance|statement period|account (number|ending)|available balance)\b/i;
const SALES_RE = /\b(orders?|sale|sales|sold|item sales|gross sales|net sales|receipt #|invoice #|customers?|payment received)\b/i;
function docReadsAsSales(lines: string[]): boolean {
  let statement = 0;
  let sales = 0;
  for (const line of lines) {
    if (STATEMENT_RE.test(line)) statement++;
    if (SALES_RE.test(line)) sales++;
  }
  return statement === 0 && sales >= Math.max(3, Math.ceil(lines.length * 0.1));
}
function txnsToCharges(rows: Expense[]): Charge[] {
  return rows.map((r) => ({
    date: r.d, product: r.vendor, qty: 1, price: r.amount,
    customer: "", fee: 0, channel: "import",
  }));
}

/* --------------------------------- PDF text -------------------------------- */
async function pdfLines(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  const pages = Math.min(doc.numPages, 40);
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // group text runs into visual lines by y, read left to right
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of tc.items as { str?: string; transform?: number[] }[]) {
      if (!item.str?.trim() || !item.transform) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x: item.transform[4], s: item.str });
    }
    for (const [, items] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      lines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ").replace(/\s+/g, " ").trim());
    }
  }
  return lines.filter(Boolean);
}

/* ------------------------------- photo OCR --------------------------------- */
async function ocrLines(file: File, onStatus?: (s: string) => void): Promise<string[]> {
  onStatus?.("reading the photo — the reader downloads once, the photo never leaves this device…");
  const T = await import("tesseract.js");
  const worker = await T.createWorker("eng");
  try {
    const { data } = await worker.recognize(file);
    return data.text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  } finally {
    await worker.terminate();
  }
}

// A receipt photo usually yields ONE expense: the total, the merchant, a date.
function receiptFromLines(lines: string[], file: File): Expense | null {
  let date: string | null = null;
  for (const line of lines) {
    for (const re of DATE_RES) {
      const m = re.exec(line);
      if (m) { date = normDate(m[1]); break; }
    }
    if (date) break;
  }
  if (!date) date = new Date(file.lastModified || Date.now()).toISOString().slice(0, 10);
  const totalLine = lines.find((l) => /\btotal\b/i.test(l) && AMOUNT_RE.test(l) && !/sub[- ]?total|tax/i.test(l));
  let amount = 0;
  if (totalLine) {
    const am = totalLine.match(AMOUNT_RE);
    amount = Math.abs(parseMoney(am![am!.length - 1].replace(/[()]/g, "")) ?? 0);
  } else {
    for (const l of lines) {
      for (const raw of l.match(AMOUNT_RE) ?? []) {
        const v = Math.abs(parseMoney(raw.replace(/[()]/g, "")) ?? 0);
        if (v > amount) amount = v;
      }
    }
  }
  if (!(amount > 0.009)) return null;
  const vendor = (lines.find((l) => /[a-zA-Z]{3}/.test(l) && !AMOUNT_RE.test(l)) ?? "receipt")
    .replace(/[^\p{L}\p{N} .&'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return { d: date, vendor: vendor || "receipt", amount, cat: "receipt" };
}

/* --------------------------------- the drop -------------------------------- */
export async function intakeFiles(files: File[], onStatus?: (s: string) => void): Promise<IntakeResult> {
  const out: IntakeResult = { charges: [], expenses: [], notes: [], okFiles: 0, failFiles: 0 };
  for (const f of files.slice(0, MAX_FILES)) {
    const name = f.name;
    const ext = (name.toLowerCase().split(".").pop() || "");
    try {
      if (ext === "csv" || ext === "txt" || ext === "tsv" || f.type.includes("csv") || f.type.startsWith("text/")) {
        const det = detectCsv(await f.text());
        if (det.kind === "none") {
          out.failFiles++;
          out.notes.push(`${name}: ${det.error}`);
        } else if (det.kind === "charges") {
          out.charges.push(...det.rows);
          out.okFiles++;
          out.notes.push(`${name}: ${det.rows.length} sales rows${det.note ? ` (${det.note})` : ""}`);
        } else {
          out.expenses.push(...det.rows);
          out.okFiles++;
          out.notes.push(`${name}: ${det.rows.length} expense rows${det.note ? ` (${det.note})` : ""}`);
        }
      } else if (ext === "pdf" || f.type === "application/pdf") {
        onStatus?.(`reading ${name}…`);
        const lines = await pdfLines(f);
        const { rows, credits } = linesToExpenses(lines, "bank");
        if (rows.length >= 2) {
          if (docReadsAsSales(lines)) {
            out.charges.push(...txnsToCharges(rows));
            out.okFiles++;
            out.notes.push(`${name}: ${rows.length} lines read as SALES (the document talks about orders, not withdrawals)`);
          } else {
            out.expenses.push(...rows);
            out.okFiles++;
            out.notes.push(`${name}: ${rows.length} expense lines${credits ? ` (${credits} deposits/credits skipped)` : ""}`);
          }
        } else if (lines.length < 3) {
          out.failFiles++;
          out.notes.push(`${name}: this PDF is a scan with no text layer — take photos of the pages instead and drop those`);
        } else {
          const single = receiptFromLines(lines, f);
          if (single) {
            out.expenses.push(single);
            out.okFiles++;
            out.notes.push(`${name}: read as one receipt — ${single.vendor}, $${single.amount.toFixed(2)}`);
          } else {
            out.failFiles++;
            out.notes.push(`${name}: no dated amounts found — export the statement as CSV if you can`);
          }
        }
      } else if (["png", "jpg", "jpeg", "webp", "bmp"].includes(ext) || f.type.startsWith("image/")) {
        if (ext === "heic" || f.type === "image/heic") throw new Error("HEIC photos need converting — screenshot it or export as JPEG");
        const lines = await ocrLines(f, onStatus);
        const { rows } = linesToExpenses(lines, "receipt");
        if (rows.length >= 3) {
          if (docReadsAsSales(lines)) {
            out.charges.push(...txnsToCharges(rows));
            out.okFiles++;
            out.notes.push(`${name}: ${rows.length} lines read as SALES from the photo`);
          } else {
            out.expenses.push(...rows);
            out.okFiles++;
            out.notes.push(`${name}: ${rows.length} expense lines read from the photo`);
          }
        } else {
          const single = receiptFromLines(lines, f);
          if (single) {
            out.expenses.push(single);
            out.okFiles++;
            out.notes.push(`${name}: receipt — ${single.vendor}, $${single.amount.toFixed(2)}`);
          } else {
            out.failFiles++;
            out.notes.push(`${name}: couldn't read amounts from the photo — try a straighter, brighter shot`);
          }
        }
      } else {
        out.failFiles++;
        out.notes.push(`${name}: .${ext} isn't supported yet — CSV, PDF, and photos are`);
      }
    } catch (err) {
      out.failFiles++;
      out.notes.push(`${name}: ${String(err instanceof Error ? err.message : err).slice(0, 90)}`);
    }
  }
  // dedupe exact repeats across files (same day, vendor, amount)
  const seen = new Set<string>();
  out.expenses = out.expenses.filter((e) => {
    const k = `${e.d}|${e.vendor}|${e.amount}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return out;
}
