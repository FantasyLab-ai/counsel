// cloudSync.ts — the client half of counsel-cloud. Connect a provider with a
// key YOU mint in YOUR dashboard (read-only), then sync: the Worker pulls,
// normalizes to the canonical Charge shape, and hands rows back — they land
// in the SAME on-device store the CSV drop-in uses (dataSource), so every
// engine lights up with zero further wiring. Nothing is stored server-side
// except your encrypted token.

import { storeUserData } from "./dataSource";
import type { Charge } from "./tierMath";

const BASE = "https://counsel-cloud.fantasy-labai.workers.dev";
const K_ACCOUNT = "counsel.cloud.account";

export type CloudProvider = "stripe" | "square" | "shopify";

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
  if (!res.ok) throw new Error(String(body.error ?? `request failed (${res.status})`));
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

export interface CloudStatus { providers: CloudProvider[]; pulse: boolean }

export async function cloudStatus(): Promise<CloudStatus> {
  if (!hasCloudAccount()) return { providers: [], pulse: false };
  const res = await api("/v1/connections");
  return {
    providers: (res.providers as CloudProvider[]) ?? [],
    pulse: !!res.pulse,
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
  rows: number;
  pulled: Record<string, number>;
  errors?: Record<string, string>;
}

/** Pull from every connected provider and land rows in the on-device store. */
export async function syncNow(days = 365): Promise<SyncResult> {
  const res = await api("/v1/sync", { method: "POST", body: JSON.stringify({ days }) });
  const charges = (res.charges as Charge[]) ?? [];
  const pulled = (res.pulled as Record<string, number>) ?? {};
  const sources = (res.sources as string[]) ?? [];
  if (charges.length) {
    storeUserData(charges, null, `${sources.join(" + ")} live sync`);
  }
  return {
    rows: charges.length,
    pulled,
    ...(res.errors ? { errors: res.errors as Record<string, string> } : {}),
  };
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
