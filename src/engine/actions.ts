// actions.ts — the client half of signed execution. Preview fetches the
// exact current state from the provider; the owner signs the specific
// diff; the executor performs it and arms the watchdog. Prices and
// messages — never money.

import { userCharges } from "./dataSource";

const BASE = "https://counsel-cloud.fantasy-labai.workers.dev";
const K_ACCOUNT = "counsel.cloud.account";

function auth(): string | null {
  try {
    const raw = localStorage.getItem(K_ACCOUNT);
    if (!raw) return null;
    const a = JSON.parse(raw) as { accountId: string; accountSecret: string };
    return `Bearer ${a.accountId}.${a.accountSecret}`;
  } catch { return null; }
}

async function api(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const a = auth();
  if (!a) throw new Error("no cloud account yet — connect a provider first");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", Authorization: a, ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(body.error ?? `request failed (${res.status})`));
  return body;
}

export interface ActionPreview {
  productId: string; variantId: string; title: string;
  currentPrice: number; newPrice: number | null;
}

export interface ActionTrigger { minDaily: number; days: number; horizonDays: number }

export interface ExecutedAction {
  aid: string; t: number; provider: string; title: string;
  productId: string; variantId: string;
  from: number; to: number;
  trigger: ActionTrigger;
  status: "armed" | "held" | "reverted_auto" | "reverted_manual";
  closedAt?: string; note?: string;
}

export async function previewPrice(query: string, newPrice: number): Promise<ActionPreview> {
  const res = await api("/v1/actions/preview", {
    method: "POST",
    body: JSON.stringify({ provider: "shopify", query, newPrice }),
  });
  return res as unknown as ActionPreview;
}

export async function executePrice(p: ActionPreview, toPrice: number, trigger: ActionTrigger): Promise<ExecutedAction> {
  const res = await api("/v1/actions/execute", {
    method: "POST",
    body: JSON.stringify({
      provider: "shopify",
      productId: p.productId, variantId: p.variantId, title: p.title,
      fromPrice: p.currentPrice, toPrice, trigger,
    }),
  });
  return res.action as ExecutedAction;
}

export async function listActions(): Promise<ExecutedAction[]> {
  if (!auth()) return [];
  const res = await api("/v1/actions");
  return (res.actions as ExecutedAction[]) ?? [];
}

export async function revertAction(aid: string): Promise<void> {
  await api("/v1/actions/revert", { method: "POST", body: JSON.stringify({ aid }) });
}

/** A sensible default rollback floor: 60% of the product's recent average
 * units/day from the owner's own ledger (editable before signing). */
export function suggestTrigger(productTitle: string): ActionTrigger {
  let minDaily = 1;
  try {
    const rows = (userCharges() ?? []).filter((c) => c.product === productTitle);
    const cut = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
    const recent = rows.filter((c) => c.date >= cut);
    const days = new Set(recent.map((c) => c.date)).size || 1;
    const units = recent.reduce((s, c) => s + c.qty, 0);
    minDaily = Math.max(0.5, Math.round((units / days) * 0.6 * 10) / 10);
  } catch { /* default stands */ }
  return { minDaily, days: 5, horizonDays: 30 };
}
