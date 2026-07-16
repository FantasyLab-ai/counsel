// The Decisions Tracker — advice → action → outcome, managed like a real
// project board. Counsel grades its own recommendations against what
// actually happened; you can also add, advance, grade and drop decisions
// yourself. No other advisor, human or AI, shows you its batting average.
//
// Statuses (the board columns):
//   considering -> testing -> grading -> graded
//
// Prototype storage: localStorage. PHASE 2: server-side with automatic
// grading when the outcome window closes (Aurora has the
// recommendations/outcome plumbing on desktop already).

export type DecisionStatus = "considering" | "testing" | "grading" | "graded";
export type Verdict = "held" | "mixed" | "missed";

export interface Decision {
  id: string;
  loggedAt: string; // ISO date
  action: string;
  expected: string;
  gradeAt: string; // ISO date the outcome window closes
  status: DecisionStatus;
  note?: string;
  grade?: { verdict: Verdict; note: string };
}

const KEY = "counsel.decisions";

const SEED: Decision[] = [
  {
    id: "seed-price",
    loggedAt: "2026-02-01",
    action: "Kept the February price increase (+6% on mugs)",
    expected: "revenue holds or grows despite fewer units",
    gradeAt: "2026-03-03",
    status: "graded",
    grade: {
      verdict: "held",
      note: "Revenue +9% over the window with volume −3% — the increase paid for itself. (Before/after significance; season not fully separable.)",
    },
  },
  {
    id: "seed-restock",
    loggedAt: "2026-03-10",
    action: "Expedited the Sunset Mug restock (+$120 rush fee)",
    expected: "recover ≥ half of the ~$300/day stockout drag",
    gradeAt: "2026-04-09",
    status: "grading",
  },
];

function readMine(): Decision[] {
  try {
    const raw = localStorage.getItem(KEY);
    const mine: Decision[] = raw ? JSON.parse(raw) : [];
    // migrate v1 entries (no status field)
    return mine.map((d) => ({ ...d, status: d.status ?? (d.grade ? "graded" : "grading") }));
  } catch {
    return [];
  }
}

function writeMine(mine: Decision[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(mine));
  } catch {
    /* prototype storage only */
  }
}

/** All decisions, yours first, seed examples last (seed is read-only-ish but
 * fully manageable once touched — it gets copied into your store). */
export function listDecisions(): Decision[] {
  const mine = readMine();
  const mineIds = new Set(mine.map((d) => d.id));
  return [...mine, ...SEED.filter((s) => !mineIds.has(s.id))];
}

export function addDecision(action: string, expected: string, gradeInDays = 30, status: DecisionStatus = "testing"): Decision {
  const now = new Date();
  const d: Decision = {
    id: `d-${now.getTime()}`,
    loggedAt: now.toISOString().slice(0, 10),
    action: action.trim().slice(0, 140),
    expected: (expected.trim() || "outcome to be judged against the numbers").slice(0, 200),
    gradeAt: new Date(now.getTime() + gradeInDays * 86400000).toISOString().slice(0, 10),
    status,
  };
  writeMine([d, ...readMine()]);
  return d;
}

/** Back-compat for the Plan scenario cards. */
export function logDecision(action: string, expected: string): Decision {
  return addDecision(action, expected, 30, "testing");
}

function upsert(d: Decision): void {
  const mine = readMine();
  const idx = mine.findIndex((m) => m.id === d.id);
  if (idx >= 0) mine[idx] = d;
  else mine.unshift(d); // touching a seed copies it into your store
  writeMine(mine);
}

export function setStatus(id: string, status: DecisionStatus): void {
  const d = listDecisions().find((x) => x.id === id);
  if (d) upsert({ ...d, status });
}

export function gradeDecision(id: string, verdict: Verdict, note: string): void {
  const d = listDecisions().find((x) => x.id === id);
  if (d) upsert({ ...d, status: "graded", grade: { verdict, note: note.trim().slice(0, 300) } });
}

export function deleteDecision(id: string): void {
  writeMine(readMine().filter((m) => m.id !== id));
  // deleting a seed: tombstone it by writing a hidden marker
  if (SEED.some((s) => s.id === id)) {
    const mine = readMine();
    mine.push({ id, loggedAt: "", action: "", expected: "", gradeAt: "", status: "graded", note: "__deleted__" });
    writeMine(mine);
  }
}

/** Board view: grouped + ordered for the tracker screen. */
export function board(): Record<DecisionStatus, Decision[]> {
  const all = listDecisions().filter((d) => d.note !== "__deleted__" && d.action);
  const by = (s: DecisionStatus) =>
    all.filter((d) => d.status === s).sort((a, b) => (a.gradeAt < b.gradeAt ? -1 : 1));
  return { considering: by("considering"), testing: by("testing"), grading: by("grading"), graded: by("graded") };
}

export function stats(): { open: number; graded: number; held: number; heldRate: number | null } {
  const all = listDecisions().filter((d) => d.note !== "__deleted__" && d.action);
  const graded = all.filter((d) => d.status === "graded" && d.grade);
  const held = graded.filter((d) => d.grade!.verdict === "held").length;
  return {
    open: all.length - graded.length,
    graded: graded.length,
    held,
    heldRate: graded.length ? held / graded.length : null,
  };
}
