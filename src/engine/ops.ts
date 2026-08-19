// ops.ts — Stock & Shipments math. Inventory cover is computed against the
// REAL demand rates in the ledger (same source as the newsvendor engine),
// so "days of cover" and "reorder by" are derived, not typed in. Shipments:
// triage by scan-age; carriers plug in via AfterShip/Shippo in Phase 2B.

import { enriched } from "./tierMath";

export interface InventoryRow {
  product: string; name: string; onHand: number; incoming: number;
  incomingEta: string | null; dailyRate: number; daysCover: number;
  reorderBy: string | null; state: "reorder" | "healthy" | "overstocked";
  tiedUp: number; // cash sitting in excess units (over 45 days of cover)
}
export interface ShipmentRow {
  id: string; order: string; carrier: string; tracking: string; dest: string;
  shipped: string; status: "delivered" | "in_transit" | "label_created";
  daysInTransit: number; stalled: boolean;
}
export interface OpsOut {
  inventory: InventoryRow[];
  shipments: ShipmentRow[];
  stalled: number;
  reorders: number;
  tiedUpTotal: number;
}

const LEAD_TIME_DAYS = 12; // pottery restock lead time (assumption, shown in UI)
const STALL_DAYS = 6;

export async function opsReport(): Promise<OpsOut> {
  const led = await enriched();
  const raw = await (await fetch("/kiln_ops.json")).json();

  // demand rate per product = mean daily units over the last 45 ledger days
  const dates = [...new Set(led.charges.map((c) => c.date))].sort();
  const recent = new Set(dates.slice(-45));
  const unitsByProduct = new Map<string, number>();
  led.charges.forEach((c) => {
    if (recent.has(c.date)) unitsByProduct.set(c.product, (unitsByProduct.get(c.product) ?? 0) + c.qty);
  });

  const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // The demo inventory fixture is keyed to one world's product ids; in the
  // other demo worlds (or thin live data) we synthesize plausible on-hand
  // from each product's own selling rate instead of crashing.
  type InvRaw = { product: string; on_hand: number; incoming: number; incoming_eta: string | null };
  const invMatched = (raw.inventory as InvRaw[]).filter((r) => led.products.some((pp) => pp.id === r.product));
  const invSource: InvRaw[] = invMatched.length ? invMatched : led.products.map((pp) => {
    const rate = (unitsByProduct.get(pp.id) ?? 0) / Math.max(1, Math.min(45, recent.size));
    return { product: pp.id, on_hand: Math.max(4, Math.round(rate * 18)), incoming: 0, incoming_eta: null };
  });
  const inventory: InventoryRow[] = invSource.map((r) => {
    const meta = led.products.find((p) => p.id === r.product)!;
    const rate = (unitsByProduct.get(r.product) ?? 0) / Math.min(45, recent.size);
    const cover = rate > 0 ? r.on_hand / rate : 999;
    const state: InventoryRow["state"] =
      cover < LEAD_TIME_DAYS + 4 ? "reorder" : cover > 45 ? "overstocked" : "healthy";
    const reorderBy =
      state === "reorder"
        ? fmt(new Date(lastDate.getTime() + Math.max(0, (cover - LEAD_TIME_DAYS)) * 86400000))
        : null;
    const excessUnits = state === "overstocked" ? Math.round((cover - 45) * rate) : 0;
    return {
      product: r.product, name: meta.name, onHand: r.on_hand, incoming: r.incoming,
      incomingEta: r.incoming_eta, dailyRate: rate, daysCover: cover, reorderBy,
      state, tiedUp: excessUnits * meta.cost,
    };
  }).sort((a, b) => a.daysCover - b.daysCover);

  const shipments: ShipmentRow[] = (raw.shipments as Record<string, unknown>[]).map((s) => ({
    id: s.id as string, order: s.order as string, carrier: s.carrier as string,
    tracking: s.tracking as string, dest: s.dest as string, shipped: s.shipped as string,
    status: s.status as ShipmentRow["status"],
    daysInTransit: s.days_in_transit as number,
    stalled: s.status === "in_transit" && (s.days_in_transit as number) >= STALL_DAYS,
  }));

  return {
    inventory,
    shipments,
    stalled: shipments.filter((s) => s.stalled).length,
    reorders: inventory.filter((i) => i.state === "reorder").length,
    tiedUpTotal: inventory.reduce((s, i) => s + i.tiedUp, 0),
  };
}

export const OPS_ASSUMPTIONS = `demand rates from your last 45 selling days · restock lead time assumed ${LEAD_TIME_DAYS} days · a shipment counts as stalled after ${STALL_DAYS} days without delivery`;
