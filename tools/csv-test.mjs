#!/usr/bin/env node
// csv-test.mjs — the messy-ledger gauntlet for src/engine/csvParse.ts.
// Fixtures modeled on what Square, Shopify, Stripe, Etsy and banks actually
// export, plus the Excel damage people do to them. Run: npm run test:csv
// (bundles the TS with esbuild first — no test framework, just asserts).

import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "csvtest-"));
const bundle = join(dir, "csvParse.mjs");
execSync(`npx esbuild src/engine/csvParse.ts --bundle --format=esm --outfile="${bundle}"`, { stdio: "pipe" });
const { parseCharges, parseExpenses, parseMoney, normDate } = await import(`file://${bundle.replace(/\\/g, "/")}`);

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; }
  else { fail++; console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
const j = JSON.stringify;

/* ---- money ---- */
check("money: plain", parseMoney("45.00") === 45);
check("money: $ + thousands", parseMoney("$1,234.56") === 1234.56);
check("money: EU decimal comma", parseMoney("1.234,56") === 1234.56);
check("money: bare decimal comma", parseMoney("45,50") === 45.5);
check("money: comma thousands no decimals", parseMoney("1,234") === 1234);
check("money: parens negative", parseMoney("(45.00)") === -45);
check("money: trailing minus", parseMoney("45.00-") === -45);
check("money: euro symbol", parseMoney("€99,95") === 99.95);
check("money: swiss apostrophe", parseMoney("1'234.50") === 1234.5);
check("money: currency code", parseMoney("45.00 USD") === 45);
check("money: junk is null", parseMoney("n/a") === null);

/* ---- dates ---- */
check("date: iso", normDate("2026-07-04") === "2026-07-04");
check("date: iso datetime", normDate("2026-07-04 13:22:01") === "2026-07-04");
check("date: us slash", normDate("7/4/2026") === "2026-07-04");
check("date: forced day-first by value", normDate("13/05/2026") === "2026-05-13");
check("date: day-first flag", normDate("05/13/2026", true) === "2026-05-13", normDate("05/13/2026", true));
check("date: ambiguous honors flag", normDate("5/6/2026", true) === "2026-06-05");
check("date: month name", normDate("Jul 5, 2026") === "2026-07-05");
check("date: day month name", normDate("5 Jul 2026") === "2026-07-05");
check("date: excel serial", normDate("46199") != null);

/* ---- 1. baseline (regression: the documented schema still works) ---- */
let r = parseCharges("date,amount,product,qty,unit_price,customer_id,fee\n2026-07-01,28,taco plate,2,14,cust_1,1.2\n");
check("baseline: row", r.rows.length === 1 && r.rows[0].price === 14 && r.rows[0].qty === 2, j(r));

/* ---- 2. semicolon + EU decimals ---- */
r = parseCharges("date;amount;product\n01/07/2026;1.234,56;bowl\n13/07/2026;45,50;mug\n");
check("eu: two rows", r.rows.length === 2, j(r));
check("eu: day-first inferred", r.rows[0]?.date === "2026-07-01", j(r.rows));
check("eu: decimal comma", r.rows[0]?.price === 1234.56, j(r.rows));

/* ---- 3. tab-delimited ---- */
r = parseCharges("date\tamount\tproduct\n2026-07-01\t45\tlatte\n");
check("tsv: parsed", r.rows.length === 1 && r.rows[0].product === "latte", j(r));

/* ---- 4. BOM + CRLF ---- */
r = parseCharges("﻿date,amount\r\n2026-07-01,45\r\n");
check("bom+crlf: parsed", r.rows.length === 1, j(r));

/* ---- 5. Square-style item sales ---- */
r = parseCharges([
  "Date,Time,Gross Sales,Net Sales,Fees,Item,Qty,Payment Method,Customer Name",
  '07/04/2026,13:10:22,"$28.00","$26.80","$1.20",Taco Plate,2,Card,Maria G',
].join("\n"));
check("square: mapped", r.rows.length === 1, j(r));
check("square: gross as amount", r.rows[0]?.qty === 2 && r.rows[0]?.price === 14, j(r.rows));
check("square: fee", r.rows[0]?.fee === 1.2, j(r.rows));
check("square: customer", r.rows[0]?.customer === "Maria G", j(r.rows));

/* ---- 6. Shopify orders export ---- */
r = parseCharges([
  "Name,Email,Financial Status,Paid at,Total,Lineitem quantity,Lineitem name,Lineitem price",
  "#1001,a@b.com,paid,2026-07-03 11:02:00 -0400,76.00,2,Signature Bundle,38.00",
].join("\n"));
check("shopify: mapped", r.rows.length === 1, j(r));
check("shopify: lineitem price wins", r.rows[0]?.price === 38 && r.rows[0]?.product === "Signature Bundle", j(r.rows));

/* ---- 7. Stripe payments export ---- */
r = parseCharges([
  "id,Amount,Fee,Created (UTC),Customer Email,Description,Status",
  "ch_1,49.00,1.72,2026-07-02 15:04,jo@x.com,service call,Paid",
].join("\n"));
check("stripe: mapped", r.rows.length === 1 && r.rows[0].fee === 1.72 && r.rows[0].customer === "jo@x.com", j(r));

/* ---- 8. refunds excluded, counted honestly ---- */
r = parseCharges("date,amount\n2026-07-01,45\n2026-07-02,-45\n2026-07-03,0\n");
check("refunds: kept 1 skipped 2", r.rows.length === 1 && r.skipped === 2, j(r));
check("refunds: note says why", /refunds/.test(r.note ?? ""), r.note);

/* ---- 9. bank debit/credit expenses ---- */
let e = parseExpenses([
  "Date,Description,Debit,Credit,Balance",
  "07/01/2026,COMMISSARY RENT,1800.00,,4200.00",
  "07/02/2026,CARD DEPOSIT,,952.10,5152.10",
  "07/03/2026,RESTOCK SUPPLY,312.44,,4839.66",
].join("\n"));
check("bank d/c: two expenses", e.rows.length === 2, j(e));
check("bank d/c: deposit left out", !e.rows.some((x) => x.vendor.includes("DEPOSIT")), j(e.rows));
check("bank d/c: amounts", e.rows[0]?.amount === 1800 && e.rows[1]?.amount === 312.44, j(e.rows));

/* ---- 10. signed single-column statement ---- */
e = parseExpenses([
  "date,name,amount",
  "2026-07-01,Rent,-1800",
  "2026-07-02,Deposit,952.10",
  "2026-07-03,Supplies,(312.44)",
].join("\n"));
check("signed: two expenses abs'd", e.rows.length === 2 && e.rows[0].amount === 1800 && e.rows[1].amount === 312.44, j(e.rows));
check("signed: note explains deposits", /deposit/i.test(e.note ?? ""), e.note);

/* ---- 11. all-positive expense report stays whole ---- */
e = parseExpenses("date,vendor,amount,category\n2026-07-01,CloudPOS,49,software\n2026-07-05,Insurance,210,insurance\n");
check("positive expenses: both kept", e.rows.length === 2, j(e));

/* ---- 12. month-name dates ---- */
r = parseCharges("date,total\nJul 5 2026,45\n5 Aug 2026,50\n");
check("month names: both", r.rows.length === 2 && r.rows[0].date === "2026-07-05" && r.rows[1].date === "2026-08-05", j(r.rows));

/* ---- 13. quoted fields with embedded delimiter + escaped quotes ---- */
r = parseCharges('date,amount,product\n2026-07-01,45,"the ""big"" bundle, deluxe"\n');
check("quotes: product intact", r.rows[0]?.product === 'the "big" bundle, deluxe', j(r.rows));

/* ---- 14. trailing summary row + blank lines skipped ---- */
r = parseCharges("date,amount\n2026-07-01,45\n\nTotal,45\n");
check("summary row: skipped not crashed", r.rows.length === 1 && r.skipped === 1, j(r));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
