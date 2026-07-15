// PHASE 2: replace with real calls to the Counsel backend, which wraps Aurora.
// Types must remain identical. All copy here is the product voice — ported
// from the approved mockups, not generated filler.

import type {
  AskAnswer,
  Brief,
  Metric,
  Period,
  Source,
} from "./counsel";

// Small helper so the prototype still *feels* like it computed something.
const delay = <T,>(v: T, ms = 220): Promise<T> =>
  new Promise((res) => setTimeout(() => res(v), ms));

const SOURCES: Source[] = [
  { id: "stripe", name: "Stripe", role: "Payments & payouts", status: "ok", syncedLabel: "synced 2m ago" },
  { id: "shopify", name: "Shopify", role: "Orders & inventory", status: "ok", syncedLabel: "synced 5m ago" },
  { id: "instagram", name: "Instagram", role: "New-customer sources", status: "ok", syncedLabel: "connected" },
];

export function brief(): Promise<Brief> {
  return delay({
    greeting: { date: "Tuesday, March 11", business: "Kiln & Co." },
    state: {
      eyebrow: "Right now",
      headline: "A steady month — with <em>one real dent.</em>",
      sub: "Margins and cash are healthy. The only thing off is revenue, and I know exactly when it started.",
      micro: [
        { label: "Revenue", value: "Soft", tone: "mod" },
        { label: "Margin", value: "Held", tone: "hi" },
        { label: "Cash", value: "Healthy", tone: "hi" },
      ],
    },
    attention: [
      {
        id: "att-1",
        source: "Payments · change-point",
        headline: "Revenue <b>structurally dropped March 4</b> — a real break, not a slow week.",
        confidence: "high",
        confidenceLabel: "High confidence",
        citationChip: "p<0.01",
      },
      {
        id: "att-2",
        source: "Inventory · Shopify",
        headline: "<b>Sunset Mug</b> out of stock 6 days — it was 18% of March sales.",
        confidence: "moderate",
        confidenceLabel: "Likely a factor",
        citationChip: "SKU share",
      },
    ],
    watching: [
      {
        id: "w-1",
        pillLabel: "Sunday",
        text: "<b>Spring15 discount.</b> Need a few more days before the verdict is real.",
      },
      {
        id: "w-2",
        pillLabel: "2 of 4",
        text: "<b>Weekend staffing test.</b> Two weekends in — too early to trust it.",
      },
    ],
    sources: SOURCES,
  });
}

