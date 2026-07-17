// menu.ts — menu/product engineering, the restaurant-consultant classic
// generalized to every product business. Each product is placed on the
// margin × velocity map by median splits:
//   stars      (high margin, high velocity)  -> protect, never discount
//   workhorses (low margin,  high velocity)  -> the price-test candidates
//   puzzles    (high margin, low velocity)   -> visibility problem, promote
//   dogs       (low margin,  low velocity)   -> retire or rework
// Price proposals are $-quantified ONLY when A1 measured your elasticity;
// otherwise the proposal is a measured test, not a promised gain.

import { enriched, money, priceElasticity } from "./tierMath";

export type Quadrant = "star" | "workhorse" | "puzzle" | "dog";

export interface MenuItem {
  product: string;
  unitsPerWeek: number;
  marginPerUnit: number;   // price − cost (cost may be the labeled assumption)
  revenueShare: number;    // of the window
  quadrant: Quadrant;
}

export interface MenuProposal {
  action: string;
  expected: string;
  impact?: number;   // $/mo, only when elasticity was measured
  source: string;
  cite: string;
}

export interface MenuOut {
  ok: true;
  items: MenuItem[];
  proposals: MenuProposal[];
  windowDays: number;
  costAssumed: boolean; // true when costs are the labeled 55% assumption
  cite: string;
}

export interface MenuThin { ok: false; reason: string }

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const W = 56;

export async function menuMap(): Promise<MenuOut | MenuThin> {
  const led = await enriched();
  const sorted = led.charges.map((c) => c.date).sort();
  const last = sorted[sorted.length - 1];
  if (!last) return { ok: false, reason: "no transactions yet" };
  const cut = new Date(new Date(last + "T00:00:00").getTime() - (W - 1) * 86400000).toISOString().slice(0, 10);
  const win = led.charges.filter((c) => c.date >= cut);
  const weeks = W / 7;

  const byProd = new Map<string, { units: number; revenue: number; prices: number[] }>();
  win.forEach((c) => {
    const p = byProd.get(c.product) ?? { units: 0, revenue: 0, prices: [] };
    p.units += c.qty; p.revenue += c.qty * c.price; p.prices.push(c.price);
    byProd.set(c.product, p);
  });
  if (byProd.size < 2) return { ok: false, reason: `needs 2+ products to map (has ${byProd.size}) — the map is comparative` };

  const totalRev = [...byProd.values()].reduce((s, v) => s + v.revenue, 0);
  const costOf = (prod: string, medPrice: number): { cost: number; assumed: boolean } => {
    const known = led.products.find((p) => p.id === prod || p.name === prod);
    if (known && known.cost > 0) return { cost: known.cost, assumed: false };
    return { cost: medPrice * 0.55, assumed: true };
  };

  let anyAssumed = false;
  const raw = [...byProd.entries()].map(([prod, v]) => {
    const medPrice = median(v.prices);
    const { cost, assumed } = costOf(prod, medPrice);
    if (assumed) anyAssumed = true;
    return {
      product: prod,
      unitsPerWeek: v.units / weeks,
      marginPerUnit: medPrice - cost,
      revenueShare: v.revenue / totalRev,
      medPrice,
    };
  });

  const mUnits = median(raw.map((r) => r.unitsPerWeek));
  const mMargin = median(raw.map((r) => r.marginPerUnit));
  const items: MenuItem[] = raw.map((r) => ({
    product: r.product,
    unitsPerWeek: Math.round(r.unitsPerWeek * 10) / 10,
    marginPerUnit: Math.round(r.marginPerUnit * 100) / 100,
    revenueShare: Math.round(r.revenueShare * 100) / 100,
    quadrant: (r.unitsPerWeek >= mUnits
      ? (r.marginPerUnit >= mMargin ? "star" : "workhorse")
      : (r.marginPerUnit >= mMargin ? "puzzle" : "dog")) as Quadrant,
  }));

  // ---- proposals ----
  const proposals: MenuProposal[] = [];
  let elasticity: Awaited<ReturnType<typeof priceElasticity>> = null;
  try { elasticity = await priceElasticity(); } catch { /* fine */ }

  const horse = raw
    .filter((r) => items.find((i) => i.product === r.product)!.quadrant === "workhorse")
    .sort((a, b) => b.revenueShare - a.revenueShare)[0];
  if (horse) {
    const bump = 0.04;
    if (elasticity && elasticity.inelastic) {
      const e = elasticity.elasticity;
      const unitsMo = horse.unitsPerWeek * 4.33;
      const gain = unitsMo * horse.medPrice * bump * (1 + e * bump);
      const gainLo = unitsMo * horse.medPrice * bump * (1 + elasticity.ciLo * bump);
      proposals.push({
        action: `Test +4% on ${horse.product}`,
        expected: `≈ ${money(gain)}/mo margin (cautious: ${money(gainLo)}) — your measured elasticity says buyers tolerate it`,
        impact: Math.round(gain),
        source: "Menu · workhorse reprice",
        cite: `elasticity ${e.toFixed(2)} measured from YOUR price change (A1) applied to a +4% move`,
      });
    } else {
      proposals.push({
        action: `Run a measured +4% test on ${horse.product}`,
        expected: `no $ promised — elasticity not yet measured for you; 2 weeks of data decides it`,
        source: "Menu · workhorse reprice",
        cite: "high-velocity, below-median margin: the classic reprice candidate — but I quantify only what's measured",
      });
    }
  }
  const puzzle = items.filter((i) => i.quadrant === "puzzle").sort((a, b) => b.marginPerUnit - a.marginPerUnit)[0];
  if (puzzle) {
    proposals.push({
      action: `Spotlight ${puzzle.product} this week`,
      expected: `it earns ${money(puzzle.marginPerUnit)}/unit — a visibility problem, not a product problem`,
      source: "Menu · puzzle promote",
      cite: "high margin, below-median velocity — promote before repricing",
    });
  }
  const dog = items.filter((i) => i.quadrant === "dog").sort((a, b) => a.marginPerUnit - b.marginPerUnit)[0];
  if (dog && items.length >= 4) {
    proposals.push({
      action: `Rework or retire ${dog.product}`,
      expected: `below-median on both margin and velocity — every hour it takes is an hour off your stars`,
      source: "Menu · dog review",
      cite: "bottom quadrant on the margin × velocity map",
    });
  }

  return {
    ok: true,
    items: items.sort((a, b) => b.revenueShare - a.revenueShare),
    proposals,
    windowDays: W,
    costAssumed: anyAssumed,
    cite: `margin × velocity over the last ${W} days · quadrants split at the medians` +
      (anyAssumed ? ` · costs assumed at 55% of median price where unknown — labeled, replace with real costs anytime` : ` · real recorded costs`),
  };
}
