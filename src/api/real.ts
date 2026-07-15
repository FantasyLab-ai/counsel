// Real backend adapter — same interface as the mocks, zero component changes.
// Enabled when VITE_COUNSEL_API is set (e.g. http://127.0.0.1:8100).
// The backend is server/server.py: a thin Flask service whose numbers all come
// from Aurora's real methods (PELT change-point, Welch tests, model-zoo
// forecast) run over the ledger. See server/engine.py.

import type { AskAnswer, Brief, Metric, Period, Source } from "./counsel";

const BASE = (import.meta.env.VITE_COUNSEL_API as string | undefined)?.replace(/\/$/, "") ?? "";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export const enabled = BASE.length > 0;

export function brief(): Promise<Brief> {
  return get<Brief>("/api/brief");
}

export function metrics(period: Period): Promise<Metric[]> {
  return get<Metric[]>(`/api/metrics?period=${encodeURIComponent(period)}`);
}

export async function ask(question: string): Promise<AskAnswer> {
  const r = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!r.ok) throw new Error(`/api/ask → HTTP ${r.status}`);
  return r.json() as Promise<AskAnswer>;
}

export async function seededAsk(): Promise<AskAnswer[]> {
  // Real mode seeds the thread with the two live-computed exchanges so the
  // screen still opens mid-conversation (same UX as the prototype).
  const [hire, fc] = await Promise.all([
    ask("Can I afford to hire a part-time helper at $1,400/mo?"),
    ask("Will next month bounce back?"),
  ]);
  return [hire, fc];
}

export function connections(): Promise<Source[]> {
  return get<Source[]>("/api/connections");
}