// The five metrics — each math block a DIFFERENT shape, per the design.
const METRICS: Metric[] = [
  {
    id: "revenue",
    label: "Revenue · month to date",
    value: "$61,200",
    delta: { text: "▾ 12% vs Feb", dir: "down" },
    meaning: "<b>The March 4 break is the whole story.</b> Before it, you were running ahead of February.",
    confidence: "high",
    confidenceLabel: "High",
    wide: true,
    spark: {
      kind: "breakline",
      before: [15, 12, 17, 11, 15, 13],
      after: [26, 29, 27, 31, 29],
      beforeLabel: "~$4,200/day",
      afterLabel: "~$2,850/day",
    },
    math: {
      methodPlain:
        "I compared the <b>20 days before</b> March 4 with the <b>21 days after</b>, and tested whether the drop is bigger than your normal day-to-day swings. <span class='k'>It is — clearly.</span>",
      keyStatPlain: "Less than a <em>1-in-100 chance</em> this drop is just random noise.",
      keyStatNotation: "p < 0.01 · Bayesian change-point test · 41 days",
      extraPlain:
        "Best estimate: <b>−32%</b>, about <b>−$1,350/day</b>. I'm 95% confident the true drop sits between <b>$1,050</b> and <b>$1,650</b> a day.",
      viz: {
        kind: "breakline",
        before: [28, 22, 30, 20, 28, 26],
        after: [46, 54, 49, 55, 52],
        beforeLabel: "~$4,200/day",
        afterLabel: "~$2,850/day",
      },
      citation: {
        method: "Adams & MacKay, 2007",
        source: "your Stripe payouts",
      },
    },
  },
  {
    id: "margin",
    label: "Gross margin",
    value: "34%",
    delta: { text: "— flat", dir: "flat" },
    meaning: "<b>Healthy and steady</b> for handmade goods. No meaningful change — costs didn't creep.",
    confidence: "high",
    confidenceLabel: "High",
    math: {
      methodPlain:
        "I track your rolling margin and its <b>normal swing</b>. This month lands right inside that band, so “flat” isn't a guess — it's within the noise.",
      keyStatPlain: "Sitting <em>dead center</em> of your normal range.",
      keyStatNotation: "within ±1 std dev of 6-mo mean · no change flagged",
      viz: {
        kind: "band",
        rangeLabel: "your normal range · 32–36%",
        nowLabel: "now 34%",
        nowPosPct: 50,
      },
      citation: {
        method: "rolling normal-range test",
        source: "your cost & revenue ledger · trailing 6 months",
      },
    },
  },
  {
    id: "runway",
    label: "Cash runway",
    value: "7 mo",
    delta: { text: "$48,300 on hand", dir: "flat" },
    meaning: "<b>Comfortable.</b> Even a rough month wouldn't put you in danger.",
    confidence: "high",
    confidenceLabel: "High",
    math: {
      methodPlain: "No black box here — it's just your cash divided by what you actually burn each month:",
      keyStatPlain: "Even your <em>worst recent month</em> still leaves ~5.5 months.",
      keyStatNotation: "stress-tested against your highest-burn month (Feb)",
      viz: {
        kind: "arithmetic",
        lines: [
          { text: "$48,300", op: "cash" },
          { text: "÷ $6,900", op: "avg net burn / mo" },
          { text: "≈ 7.0 months", kind: "result" },
        ],
      },
      citation: {
        method: "transparent arithmetic",
        source: "6-month cash flow · Stripe + bank",
      },
    },
  },
  {
    id: "customers",
    label: "New customers · March",
    value: "214",
    delta: { text: "▴ 8%", dir: "up" },
    meaning:
      "<b>Instagram is pulling its weight</b> — your strongest channel right now. Worth leaning into while revenue's soft.",
    confidence: "moderate",
    confidenceLabel: "Moderate",
    wide: true,
    math: {
      methodPlain:
        "Where each new buyer <b>first arrived from</b>. I'm honest about the gap: some traffic has no clear source, so this is <span class='k'>moderate, not high</span>.",
      keyStatPlain: "Confident on Instagram — <em>less sure</em> on the 12% I can't trace.",
      keyStatNotation: "first-touch attribution · 12% unattributed",
      viz: {
        kind: "attribution",
        bars: [
          { name: "Instagram", pct: 41 },
          { name: "Direct", pct: 29 },
          { name: "Referral", pct: 18 },
          { name: "Unknown", pct: 12, unknown: true },
        ],
      },
      citation: {
        method: "first-touch attribution",
        source: "UTM tags + referrers · Shopify + Instagram",
      },
    },
  },
  {
    id: "repeat",
    label: "Repeat purchase rate",
    value: "38%",
    delta: { text: "▴ from 31%", dir: "up" },
    meaning: "<b>Your regulars are coming back more.</b> This is a real three-month climb, not a one-month blip.",
    confidence: "high",
    confidenceLabel: "High",
    math: {
      methodPlain:
        "Share of each month's buyers who'd <b>bought from you before</b>. Three months, all pointing up — that's what makes it a trend I'll stand behind.",
      keyStatPlain: "Up <em>every month</em> for three straight — a genuine trend.",
      keyStatNotation: "monotonic increase · +7 pts since January",
      viz: {
        kind: "trend",
        points: [
          { label: "JAN", value: "31%", heightPct: 52 },
          { label: "FEB", value: "35%", heightPct: 70 },
          { label: "MAR", value: "38%", heightPct: 84 },
        ],
      },
      citation: {
        method: "cohort repeat-rate",
        source: "your customer order history · Shopify",
      },
    },
  },
];

export function metrics(_period: Period): Promise<Metric[]> {
  // Period switching is visual-only in the prototype; PHASE 2 recomputes.
  return delay(METRICS, 340);
}

