// ---------------------------------------------------------------------------
// socialMath.ts — marketing → revenue, WITHOUT any social API.
//
// Near-term sources (all live today):
//   * channel attribution — UTM/referrer data already inside the commerce
//     ledger (charges.channel)
//   * the post log — user-logged marketing events (one tap / CSV import of
//     the analytics export every platform lets you download)
//   * tracked links — the UTM builder (first-party by construction)
//
// Long-term: when the official social APIs are registered, they feed the SAME
// PostEvent store automatically (same shape, same math). The API is an
// auto-pull upgrade, not a dependency — that's the design.
// ---------------------------------------------------------------------------

import { getDaily } from "./dataSource";
import { enriched } from "./tierMath";

// ============================ channel attribution ===========================
export interface ChannelRow {
  channel: string;
  revenue: number;
  share: number; // 0..1 of attributed revenue
  customers: number;
  trend: "up" | "down" | "flat"; // second half vs first half of the window
  unknown?: boolean;
}

export async function channelAttribution(): Promise<{ rows: ChannelRow[]; unknownShare: number }> {
  const led = await enriched();
  const dates = [...new Set(led.charges.map((c) => c.date))].sort();
  const mid = dates[Math.floor(dates.length / 2)];
  const agg = new Map<string, { rev: number; rev1: number; rev2: number; cust: Set<string> }>();
  let total = 0;
  led.charges.forEach((c) => {
    const ch = c.channel || "unknown";
    const a = agg.get(ch) ?? { rev: 0, rev1: 0, rev2: 0, cust: new Set() };
    const amt = c.qty * c.price;
    a.rev += amt;
    if (c.date < mid) a.rev1 += amt; else a.rev2 += amt;
    a.cust.add(c.customer);
    agg.set(ch, a);
    total += amt;
  });
  const rows: ChannelRow[] = [...agg.entries()].map(([channel, a]) => ({
    channel,
    revenue: a.rev,
    share: total ? a.rev / total : 0,
    customers: a.cust.size,
    trend: (a.rev2 > a.rev1 * 1.08 ? "up" : a.rev2 < a.rev1 * 0.92 ? "down" : "flat") as ChannelRow["trend"],
    unknown: channel === "unknown",
  })).sort((x, y) => y.revenue - x.revenue);
  const unknownShare = rows.find((r) => r.unknown)?.share ?? 0;
  return { rows, unknownShare };
}

// ============================ the post log ==================================
export interface PostEvent {
  id: string;
  date: string; // ISO
  platform: string; // "instagram" | "tiktok" | ...
  label?: string;
}

const KEY = "counsel.posts";

// Demo seed — planted so the demo shows BOTH outcomes honestly: two posts
// that preceded genuinely strong days and two that didn't move anything.
const SEED: PostEvent[] = [
  { id: "p-1", date: "2026-01-09", platform: "instagram", label: "studio tour reel" },
  { id: "p-2", date: "2026-01-30", platform: "instagram", label: "kiln-opening day" },
  { id: "p-3", date: "2026-02-19", platform: "tiktok", label: "glazing timelapse" },
  { id: "p-4", date: "2026-03-08", platform: "instagram", label: "spring collection" },
];

function readMine(): PostEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeMine(mine: PostEvent[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(mine));
  } catch { /* prototype storage */ }
}

export function listPosts(): PostEvent[] {
  const mine = readMine();
  const ids = new Set(mine.map((p) => p.id));
  return [...mine, ...SEED.filter((s) => !ids.has(s.id) && !mine.some((m) => m.id === `del-${s.id}`))]
    .filter((p) => !p.id.startsWith("del-"))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function addPost(date: string, platform: string, label?: string): PostEvent {
  const p: PostEvent = { id: `p-${Date.now()}`, date, platform, label: label?.slice(0, 80) };
  writeMine([p, ...readMine()]);
  return p;
}

export function addPostsBulk(posts: { date: string; platform: string; label?: string }[]): number {
  const mine = readMine();
  const have = new Set(mine.map((p) => `${p.date}|${p.platform}|${p.label ?? ""}`));
  let n = 0;
  posts.forEach((p) => {
    const k = `${p.date}|${p.platform}|${p.label ?? ""}`;
    if (!have.has(k)) { mine.unshift({ id: `p-${Date.now()}-${n}`, ...p }); have.add(k); n++; }
  });
  writeMine(mine);
  return n;
}

export function deletePost(id: string): void {
  const mine = readMine().filter((p) => p.id !== id);
  if (SEED.some((s) => s.id === id)) mine.push({ id: `del-${id}`, date: "", platform: "" });
  writeMine(mine);
}

// ============================ post-lift event study =========================
export interface PostLift {
  post: PostEvent;
  lift: number | null; // $ vs weekday-expected over post day + next day; null = outside data window
  window: string;
}
export interface LiftSummary {
  perPost: PostLift[];
  medianLift: number | null;
  noiseBand: number; // typical 2-day deviation (MAD-based) — the honesty yardstick
  reliable: boolean; // median beats the noise band with >=3 measurable posts
  n: number;
}

export async function postLift(): Promise<LiftSummary> {
  const daily = await getDaily();
  const idx = new Map(daily.dates.map((d, i) => [d, i]));
  // weekday expectation, computed EXCLUDING post windows to avoid contamination
  const posts = listPosts();
  const inWindow = new Set<number>();
  posts.forEach((p) => {
    const i = idx.get(p.date);
    if (i !== undefined) { inWindow.add(i); inWindow.add(i + 1); }
  });
  const wd = (i: number) => new Date(daily.dates[i] + "T00:00:00").getDay();
  const sums = new Array(7).fill(0), counts = new Array(7).fill(0);
  daily.revenue.forEach((v, i) => {
    if (!inWindow.has(i)) { sums[wd(i)] += v; counts[wd(i)]++; }
  });
  const expect = (i: number) => (counts[wd(i)] ? sums[wd(i)] / counts[wd(i)] : 0);

  // noise band: MAD of clean 2-day deviations
  const devs: number[] = [];
  for (let i = 0; i + 1 < daily.revenue.length; i++) {
    if (inWindow.has(i) || inWindow.has(i + 1)) continue;
    devs.push(daily.revenue[i] - expect(i) + (daily.revenue[i + 1] - expect(i + 1)));
  }
  const absDevs = devs.map(Math.abs).sort((a, b) => a - b);
  const noiseBand = absDevs.length ? absDevs[Math.floor(absDevs.length / 2)] : 0;

  const perPost: PostLift[] = posts.map((p) => {
    const i = idx.get(p.date);
    if (i === undefined || i + 1 >= daily.revenue.length) {
      return { post: p, lift: null, window: "outside the ledger window" };
    }
    const lift = daily.revenue[i] - expect(i) + (daily.revenue[i + 1] - expect(i + 1));
    return { post: p, lift, window: `${p.date} +48h` };
  });

  const measurable = perPost.filter((x) => x.lift !== null).map((x) => x.lift!) as number[];
  const sorted = [...measurable].sort((a, b) => a - b);
  const medianLift = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  return {
    perPost,
    medianLift,
    noiseBand,
    reliable: medianLift !== null && measurable.length >= 3 && Math.abs(medianLift) > noiseBand,
    n: measurable.length,
  };
}

// ============================ the link maker ================================
export function buildUtmLink(dest: string, platform: string, label: string): string {
  let url = dest.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", platform.toLowerCase());
    u.searchParams.set("utm_medium", "social");
    if (label.trim()) u.searchParams.set("utm_campaign", label.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40));
    return u.toString();
  } catch {
    return "";
  }
}
