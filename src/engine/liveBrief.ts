// liveBrief.ts — Today & Numbers computed from YOUR data, on this device.
// This is the "live" branch of the api seam: when real data is present
// (synced or dropped in), the brief and metrics come from the same stores
// the engines use — no demo narrative, no fixture numbers. Where a figure
// needs data you haven't connected (expenses -> margin/runway), the metric
// says so honestly instead of borrowing the demo's.

import type { AskAnswer, Brief, Insight, Metric, Source, WatchItem } from "../api/counsel";
import { userCharges, userExpenses, userMeta } from "./dataSource";
import { displayName } from "./persona";
import { evaluateContracts, cashSentry, money } from "./insights";
import { stats as decisionStats } from "./decisions";
import { hasCloudAccount, cloudStatus } from "./cloudSync";

interface Window30 {
  days: number;           // distinct trading days in the data
  rev30: number;          // revenue, last 30 days
  revPrev30: number;      // revenue, the 30 before that
  tx30: number;           // transactions, last 30 days
  customers30: number;    // unique customers, last 30 days
  firstDate: string;
  lastDate: string;
}

function windows(): Window30 | null {
  const uc = userCharges();
  if (!uc || !uc.length) return null;
  const today = new Date();
  const dayMs = 86400000;
  const cut30 = new Date(today.getTime() - 30 * dayMs).toISOString().slice(0, 10);
  const cut60 = new Date(today.getTime() - 60 * dayMs).toISOString().slice(0, 10);
  let rev30 = 0, revPrev30 = 0, tx30 = 0;
  const cust = new Set<string>();
  const dates = new Set<string>();
  let firstDate = "9999", lastDate = "";
  for (const c of uc) {
    dates.add(c.date);
    if (c.date < firstDate) firstDate = c.date;
    if (c.date > lastDate) lastDate = c.date;
    const amt = c.qty * c.price;
    if (c.date >= cut30) {
      rev30 += amt;
      tx30++;
      cust.add(c.customer);
    } else if (c.date >= cut60) {
      revPrev30 += amt;
    }
  }
  return {
    days: dates.size,
    rev30: Math.round(rev30),
    revPrev30: Math.round(revPrev30),
    tx30,
    customers30: cust.size,
    firstDate,
    lastDate,
  };
}

export async function connections(): Promise<Source[]> {
  return liveSources();
}

/** Honest live Ask: no canned demo conversations. Known analyses compute
 * on-device; open-ended narration arrives with the hosted narrator. */
export async function ask(question: string): Promise<AskAnswer> {
  const w = windows()!;
  const hasExp = !!userExpenses();
  return {
    id: `live-ask-${Date.now()}`,
    headline: question,
    confidence: "moderate",
    confidenceLabel: "On-device",
    checked: [`${w.tx30} transactions (30d)`, `${w.days} trading days`, hasExp ? "expenses" : "no expenses yet"],
    verdict: `Here's what your data can answer <em>right now.</em>`,
    body:
      `Last 30 days: <b>${money(w.rev30)}</b> across <b>${w.tx30}</b> transactions from <b>${w.customers30}</b> customer${w.customers30 === 1 ? "" : "s"}.\n\n` +
      `For deep questions I route to the engines: price power, at-risk customers and restock math live in the <b>Insights Lab</b>; the banded cash view is in <b>Plan</b>. ` +
      (hasExp ? `` : `Margin and runway need your expenses — one CSV in Power Up unlocks them.\n\n`) +
      `Conversational answers over your live data arrive with the hosted narrator — until then I only claim what the math computed.`,
    honestNote: "I answer from computed results only — never from a guess.",
    followups: [],
  };
}

export async function seededAsk(): Promise<AskAnswer[]> {
  return []; // no canned demo conversations in a live business's app
}

