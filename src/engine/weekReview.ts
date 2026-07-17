// weekReview.ts — the Sunday-evening companion to the morning digest.
// WHAT HAPPENED (last complete week vs the one before — aligned by
// construction), WHAT HELD (sentinel + watchlist), THE LOOP (decisions due,
// proposals waiting), and NEXT WEEK'S ONE THING (the highest-$ proposal).
// Same composer pattern as the digest: copyable now, push/email later.

import { getDaily, dataMode } from "./dataSource";
import { evaluateContracts, money } from "./insights";
import { stats as decisionStats } from "./decisions";
import { recommendations } from "./recommend";
import { sentinel } from "./sentinel";
import { goalPace } from "./goals";
import { displayName, getPersona } from "./persona";

const strip = (html: string) => html.replace(/<[^>]+>/g, "");

export async function composeWeekReview(): Promise<string> {
  const { dates, revenue } = await getDaily();
  const lines: string[] = [];
  const persona = getPersona();
  lines.push(`◆ COUNSEL — week in review`);
  lines.push(`${displayName()}${persona ? ` · ${persona.label}` : ""}`);
  lines.push("");

  // ---- what happened: last complete week vs prior ----
  if (dates.length >= 14) {
    const rows = dates.map((d, i) => ({ d, rev: revenue[i] }));
    const last = new Date(rows[rows.length - 1].d + "T00:00:00");
    const weekStart = new Date(last); weekStart.setDate(weekStart.getDate() - last.getDay()); // this week's Sunday
    const w1s = new Date(weekStart); w1s.setDate(w1s.getDate() - 7);   // last complete week
    const w0s = new Date(weekStart); w0s.setDate(w0s.getDate() - 14);  // the week before
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    const sumIn = (a: string, b: string) => rows.filter((r) => r.d >= a && r.d < b).reduce((s, r) => s + r.rev, 0);
    const wk1 = sumIn(iso(w1s), iso(weekStart));
    const wk0 = sumIn(iso(w0s), iso(w1s));
    const d = wk0 > 0 ? ((wk1 - wk0) / wk0) * 100 : null;
    lines.push(`THE WEEK: ${money(wk1)}${d !== null ? ` (${d >= 0 ? "+" : ""}${d.toFixed(0)}% vs the week before)` : ""}.`);
  } else {
    lines.push(`THE WEEK: still building history (${dates.length} days so far).`);
  }

  // ---- goal pace ----
  try {
    const g = await goalPace();
    if (g.ok) lines.push(`GOAL: ${strip(g.headline)}`);
  } catch { /* no goal — silence */ }
  lines.push("");

  // ---- what held ----
  try {
    const s = await sentinel();
    lines.push(`SENTINEL: ${strip(s.headline)}`);
  } catch { /* warming */ }
  try {
    const fired = (await evaluateContracts()).filter((c) => c.fired);
    lines.push(fired.length
      ? `WATCHLIST: ${fired.map((f) => f.statusLine).join(" · ")}`
      : `WATCHLIST: quiet all week — nothing structurally changed.`);
  } catch { /* thin */ }
  lines.push("");

  // ---- the decision loop ----
  const d = decisionStats();
  const loopBits: string[] = [];
  if (d.overdue > 0) loopBits.push(`${d.overdue} decision${d.overdue === 1 ? "" : "s"} past the judgment window — grade them`);
  if (d.open > 0) loopBits.push(`${d.open} in flight${d.atStake > 0 ? ` (${money(d.atStake)}/mo at stake)` : ""}`);
  if (d.heldRate !== null) loopBits.push(`track record ${Math.round(d.heldRate * 100)}% held`);
  lines.push(`DECISIONS: ${loopBits.length ? loopBits.join(" · ") : "board is clear."}`);

  // ---- next week's one thing ----
  try {
    const recs = await recommendations();
    const top = [...recs].sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))[0];
    if (top) {
      lines.push("");
      lines.push(`ONE THING NEXT WEEK: ${top.action}${top.impact != null ? ` (~${money(top.impact)}/mo at stake)` : ""} — ${top.expected}`);
    }
  } catch { /* nothing earned */ }

  lines.push("");
  lines.push(dataMode() === "live"
    ? `— computed on-device from your data · every claim has a receipt in the app`
    : `— demo ledger · every claim has a receipt in the app`);
  return lines.join("\n");
}
