// connectorStatus.ts — THE single source of connector honesty. The guided
// walk (Power), the onboarding doors, and any future surface all derive
// from this table, so a platform going live is ONE status flip here and
// every surface updates together. Ready connectors walk first.

import type { CloudProvider } from "./cloudSync";

export interface ConnectorStep {
  id: CloudProvider | "csv";
  name: string;
  what: string;
  status: "ready" | "soon";
  note?: string;
  /** Bank feeds cost us a monthly fee per connected bank for as long as the
   *  connection lives, so they sit in Pro. Every other connector is free
   *  forever because serving it costs nothing. */
  pro?: true;
}

export const GUIDE_STEPS: ConnectorStep[] = [
  // ---- live today: one sign-in each ----
  { id: "square", name: "Square", status: "ready",
    what: "your register — sales sync automatically after one sign-in" },
  { id: "shopify", name: "Shopify", status: "ready",
    what: "your online store — orders flow in after you sign in",
    note: "pilot stores: we connect this together — have your your-shop.myshopify.com name handy" },
  { id: "stripe", name: "Stripe", status: "ready",
    what: "online payments and invoices — sign in once, no keys. Counsel only ever reads" },
  { id: "etsy", name: "Etsy", status: "ready",
    what: "maker sales from your shop — sign in once, no keys" },
  { id: "plaid", name: "Bank account", status: "ready", pro: true,
    what: "your expenses, straight from the bank — sign in through Plaid's secure window, read-only" },
  { id: "quickbooks", name: "QuickBooks", status: "ready",
    what: "your books — sign in with Intuit once, expenses feed the money map and cash view" },
  // ---- always works ----
  { id: "csv", name: "A simple file", status: "ready",
    what: "export a CSV from anywhere — sales or expenses — and drop it in. Always works, nothing to sign into" },
];

/** OAuth-capable connectors that are live right now (excludes csv/plaid —
 *  plaid opens its own bank picker, csv is the drop). */
export function readyOAuth(): ConnectorStep[] {
  return GUIDE_STEPS.filter((s) => s.status === "ready" && s.id !== "csv" && s.id !== "plaid");
}

/** The honest "still in review" list, for copy that names what's coming. */
export function soonNames(): string[] {
  return GUIDE_STEPS.filter((s) => s.status === "soon").map((s) => s.name);
}