async function liveSources(): Promise<Source[]> {
  const out: Source[] = [];
  if (hasCloudAccount()) {
    try {
      const s = await cloudStatus();
      for (const p of s.providers) {
        out.push({
          id: p,
          name: p[0].toUpperCase() + p.slice(1),
          role: "live sync · read-only",
          status: "ok",
          syncedLabel: userMeta()?.importedAt ? `synced ${userMeta()!.importedAt}` : "connected",
        });
      }
    } catch { /* offline is fine — sources are cosmetic */ }
  }
  const meta = userMeta();
  if (meta && !out.length) {
    out.push({ id: "file", name: meta.name, role: "on-device file", status: "ok", syncedLabel: `loaded ${meta.importedAt}` });
  }
  return out;
}

export async function brief(): Promise<Brief> {
  const w = windows()!;
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // ---- the read (honest trend, no model theater on thin data) ----
  const delta = w.revPrev30 > 0 ? (w.rev30 - w.revPrev30) / w.revPrev30 : null;
  const young = w.days < 14;
  const headline = young
    ? `I can see your sales — now I'm <em>building your history.</em>`
    : delta === null
      ? `Your first full month is <em>taking shape.</em>`
      : delta > 0.08
        ? `Trailing 30 days are <em>up ${(delta * 100).toFixed(0)}%</em> on the 30 before.`
        : delta < -0.08
          ? `Trailing 30 days are <em>down ${(-delta * 100).toFixed(0)}%</em> on the 30 before.`
          : `Trailing 30 days are <em>holding steady.</em>`;
  const sub = young
    ? `${w.days} trading day${w.days === 1 ? "" : "s"} so far (${w.tx30} transactions, ${money(w.rev30)}). ` +
      `The deep engines — change-points, price power, seasonality — earn their confidence around 8 weeks of history. I'll say so the moment they're ready.`
    : `${money(w.rev30)} across ${w.tx30} transactions in the last 30 days` +
      (delta !== null ? ` vs ${money(w.revPrev30)} the 30 before.` : ".") +
      ` Every figure below is computed on this device from your connected data.`;

  // ---- attention: real signals only ----
  const attention: Insight[] = [];
  try {
    const sentry = await cashSentry();
    if (sentry && !sentry.clears) {
      attention.push({
        id: "live-cash",
        source: "Cash sentry · banded forecast",
        headline: `My <b>low estimate</b> runs ${money(-sentry.marginOfSafety)} short of monthly outgoings — worth watching this week.`,
        confidence: "moderate",
        confidenceLabel: "Banded forecast",
        citationChip: "AR(1) · 95% band",
      });
    }
  } catch { /* sentry needs more days — fine */ }
  try {
    const fired = (await evaluateContracts()).filter((c) => c.fired);
    for (const f of fired.slice(0, 2)) {
      attention.push({
        id: `live-${f.id}`,
        source: "Watchlist · Sentinel",
        headline: `<b>${f.title}:</b> ${f.statusLine}`,
        confidence: "high",
        confidenceLabel: "Structural change",
        citationChip: "sentinel contract",
      });
    }
  } catch { /* contracts need history */ }
  const d = decisionStats();
  if (d.overdue > 0) {
    attention.push({
      id: "live-grade",
      source: "Decisions · the track record",
      headline: `<b>${d.overdue} decision${d.overdue === 1 ? "" : "s"}</b> past the judgment window — grade ${d.overdue === 1 ? "it" : "them"} against the numbers.`,
      confidence: "high",
      confidenceLabel: "Your own tracker",
      citationChip: "decisions board",
    });
  }
  if (!attention.length) {
    attention.push({
      id: "live-quiet",
      source: "All engines",
      headline: `Nothing needs you today — sales are flowing and no watchlist contract has fired. <b>Quiet is a finding.</b>`,
      confidence: "high",
      confidenceLabel: "Checked, not guessed",
      citationChip: `${w.tx30} transactions read`,
    });
  }

  // ---- watching: what's warming up ----
  const watching: WatchItem[] = [];
  if (w.days < 56) {
    watching.push({
      id: "w-history",
      pillLabel: `${w.days}d`,
      text: `<b>History building:</b> ${w.days} of ~56 trading days before change-point detection speaks with confidence.`,
    });
  }
  if (!userExpenses()) {
    watching.push({
      id: "w-expenses",
      pillLabel: "expenses",
      text: `<b>Margin, runway and the audit</b> unlock when expenses arrive — drop a bank/expense CSV in Power Up.`,
    });
  }

  return {
    greeting: { date: dateLabel, business: displayName() },
    state: {
      eyebrow: "Right now · your live data",
      headline,
      sub,
      micro: [
        { label: "30-day revenue", value: money(w.rev30), tone: "hi" },
        { label: "transactions", value: String(w.tx30), tone: "hi" },
        { label: "customers", value: String(w.customers30), tone: w.customers30 > 1 ? "hi" : "mod" },
      ],
    },
    attention: attention.slice(0, 3),
    watching,
    sources: await liveSources(),
  };
}

