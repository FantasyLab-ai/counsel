// cloudSync.ts — the client half of counsel-cloud. Connect a provider with a
// key YOU mint in YOUR dashboard (read-only), then sync: the Worker pulls,
// normalizes to the canonical Charge shape, and hands rows back — they land
// in the SAME on-device store the CSV drop-in uses (dataSource), so every
// engine lights up with zero further wiring. Nothing is stored server-side
// except your encrypted token.

import { storeUserData } from "./dataSource";
import type { Charge, Expense } from "./tierMath";

const BASE = "https://counsel-cloud.fantasy-labai.workers.dev";
const K_ACCOUNT = "counsel.cloud.account";

export type CloudProvider = "stripe" | "square" | "shopify" | "plaid";

interface CloudAccount { accountId: string; accountSecret: string }

function readAccount(): CloudAccount | null {
  try {
    const raw = localStorage.getItem(K_ACCOUNT);
    return raw ? (JSON.parse(raw) as CloudAccount) : null;
  } catch {
    return null;
  }
}

export function hasCloudAccount(): boolean {
  return readAccount() !== null;
}

async function api(path: string, init?: RequestInit, auth = true): Promise<Record<string, unknown>> {
  const acct = auth ? readAccount() : null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(acct ? { Authorization: `Bearer ${acct.accountId}.${acct.accountSecret}` } : {}),
      ...init?.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = [body.error, body.detail].filter(Boolean).join(": ") || `request failed (${res.status})`;
    throw new Error(String(msg));
  }
  return body;
}

/** Mint the device account on first use; reuse it forever after. */
async function ensureAccount(): Promise<CloudAccount> {
  const existing = readAccount();
  if (existing) return existing;
  const made = await api("/v1/account", { method: "POST", body: "{}" }, false);
  const acct = { accountId: String(made.accountId), accountSecret: String(made.accountSecret) };
  localStorage.setItem(K_ACCOUNT, JSON.stringify(acct));
  return acct;
}

export async function listCloudConnections(): Promise<CloudProvider[]> {
  if (!hasCloudAccount()) return [];
  const res = await api("/v1/connections");
  return (res.providers as CloudProvider[]) ?? [];
}


/* ------------------------------- Plaid Link -------------------------------
   The bank flow: the worker mints a link_token; Plaid's own UI handles the
   bank login (we never see credentials); the public_token comes back here
   and is exchanged + sealed server-side. Script loads on demand from
   Plaid's CDN. Sandbox test login: any bank, user_good / pass_good. */

declare global {
  interface Window {
    Plaid?: { create(cfg: { token: string; onSuccess: (t: string) => void; onExit?: () => void }): { open(): void } };
  }
}

export async function plaidLinkToken(): Promise<string> {
  const res = await api("/v1/plaid/link-token", { method: "POST", body: "{}" });
  return res.link_token as string;
}

export async function plaidExchange(publicToken: string): Promise<void> {
  await api("/v1/plaid/exchange", { method: "POST", body: JSON.stringify({ public_token: publicToken }) });
}

function loadPlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("could not load Plaid Link"));
    document.head.appendChild(s);
  });
}

/** Open the bank picker; resolves true when a bank was connected. */
export async function connectBank(): Promise<boolean> {
  await ensureAccount();
  const token = await plaidLinkToken();
  await loadPlaidScript();
  return new Promise((resolve, reject) => {
    const handler = window.Plaid!.create({
      token,
      onSuccess: (publicToken: string) => {
        plaidExchange(publicToken).then(() => resolve(true)).catch(reject);
      },
      onExit: () => resolve(false),
    });
    handler.open();
  });
}

export interface CloudStatus { providers: CloudProvider[]; pulse: boolean; backfill: { c: number; e: number; days: number } | null }

export async function cloudStatus(): Promise<CloudStatus> {
  if (!hasCloudAccount()) return { providers: [], pulse: false, backfill: null };
  const res = await api("/v1/connections");
  return {
    providers: (res.providers as CloudProvider[]) ?? [],
    pulse: !!res.pulse,
    backfill: (res.backfill as CloudStatus["backfill"]) ?? null,
  };
}

/** Demo pulse: the Worker seeds 1–3 fake sales every 30 min into connected
 * TEST/SANDBOX accounts (live keys are never written to). Enabling also
 * fires an instant burst so the very next sync shows life. */
export async function setPulse(on: boolean): Promise<Record<string, number>> {
  const res = await api("/v1/pulse", { method: "POST", body: JSON.stringify({ on }) });
  return (res.seeded as Record<string, number>) ?? {};
}

export async function connectProvider(
  provider: CloudProvider,
  creds: { key?: string; token?: string; shop?: string; env?: string },
): Promise<void> {
  await ensureAccount();
  await api(`/v1/connect/${provider}`, { method: "POST", body: JSON.stringify(creds) });
}

export async function disconnectProvider(provider: CloudProvider): Promise<void> {
  await api(`/v1/connect/${provider}`, { method: "DELETE" });
}

export interface SyncResult {
  rows: number;          // charge rows landed (all sales sources, merged, deduped)
  expenseRows: number;   // expense rows landed (bank + seeded)
  seeded: boolean;
  deduped: number;       // Stripe echoes of Shopify orders removed
  pulled: Record<string, number>;
  errors?: Record<string, string>;
}

/** ONE sync, the whole business: every connected provider is pulled in the
 * same pass — sales sources merge into a single ledger, the bank feeds
 * expenses, seeded history rides underneath. Stores whatever arrived:
 * an expenses-only sync (bank connected, no sales source yet) still lands. */
export async function syncNow(days = 365): Promise<SyncResult> {
  const res = await api("/v1/sync", { method: "POST", body: JSON.stringify({ days }) });
  const charges = (res.charges as Charge[]) ?? [];
  const expenses = (res.expenses as Expense[]) ?? [];
  const pulled = (res.pulled as Record<string, number>) ?? {};
  const sources = (res.sources as string[]) ?? [];
  const seeded = !!res.seeded;
  if (charges.length || expenses.length) {
    const name = `${sources.length ? sources.join(" + ") + " live sync" : "live sync"}${seeded ? " · seeded test history" : ""}`;
    storeUserData(charges.length ? charges : null, expenses.length ? expenses : null, name);
  }
  return {
    rows: charges.length,
    expenseRows: expenses.length,
    seeded,
    deduped: (res.deduped as number) ?? 0,
    pulled,
    ...(res.errors ? { errors: res.errors as Record<string, string> } : {}),
  };
}

export interface BackfillInfo { c: number; e: number; days: number }

/** Seed months of realistic TEST history into the vault (refused when any
 * live credential is connected). Every sync then returns history + the
 * growing pulse data — the full story from day one. */
export async function seedHistory(days = 90): Promise<{ charges: number; expenses: number }> {
  const res = await api("/v1/backfill", { method: "POST", body: JSON.stringify({ days }) });
  return { charges: (res.charges as number) ?? 0, expenses: (res.expenses as number) ?? 0 };
}

export async function clearHistory(): Promise<void> {
  await api("/v1/backfill", { method: "DELETE" });
}

/** Delete the cloud account AND its stored tokens (the on-device data stays). */
export async function deleteCloudAccount(): Promise<void> {
  if (!hasCloudAccount()) return;
  try {
    await api("/v1/account", { method: "DELETE" });
  } finally {
    localStorage.removeItem(K_ACCOUNT);
  }
}
