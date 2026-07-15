// ---------------------------------------------------------------------------
// Counsel API seam — THE contract between the UI and the brain.
//
// Every screen consumes ONLY this module. In Phase 1 it returns mock data
// (src/api/mockData.ts). In Phase 2 the real Counsel backend — a thin service
// wrapping the EXISTING Python Aurora engine — implements these exact
// functions and types. In Phase 3 an on-device Rust Aurora Core implements
// them again. The UI never knows or cares which brain answered.
//
// Non-negotiable: every insight/metric carries provenance (confidence +
// citation). That's the product. The type system enforces the glass box.
// ---------------------------------------------------------------------------

export type Confidence = "high" | "moderate" | "insufficient" | "forecast";

export interface Citation {
  method: string; // e.g. "Bayesian change-point test"
  source: string; // e.g. "your Stripe payouts"
  reference?: string; // e.g. "Adams & MacKay, 2007"
}

export type VizKind =
  | "breakline" // change-point spark: before / brass break / after
  | "band" // normal-range band with a "now" marker
  | "arithmetic" // transparent calculation block
  | "attribution" // horizontal share bars (with honest unknown)
  | "trend" // few-period bar trend
  | "fan" // forecast fan: history → now → range
  | "cushion"; // affordability floor vs monthly bars

export interface BreaklineViz {
  kind: "breakline";
  before: number[];
  after: number[];
  beforeLabel: string;
  afterLabel: string;
}
export interface BandViz {
  kind: "band";
  rangeLabel: string; // "your normal range · 32–36%"
  nowLabel: string; // "now 34%"
  nowPosPct: number; // 0..100 across the band
}
export interface ArithmeticViz {
  kind: "arithmetic";
  lines: { text: string; op?: string; kind?: "normal" | "result" | "warn" }[];
}
export interface AttributionViz {
  kind: "attribution";
  bars: { name: string; pct: number; unknown?: boolean }[];
}
export interface TrendViz {
  kind: "trend";
  points: { label: string; value: string; heightPct: number }[];
}
export interface FanViz {
  kind: "fan";
  history: number[];
  mid: number[];
  hi: number[];
  lo: number[];
  hiLabel: string;
  loLabel: string;
}
export interface CushionViz {
  kind: "cushion";
  floorLabel: string;
  bars: { label: string; heightPct: number; tight?: boolean }[];
}
export type Viz =
  | BreaklineViz
  | BandViz
  | ArithmeticViz
  | AttributionViz
  | TrendViz
  | FanViz
  | CushionViz;

export interface MathBlock {
  methodPlain: string; // "I compared the 20 days before March 4 with…"
  keyStatPlain: string; // "Less than a 1-in-100 chance this is noise."
  keyStatNotation: string; // "p < 0.01 · Bayesian change-point test · 41 days"
  extraPlain?: string; // optional second plain-English line
  viz?: Viz;
  citation: Citation;
}

export interface Insight {
  id: string;
  source?: string; // "Payments · change-point"
  headline: string; // plain-English, advisor voice (may contain <b>)
  detail?: string;
  confidence: Confidence;
  confidenceLabel?: string; // "High confidence" / "Likely a factor"
  citationChip?: string; // "p<0.01" / "SKU share"
  math?: MathBlock;
}

export interface Metric {
  id: string;
  label: string;
  value: string;
  delta?: { text: string; dir: "up" | "down" | "flat" };
  meaning: string; // plain-English read (may contain <b>)
  confidence: Confidence;
  confidenceLabel: string;
  wide?: boolean;
  spark?: BreaklineViz; // dashboard sparkline (revenue)
  math?: MathBlock;
}

export interface Source {
  id: string;
  name: string;
  role: string; // "Payments & payouts"
  status: "ok" | "syncing" | "error";
  syncedLabel: string; // "synced 2m ago"
}

export interface VoiceState {
  eyebrow: string; // "Right now"
  headline: string; // serif; segments in <em> render italic brass
  sub: string;
  micro: { label: string; value: string; tone: "hi" | "mod" | "none" }[];
}

export interface WatchItem {
  id: string;
  pillLabel: string; // "Sunday" / "2 of 4"
  text: string; // may contain <b>
}

export interface Brief {
  greeting: { date: string; business: string };
  state: VoiceState;
  attention: Insight[];
  watching: WatchItem[];
  sources: Source[];
}

export interface AskAnswer extends Insight {
  checked: string[]; // "what I checked" chips
  verdict: string; // serif lead; <em> allowed
  body: string; // may contain <b> and \n\n
  honestNote?: string; // the "range, not a promise" note
  followups: string[];
}

export type Period = "month" | "lastMonth" | "quarter";

// ---------------------------------------------------------------------------
// The interface. PHASE 2: replace the mock import with real calls to the
// Counsel backend (which wraps Aurora). Types must remain identical.
// ---------------------------------------------------------------------------
import * as mock from "./mockData";

export function getBrief(): Promise<Brief> {
  // TODO(PHASE 2): GET /api/brief from the Counsel backend (Aurora findings
  // mapped into Insight[]). Mock for now.
  return mock.brief();
}

export function getMetrics(period: Period): Promise<Metric[]> {
  // TODO(PHASE 2): GET /api/metrics?period=… — each Metric.math comes from a
  // real Aurora method run (change-point, band, arithmetic, attribution, trend).
  return mock.metrics(period);
}

export function ask(question: string): Promise<AskAnswer> {
  // TODO(PHASE 2): POST /api/ask — Aurora computes; an LLM only narrates the
  // cited result. Falls back to an HONEST "not enough data" — never a guess.
  return mock.ask(question);
}

export function getSeededAsk(): Promise<AskAnswer[]> {
  // The two canned exchanges shown in the Ask thread (prototype only).
  return mock.seededAsk();
}

export function getConnections(): Promise<Source[]> {
  // TODO(PHASE 2): real connection status from OAuth-backed integrations.
  return mock.connections();
}