export async function metrics(): Promise<Metric[]> {
  const w = windows()!;
  const hasExp = !!userExpenses();
  const delta = w.revPrev30 > 0 ? (w.rev30 - w.revPrev30) / w.revPrev30 : null;

  const revenue: Metric = {
    id: "revenue",
    label: "Revenue · 30 days",
    value: money(w.rev30),
    ...(delta !== null
      ? { delta: { text: `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(0)}% vs prior 30`, dir: delta > 0.02 ? "up" : delta < -0.02 ? "down" : "flat" } }
      : {}),
    meaning: `Summed from <b>${w.tx30} transactions</b> in your connected data — arithmetic, not a model.`,
    confidence: "high",
    confidenceLabel: "Exact",
    wide: true,
    math: {
      methodPlain: `I summed qty × price across every transaction in the last 30 days of your connected data.`,
      keyStatPlain: `${w.tx30} transactions totalling ${money(w.rev30)} — an exact figure, not an estimate.`,
      keyStatNotation: `Σ(qty × price) · ${w.tx30} rows · 30-day window`,
      viz: {
        kind: "arithmetic",
        lines: [
          { text: `${w.tx30} transactions, last 30 days` },
          { text: `sum(qty × price) = ${money(w.rev30)}`, kind: "result" },
          ...(delta !== null ? [{ text: `prior 30 days: ${money(w.revPrev30)} (${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(0)}%)` }] : []),
        ],
      },
      citation: { method: "transparent arithmetic", source: "your connected data" },
    },
  };

  const customers: Metric = {
    id: "customers",
    label: "Customers · 30 days",
    value: String(w.customers30),
    meaning: w.customers30 <= 1
      ? `Your source reports most sales without a customer id — attribution sharpens when customer data flows.`
      : `Unique customer ids in the window; repeat behavior feeds the at-risk engine as history builds.`,
    confidence: w.customers30 <= 1 ? "insufficient" : "moderate",
    confidenceLabel: w.customers30 <= 1 ? "Limited ids" : "Counted",
    wide: true,
  };

  const margin: Metric = {
    id: "margin",
    label: "Gross margin",
    value: hasExp ? "computing" : "—",
    meaning: hasExp
      ? `Computed from your expense rows against revenue.`
      : `<b>Needs expenses.</b> Drop a bank or expense CSV in Power Up and margin computes for real — no borrowed number.`,
    confidence: hasExp ? "moderate" : "insufficient",
    confidenceLabel: hasExp ? "From your books" : "Awaiting expenses",
  };

  const runway: Metric = {
    id: "runway",
    label: "Cash runway",
    value: hasExp ? "computing" : "—",
    meaning: hasExp
      ? `Burn from your expense rows; banded, not promised.`
      : `<b>Needs expenses/bank data</b> for true burn. Until then I won't invent a runway.`,
    confidence: hasExp ? "moderate" : "insufficient",
    confidenceLabel: hasExp ? "From your books" : "Awaiting expenses",
  };

  return [revenue, customers, margin, runway];
}