// ---- Ask ------------------------------------------------------------------

const HIRE_ANSWER: AskAnswer = {
  id: "ask-hire",
  headline: "Probably — with one caveat.",
  verdict: "Probably — <em>with one caveat.</em>",
  checked: ["3-mo profit", "revenue variance", "◆ Stripe"],
  body:
    "Your last 3 months averaged <b>$3,050/mo</b> in profit after costs. A $1,400 hire leaves about <b>$1,650</b> of cushion.\n\nThe caveat: your revenue swings <b>±30%</b> month to month. In a slow month like last February, that cushion gets thin — affordable on average, tight on a bad month.",
  confidence: "moderate",
  confidenceLabel: "Moderate confidence",
  citationChip: "3 mo · high variance",
  math: {
    methodPlain: "",
    keyStatPlain: "",
    keyStatNotation: "",
    viz: {
      kind: "arithmetic",
      lines: [
        { text: "$3,050", op: "avg monthly profit" },
        { text: "− $1,400", op: "hire" },
        { text: "= $1,650 cushion", kind: "result" },
        { text: "worst month (Feb):", op: "" },
        { text: "$2,050 − $1,400 = $650 cushion", kind: "warn" },
      ],
    },
    citation: { method: "transparent arithmetic", source: "3-month P&L · Stripe" },
  },
  followups: ["What if revenue drops 20%?", "Best month to start?"],
};

const FORECAST_ANSWER: AskAnswer = {
  id: "ask-forecast",
  headline: "It should recover — a range, not a promise.",
  verdict: "It should recover — but I'll give you a <em>range, not a promise.</em>",
  checked: ["trend since Mar 4", "restock date", "◆ Shopify"],
  body:
    "If the Sunset Mug restocks on schedule (~<b>Mar 16</b>), my best estimate is April lands between <b>$58k and $67k</b>.\n\nThe range is wide on purpose. One product and one ended promo drove the dip — I can't perfectly predict either, so I won't pretend to.",
  honestNote: "This is a projection, not a guarantee. I'd rather show you the range than fake a single number.",
  confidence: "forecast",
  confidenceLabel: "Forecast · honest range",
  citationChip: "ensemble · 95% band",
  math: {
    methodPlain: "",
    keyStatPlain: "",
    keyStatNotation: "",
    viz: {
      kind: "fan",
      history: [30, 26, 54, 60, 58],
      mid: [58, 50, 44],
      hi: [58, 42, 28],
      lo: [58, 58, 60],
      hiLabel: "$67k",
      loLabel: "$58k",
    },
    citation: { method: "ensemble forecast · 95% band", source: "Stripe + Shopify" },
  },
  followups: ["What raises the low end?", "Remind me if it slips"],
};

const HONEST_FALLBACK: AskAnswer = {
  id: "ask-fallback",
  headline: "I don't have enough data to answer that honestly.",
  verdict: "I can't answer that <em>honestly yet.</em>",
  checked: ["your connected sources"],
  body:
    "That question needs data I don't have yet — or more history than you've connected. I'd rather tell you that than invent a confident-sounding answer.\n\nConnect more history (or ask me something about revenue, margin, cash, customers, or hiring) and I'll answer with the math shown.",
  confidence: "insufficient",
  confidenceLabel: "Not enough data",
  citationChip: "honesty · core",
  followups: ["What can you answer today?", "Connect another source"],
};

export function seededAsk(): Promise<AskAnswer[]> {
  return delay([HIRE_ANSWER, FORECAST_ANSWER], 120);
}

export function ask(question: string): Promise<AskAnswer> {
  const q = question.toLowerCase();
  if (q.includes("hire") || q.includes("afford")) return delay(HIRE_ANSWER, 900);
  if (q.includes("bounce") || q.includes("next month") || q.includes("forecast"))
    return delay(FORECAST_ANSWER, 1100);
  return delay(HONEST_FALLBACK, 800);
}

export function connections(): Promise<Source[]> {
  return delay(SOURCES, 150);
}
