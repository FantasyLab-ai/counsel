// ---------------------------------------------------------------------------
// The Router — Part C of the Counsel Local architecture.
//
// Sits between the UI and the model layer and decides, PER REQUEST, where it
// runs. This is what makes the product both private and smart:
//
//   narration of a computed finding      -> on-device, always
//   Ask that maps to a known analysis    -> on-device (math + bounded narrator)
//   Ask that needs open-ended reasoning  -> cloud — but ONLY a derived,
//                                           non-identifying summary crosses
//                                           the line, and the user sees
//                                           exactly what would be sent first.
//   "Keep analysis on this device" ON    -> cloud disabled entirely; open-
//                                           ended Ask degrades HONESTLY.
//
// The privacy boundary is enforced here, in one place, by construction:
// the only thing the cloud path can carry is a DerivedSummary — a handful of
// aggregate figures. Raw rows never enter this module's types at all.
// ---------------------------------------------------------------------------

export type TaskType = "narrate" | "ask-known" | "ask-open";
export type RunWhere = "device" | "cloud" | "device-limited";

/** The ONLY payload shape allowed to leave the device. Aggregates, no rows. */
export interface DerivedSummary {
  figures: { label: string; value: string }[];
  question: string;
}

export interface RouteDecision {
  task: TaskType;
  runWhere: RunWhere;
  reason: string; // plain-English, shown in the UI
  disclosure?: DerivedSummary; // present iff runWhere === "cloud"
}

// --- user privacy preference (Settings toggle) ------------------------------
const KEY = "counsel.onDeviceOnly";
let onDeviceOnly = false;
try {
  onDeviceOnly = localStorage.getItem(KEY) === "1";
} catch {
  /* storage unavailable — default stays false */
}
const listeners = new Set<(v: boolean) => void>();

export function getOnDeviceOnly(): boolean {
  return onDeviceOnly;
}
export function setOnDeviceOnly(v: boolean): void {
  onDeviceOnly = v;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* fine — preference just won't persist */
  }
  listeners.forEach((fn) => fn(v));
}
export function onPrivacyChange(fn: (v: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// --- question classification -------------------------------------------------
// "Known analysis" = the question maps onto math Aurora already runs locally
// (affordability arithmetic, forecast bands, change-point, margins, runway…).
// Everything else is open-ended reasoning. Phase 2 upgrades this to a real
// intent classifier; the ROUTING CONTRACT stays identical.
const KNOWN_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(hire|hiring|afford|helper|payroll)\b/i, label: "affordability arithmetic" },
  { re: /\b(bounce|recover|next month|forecast|project)\b/i, label: "forecast with bands" },
  { re: /\b(slow(est)? day|best day|weekday|weekend)\b/i, label: "seasonality profile" },
  { re: /\b(margin|profit(ability)?)\b/i, label: "margin band check" },
  { re: /\b(cash|runway)\b/i, label: "runway arithmetic" },
  // Deliberately specific: "what changed / what happened / revenue drop" is a
  // change-point question; "should I change my pricing?" is open-ended
  // strategy and must route to cloud (the brief's own canonical example).
  { re: /\b(what (changed|happened)|revenue (break|drop|dip)|sudden (drop|spike)|structural)\b/i, label: "change-point scan" },
];

export function classify(question: string): { task: TaskType; match?: string } {
  for (const k of KNOWN_PATTERNS) {
    if (k.re.test(question)) return { task: "ask-known", match: k.label };
  }
  return { task: "ask-open" };
}

// --- the derived summary (what a cloud call WOULD carry) ---------------------
// Built from the same aggregates the dashboard shows — nothing else exists in
// this module to send. In the native app this comes from aurora-core locally.
export function buildDerivedSummary(question: string): DerivedSummary {
  return {
    figures: [
      { label: "3-mo avg profit", value: "$3,050/mo" },
      { label: "revenue variance", value: "±30%" },
      { label: "gross margin", value: "34%" },
      { label: "cash runway", value: "7.0 months" },
      { label: "revenue break", value: "Mar 6 · −28%" },
    ],
    question,
  };
}

// --- the routing policy (the brief's table, verbatim) ------------------------
export function route(question: string): RouteDecision {
  const { task, match } = classify(question);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  if (task === "ask-known") {
    return {
      task,
      runWhere: "device",
      reason: `maps to a known analysis (${match}) — computed and narrated on this device`,
    };
  }

  // Open-ended reasoning.
  if (onDeviceOnly) {
    return {
      task,
      runWhere: "device-limited",
      reason:
        "open-ended question with “Keep analysis on this device” ON — cloud is disabled, so I'll answer with what local math supports",
    };
  }
  if (offline) {
    return {
      task,
      runWhere: "device-limited",
      reason: "you're offline — answering with what local math supports",
    };
  }
  return {
    task,
    runWhere: "cloud",
    reason: "open-ended reasoning — better answered by the cloud model",
    disclosure: buildDerivedSummary(question),
  };
}

/** Narration is ALWAYS on-device. Exposed for symmetry & the UI badge. */
export function routeNarration(): RouteDecision {
  return {
    task: "narrate",
    runWhere: "device",
    reason: "narration of a computed finding — always on-device",
  };
}
