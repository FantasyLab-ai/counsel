// drivers.ts — the "what changed" engine. When revenue moves, an owner asks
// WHY, and dashboards don't answer. This decomposes the move into the four
// levers an owner can actually pull: traffic (how many sales), basket size
// (units per sale), price (paid per unit), and mix (which products carried
// the weight) — plus who did the buying (new vs returning).
//
// Method: two aligned 28-day windows (same weekday count, so the comparison
// is honest by construction), anchored to the LAST date in the data — never
// the wall clock, so a demo ledger and a live feed both read correctly.
// Identity used:  Rev = T × U × P   (transactions × units/tx × $/unit)
//   traffic effect = (T2−T1) · U1 · P1
//   basket  effect = T2 · (U2−U1) · P1
//   price   effect = T2 · U2 · (P2−P1)
// The three parts sum to ΔRev exactly (telescoping) — arithmetic, no model.

import { enriched, money, type Charge } from "./tierMath";

export interface DriverPart {
  key: "traffic" | "basket" | "price";
  label: string;
  dollars: number;   // signed contribution to ΔRev
  detail: string;    // "412 → 380 sales"
}

export interface DriversOut {
  ok: true;
  windowDays: number;
  rev1: number; rev2: number;
  deltaDollars: number; deltaPct: number;
  parts: DriverPart[];
  mix: { product: string; from: number; to: number } | null; // top share mover
  customers: { newShare: number; returningShare: number; prevNewShare: number } | null;
  headline: string;  // one plain-English sentence, <b> allowed
  cite: string;
}

export interface DriversThin { ok: false; reason: string }

const W = 28; // aligned weekday counts by construction

function sum(xs: number[]): number { return xs.reduce((s, v) => s + v, 0); }

export async function drivers(): Promise<DriversOut | DriversThin> {
  const led = await enriched();
  const charges = led.charges;
  if (!charges.length) return { ok: false, reason: "no transactions yet" };

  const sortedDates = charges.map((c) => c.date).sort();
  const last = sortedDates[sortedDates.length - 1];
  const anchor = new Date(last + "T00:00:00");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const back = (days: number) => iso(new Date(anchor.getTime() - days * 86400000));
  const cutMid = back(W - 1);       // window 2: (mid .. last]  = 28 days incl. last
  const cutLo = back(2 * W - 1);    // window 1: (lo .. mid)

  const w1: Charge[] = [], w2: Charge[] = [];
  for (const c of charges) {
    if (c.date >= cutMid) w2.push(c);
    else if (c.date >= cutLo) w1.push(c);
  }
  if (w1.length < 15 || w2.length < 15) {
    return { ok: false, reason: `needs ~15+ sales in each 28-day window (have ${w1.length} and ${w2.length}) — building history` };
  }

  const rev = (xs: Charge[]) => sum(xs.map((c) => c.qty * c.price));
  const units = (xs: Charge[]) => sum(xs.map((c) => c.qty));
  const rev1 = rev(w1), rev2 = rev(w2);
  const T1 = w1.length, T2 = w2.length;
  const U1 = units(w1) / T1, U2 = units(w2) / T2;
  const P1 = rev1 / units(w1), P2 = rev2 / units(w2);

  const traffic = (T2 - T1) * U1 * P1;
  const basket = T2 * (U2 - U1) * P1;
  const price = T2 * U2 * (P2 - P1);
  const deltaDollars = rev2 - rev1;
  const deltaPct = rev1 > 0 ? (deltaDollars / rev1) * 100 : 0;

  const parts: DriverPart[] = [
    { key: "traffic", label: "Traffic — number of sales", dollars: traffic, detail: `${T1} → ${T2} sales` },
    { key: "basket", label: "Basket — units per sale", dollars: basket, detail: `${U1.toFixed(2)} → ${U2.toFixed(2)} units` },
    { key: "price", label: "Price — $ per unit", dollars: price, detail: `${money(P1)} → ${money(P2)}` },
  ];

  // ---- mix: which product's revenue share moved most ----
  let mix: DriversOut["mix"] = null;
  const share = (xs: Charge[], total: number) => {
    const m = new Map<string, number>();
    xs.forEach((c) => m.set(c.product, (m.get(c.product) ?? 0) + c.qty * c.price));
    return new Map([...m].map(([k, v]) => [k, v / total]));
  };
  if (rev1 > 0 && rev2 > 0) {
    const s1 = share(w1, rev1), s2 = share(w2, rev2);
    let best = 0;
    for (const [prod, sh2] of s2) {
      const d = Math.abs(sh2 - (s1.get(prod) ?? 0));
      if (d > best && d >= 0.05) {
        best = d;
        mix = { product: prod, from: Math.round((s1.get(prod) ?? 0) * 100), to: Math.round(sh2 * 100) };
      }
    }
  }

  // ---- who bought: new vs returning (vs each window's start) ----
  let customers: DriversOut["customers"] = null;
  const known = (xs: Charge[]) => new Set(xs.map((c) => c.customer));
  const idsBefore1 = known(charges.filter((c) => c.date < cutLo));
  const idsBefore2 = known(charges.filter((c) => c.date < cutMid));
  const namedShare = (xs: Charge[]) => xs.filter((c) => c.customer && c.customer !== "guest").length / xs.length;
  if (namedShare(w2) > 0.5) { // only claim it when ids actually exist
    const newRev = (xs: Charge[], prior: Set<string>) =>
      sum(xs.filter((c) => !prior.has(c.customer)).map((c) => c.qty * c.price));
    customers = {
      newShare: Math.round((newRev(w2, idsBefore2) / rev2) * 100),
      returningShare: 100 - Math.round((newRev(w2, idsBefore2) / rev2) * 100),
      prevNewShare: rev1 > 0 ? Math.round((newRev(w1, idsBefore1) / rev1) * 100) : 0,
    };
  }

  // ---- the sentence ----
  const ranked = [...parts].sort((a, b) => Math.abs(b.dollars) - Math.abs(a.dollars));
  const top = ranked[0];
  const pctOf = (d: number) => rev1 > 0 ? Math.abs((d / rev1) * 100).toFixed(0) : "0";
  const dir = deltaDollars >= 0 ? "up" : "down";
  const topDir = top.dollars >= 0 ? "added" : "cost";
  const flatBand = Math.abs(deltaPct) < 3;
  const headline = flatBand
    ? `Held <b>flat</b> (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%) — no single lever moved it meaningfully.`
    : `<b>${dir === "up" ? "Up" : "Down"} ${Math.abs(deltaPct).toFixed(0)}%</b> vs the prior 4 weeks — mostly <b>${top.key}</b>: ${top.label.split(" — ")[1]} ${topDir} ${money(Math.abs(top.dollars))} (${pctOf(top.dollars)}% of a normal 4 weeks${ranked[1] && Math.abs(ranked[1].dollars) > Math.abs(deltaDollars) * 0.25 ? `), with ${ranked[1].key} ${ranked[1].dollars >= 0 ? "helping" : "dragging"}` : ")"}.`;

  return {
    ok: true,
    windowDays: W,
    rev1: Math.round(rev1), rev2: Math.round(rev2),
    deltaDollars: Math.round(deltaDollars), deltaPct,
    parts,
    mix,
    customers,
    headline,
    cite: `two aligned ${W}-day windows ending ${last} · Rev = sales × units/sale × $/unit · parts sum to the move exactly · arithmetic, no model`,
  };
}
