// ---------------------------------------------------------------------------
// The Narrator — Part B of the Counsel Local architecture.
//
// The narration job is deliberately narrow: the model NEVER computes or
// reasons about numbers. aurora-core already produced the finding, the
// confidence and the citation — narration only phrases it.
//
// Two tiers, detected at runtime:
//   1. Bounded templates (always available, deterministic, honest) — the
//      baseline narrator. Every phrasing is written by us; the numbers are
//      interpolated, never generated.
//   2. The device's own OS model, when one exists. On the web that's
//      Chrome's built-in Prompt API (Gemini Nano, window.LanguageModel); in
//      the native apps it's Apple Foundation Models / ML Kit GenAI. The
//      model receives the ALREADY-COMPUTED finding and may only rephrase it
//      into Counsel's voice; output is length-capped and discarded if it
//      contains numbers that differ from the computed ones.
// ---------------------------------------------------------------------------

export interface BreakFinding {
  kind: "break";
  dateLabel: string; // "March 6"
  beforePerDay: string; // "$4,278"
  afterPerDay: string; // "$3,066"
  pctText: string; // "-28%"
  pPlain: string; // "less than a 1-in-1,000 chance this is noise"
}
export interface ForecastFinding {
  kind: "forecast";
  loLabel: string; // "$92k"
  hiLabel: string; // "$153k"
  horizonLabel: string; // "next 30 days"
}
export type Finding = BreakFinding | ForecastFinding;

export interface Narration {
  text: string;
  narrator: "template" | "gemini-nano";
  onDevice: true; // by construction — there is no cloud path in this module
}

// --- tier 1: bounded templates ----------------------------------------------
function template(f: Finding): string {
  switch (f.kind) {
    case "break":
      return (
        `Your revenue structurally changed on ${f.dateLabel} — from about ` +
        `${f.beforePerDay}/day to ${f.afterPerDay}/day (${f.pctText}). ` +
        `That's a real break, not a slow week: ${f.pPlain}.`
      );
    case "forecast":
      return (
        `For the ${f.horizonLabel}, I'd plan between ${f.loLabel} and ${f.hiLabel}. ` +
        `The range is honest — a single number would be a guess dressed up as a fact.`
      );
  }
}

// --- tier 2: the device's own model (web: Chrome Prompt API / Gemini Nano) ---
interface WebLM {
  create(opts?: unknown): Promise<{
    prompt(text: string): Promise<string>;
    destroy?: () => void;
  }>;
  availability?: () => Promise<string>;
}

function webModel(): WebLM | null {
  const g = globalThis as Record<string, unknown>;
  return (g.LanguageModel as WebLM) || null;
}

export async function osModelAvailable(): Promise<boolean> {
  try {
    const lm = webModel();
    if (!lm) return false;
    if (lm.availability) {
      const a = await lm.availability();
      return a === "available" || a === "readily";
    }
    return true;
  } catch {
    return false;
  }
}

/** Numbers the model must preserve verbatim — otherwise we discard its output. */
function guardNumbers(f: Finding): string[] {
  return f.kind === "break"
    ? [f.beforePerDay, f.afterPerDay]
    : [f.loLabel, f.hiLabel];
}

async function rephraseOnDevice(f: Finding, base: string): Promise<string | null> {
  try {
    const lm = webModel();
    if (!lm) return null;
    const session = await lm.create();
    const out = await Promise.race([
      session.prompt(
        "Rephrase this financial finding in one or two warm, plain-English sentences. " +
          "Keep EVERY number and date exactly as written. Do not add advice or new facts.\n\n" +
          base,
      ),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]);
    session.destroy?.();
    const text = String(out).trim().slice(0, 400);
    // Bounded: if the model dropped or altered a guarded number, refuse it.
    if (!text || !guardNumbers(f).every((n) => text.includes(n))) return null;
    return text;
  } catch {
    return null;
  }
}

/** Narrate a computed finding. Always resolves; always on-device. */
export async function narrate(f: Finding): Promise<Narration> {
  const base = template(f);
  if (await osModelAvailable()) {
    const better = await rephraseOnDevice(f, base);
    if (better) return { text: better, narrator: "gemini-nano", onDevice: true };
  }
  return { text: base, narrator: "template", onDevice: true };
}
