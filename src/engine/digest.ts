// digest.ts — the Morning Digest, composed from the same engines the screens
// use. Today it's a copyable artifact (paste into notes/texts/anywhere);
// when the hosted service lands it becomes the push/email — same composer,
// new delivery. (The Toast steal: the nightly digest is the habit loop.)

import { getBrief } from "../api/counsel";
import { cashSentry, money, BASELINE } from "./insights";
import { evaluateContracts } from "./insights";
import { stats as decisionStats } from "./decisions";
import { getPersona } from "./persona";

const strip = (html: string) => html.replace(/<[^>]+>/g, "");

export async function composeDigest(): Promise<string> {
  const [brief, sentry, contracts] = await Promise.all([
    getBrief(),
    cashSentry().catch(() => null),
    evaluateContracts().catch(() => [] as Awaited<ReturnType<typeof evaluateContracts>>),
  ]);
  const d = decisionStats();
  const persona = getPersona();
  const fired = contracts.filter((c) => c.fired);

  const lines: string[] = [];
  lines.push(`◆ COUNSEL — morning digest · ${brief.greeting.date}`);
  lines.push(`${brief.greeting.business}${persona ? ` · ${persona.label}` : ""}`);
  lines.push("");
  lines.push(`THE READ: ${strip(brief.state.headline)}`);
  lines.push(strip(brief.state.sub));
  lines.push("");
  if (brief.attention.length) {
    lines.push("NEEDS YOU:");
    brief.attention.forEach((a, i) =>
      lines.push(` ${i + 1}. ${strip(a.headline)} [${a.confidenceLabel ?? a.confidence}]`));
    lines.push("");
  }
  if (sentry) {
    lines.push(
      `CASH: next 30 days banded ${money(sentry.lo30)}–${money(sentry.hi30)}; low end ` +
      `${sentry.clears ? `clears bills with ${money(sentry.marginOfSafety)} to spare` : `runs ${money(-sentry.marginOfSafety)} short — watch it`}.`
    );
  }
  if (fired.length) {
    lines.push(`WATCHLIST: ${fired.map((f) => f.statusLine).join(" · ")}`);
  } else {
    lines.push("WATCHLIST: quiet — nothing structurally changed.");
  }
  if (d.open > 0) {
    lines.push(`DECISIONS: ${d.open} in flight${d.heldRate !== null ? ` · track record ${Math.round(d.heldRate * 100)}% held` : ""}.`);
  }
  lines.push("");
  lines.push(`— every number cited & banded · runway baseline ${(BASELINE.cash / BASELINE.burn).toFixed(1)} mo · counsel-demo.pages.dev`);
  return lines.join("\n");
}
