// The Weekly Board Meeting — a Sunday packet for businesses too small
// to have a board. Counsel Pro's flagship artifact.
//
// Composed entirely from engines that already ran (week review, the
// 14-day band, the decision tracker, the recommendation engine) — the
// board meeting invents nothing, it CHAIRS. Every number in the packet
// has a receipt on its home screen.

import { composeWeekReview } from "./weekReview";
import { money, revenueBand } from "./insights";
import { isOverdue, listDecisions } from "./decisions";
import { recommendations } from "./recommend";
import { displayName } from "./persona";

export async function composeBoardMeeting(): Promise<string> {
  const date = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const lines: string[] = [];
  const rule = "═".repeat(38);
  const thin = "─".repeat(38);

  lines.push(rule);
  lines.push("THE BOARD MEETING");
  lines.push(`${displayName()} · ${date}`);
  lines.push("prepared by Counsel · every number has a receipt");
  lines.push(rule, "");

  // 1 — the week that was (the review engine already writes this well)
  lines.push("I. THE WEEK THAT WAS");
  lines.push(thin);
  try {
    lines.push(await composeWeekReview());
  } catch {
    lines.push("(not enough history yet for a full week review)");
  }
  lines.push("");

  // 2 — open business: decisions awaiting the board
  lines.push("II. OPEN BUSINESS — the decision board");
  lines.push(thin);
  const decs = listDecisions();
  const due = decs.filter(isOverdue);
  const inFlight = decs.filter((d) => d.status === "testing" || d.status === "grading");
  if (!decs.length) {
    lines.push("No decisions on the board. When Counsel proposes a move or");
    lines.push("you track one, it appears here and gets graded honestly.");
  } else {
    if (due.length) {
      lines.push(`${due.length} decision${due.length > 1 ? "s" : ""} past the grading window — the board should call ${due.length > 1 ? "them" : "it"}:`);
      for (const d of due.slice(0, 3)) lines.push(`  · ${d.action} (expected: ${d.expected})`);
    }
    if (inFlight.length) {
      lines.push(`${inFlight.length} in flight, not yet judged.`);
    }
    const graded = decs.filter((d) => d.status === "graded");
    if (graded.length) {
      const held = graded.filter((d) => d.grade?.verdict === "held").length;
      lines.push(`Track record to date: ${held}/${graded.length} calls held.`);
    }
  }
  lines.push("");

  // 3 — the road ahead: the planning band
  lines.push("III. THE ROAD AHEAD — next 14 days");
  lines.push(thin);
  try {
    const band = await revenueBand();
    if (band) {
      lines.push(`Planning band: ${money(band.lo14)}–${money(band.hi14)} of revenue`);
      lines.push(`(8 in 10 simulated paths land inside; the wider 95% range`);
      lines.push(`is ${money(band.lo14w)}–${money(band.hi14w)} — tails are real).`);
    } else {
      lines.push("(band unavailable — more daily history needed)");
    }
  } catch {
    lines.push("(band unavailable this week)");
  }
  lines.push("");

  // 4 — the one move
  lines.push("IV. THE ONE MOVE");
  lines.push(thin);
  try {
    const recs = await recommendations();
    const top = recs && recs.length ? recs[0] : null;
    if (top) {
      lines.push(`${top.action}`);
      lines.push(`Expected: ${top.expected}${top.impact ? ` (~${money(top.impact)}/mo at stake)` : ""}`);
      lines.push(`Basis: ${top.source} · ${top.cite}`);
      lines.push("Accept it from the Decisions board — it will be graded.");
    } else {
      lines.push("No move this week. A quiet week is a finding, not a failure —");
      lines.push("Counsel recommends only when an engine finds real ground.");
    }
  } catch {
    lines.push("(recommendation engine unavailable this week)");
  }
  lines.push("");
  lines.push(rule);
  lines.push("ADJOURNED. Receipts for every figure live in the app.");
  lines.push(rule);

  return lines.join("\n");
}
