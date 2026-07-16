// The Decisions Log — advice → outcome → track record. Counsel grades its
// own recommendations against what actually happened. No other advisor,
// human or AI, shows you its batting average; that's the point.
//
// Prototype storage: localStorage (non-load-bearing — losing it loses no
// analysis). PHASE 2: server-side, graded automatically by the engine when
// the outcome window closes (Aurora already has recommendations/outcome
// plumbing on desktop).

export interface Decision {
  id: string;
  loggedAt: string; // ISO date
  action: string; // "Hire part-time helper at $1,400/mo"
  expected: string; // "cushion ≥ $1,650/mo on average"
  gradeAt: string; // ISO date the window closes
  grade?: { verdict: "held" | "missed" | "mixed"; note: string };
}

const KEY = "counsel.decisions";

const SEED: Decision[] = [
  {
    id: "seed-price",
    loggedAt: "2026-02-01",
    action: "Kept the February price increase (+6% on mugs)",
    expected: "revenue holds or grows despite fewer units",
    gradeAt: "2026-03-03",
    grade: {
      verdict: "held",
      note: "Revenue +9% over the window with volume −3% — the increase paid for itself. (Before/after significance; season not fully separable.)",
    },
  },
];

export function listDecisions(): Decision[] {
  try {
    const raw = localStorage.getItem(KEY);
    const mine: Decision[] = raw ? JSON.parse(raw) : [];
    return [...mine, ...SEED];
  } catch {
    return SEED;
  }
}

export function logDecision(action: string, expected: string): Decision {
  const now = new Date();
  const grade = new Date(now.getTime() + 30 * 86400000);
  const d: Decision = {
    id: `d-${now.getTime()}`,
    loggedAt: now.toISOString().slice(0, 10),
    action,
    expected,
    gradeAt: grade.toISOString().slice(0, 10),
  };
  try {
    const raw = localStorage.getItem(KEY);
    const mine: Decision[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(KEY, JSON.stringify([d, ...mine]));
  } catch {
    /* prototype storage only */
  }
  return d;
}
