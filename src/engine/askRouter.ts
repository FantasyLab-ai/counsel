// askRouter.ts — Ask v2: the on-device intent router. The top questions an
// owner actually asks, matched by intent, slot-filled (amounts), and routed
// to the REAL engine — so the answer is computed numbers with receipts,
// private and instant, no cloud in the loop. Unmatched questions fall
// through to the caller's fallback. Every answer says what was checked.

import type { AskAnswer } from "../api/counsel";
import { dataMode, userExpenses } from "./dataSource";
import {
  BASELINE, cashSentry, hireScenario, money, purchaseScenario, seasonality,
} from "./insights";
import { customerSurvival, monteCarloRunway, newsvendor, priceElasticity } from "./tierMath";
import { drivers } from "./drivers";
import { sentinel } from "./sentinel";
import { menuMap } from "./menu";
import { cashView } from "./cashview";
import { arAging, staffingPlan } from "./money";
import { postLift, channelAttribution } from "./socialMath";

const strip = (html: string) => html.replace(/<[^>]+>/g, "");

// "$3k", "3,000", "$1200 a month" → dollars
function parseAmount(q: string): number | null {
  const m = q.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)\s*(k|K)?/);
  if (!m) return null;
  const v = parseFloat(m[1]) * (m[2] ? 1000 : 1);
  return isFinite(v) && v > 0 ? v : null;
}

function answer(
  q: string, checked: string[], verdict: string, body: string,
  honestNote: string, followups: string[],
): AskAnswer {
  return {
    id: `router-${Date.now()}`,
    headline: q,
    confidence: "moderate",
    confidenceLabel: "Computed on-device",
    checked, verdict, body, honestNote, followups,
  };
}

type Intent = { match: RegExp; run: (q: string) => Promise<AskAnswer | null> };

const live = () => dataMode() === "live";
const noExp = () => live() && !userExpenses();
const EXP_NOTE = "Baseline costs are the demo's until your expenses arrive — drop a bank CSV in Power Up and this recomputes on your true burn.";

const INTENTS: Intent[] = [
  // ---- staffing: match people to the weekly rhythm ----
  {
    match: /\b(staff(ing)?|labor|labour|headcount|how many people)\b/i,
    run: async (q) => {
      const plan = await staffingPlan().catch(() => null);
      if (!plan || plan.some((d) => !isFinite(d.factor))) {
        return answer(q, ["daily sales: not enough days yet"],
          `Not enough days to see your rhythm <em>yet.</em>`,
          `Staffing-to-demand needs a couple of weeks of daily sales so each weekday has its own baseline. Connect your register or drop a sales CSV in Power Up, and this becomes a per-day coverage plan computed from YOUR week.`,
          "I won't guess your busy days from an industry average.",
          ["What do I connect?", "How's this month going?"]);
      }
      const busy = plan.filter((d) => d.people > 1);
      const lines = plan.map((d) =>
        `<b>${d.day}</b> — ${d.people} ${d.people > 1 ? "people" : "person"} · ${Math.round(d.factor * 100)}% of an average day${d.note ? ` (${d.note})` : ""}`,
      ).join("\n");
      return answer(q,
        ["weekday rhythm (your daily sales)", "staffing-to-demand"],
        busy.length
          ? `Your week has a shape — <em>${busy.map((d) => d.day).join(" and ")} earn${busy.length === 1 ? "s" : ""} the second pair of hands.</em>`
          : `One steady pair of hands — <em>your week runs flat.</em>`,
        `${lines}\n\nJudge slow days against their OWN weekday, not the week's best — and staff to the shape instead of evenly.`,
        "Coverage is rhythm-based: a day at 110%+ of average suggests the second person. Wage math is separate — ask the hire question with a wage and I'll run true affordability.",
        ["Can I afford a helper at $1,400/mo?", "What's my slowest day?"]);
    },
  },
  // ---- can I afford X? ----
  {
    match: /\b(afford|buy|purchase|invest in|worth (buying|getting))\b/i,
    run: async (q) => {
      const amt = parseAmount(q);
      if (!amt) return null;
      if (noExp()) {
        const s = await cashSentry().catch(() => null);
        return answer(q, ["revenue band (30d)", "no expenses yet"],
          `I can see the revenue side — <em>not yet your true cash.</em>`,
          `Next 30 days of revenue, honestly banded: <b>${s ? `${money(s.lo30)}–${money(s.hi30)}` : "still warming up"}</b>.\n\nA ${money(amt)} purchase verdict needs your true cash & burn — one expenses CSV unlocks it. Until then I won't pretend to know your bank balance.`,
          "I answer from computed results only.", ["What would my margin be?", "How's this month going?"]);
      }
      const r = purchaseScenario(amt, 0);
      const s = await cashSentry().catch(() => null);
      return answer(q,
        [`cash ${money(BASELINE.cash)}`, `burn ${money(BASELINE.burn)}/mo`, "30d revenue band"],
        r.runwayAfter >= 2.5
          ? `Yes — <em>with your eyes open.</em>`
          : r.runwayAfter >= 1.5 ? `Workable, <em>but it thins your cushion.</em>` : `I'd wait — <em>it cuts too close.</em>`,
        `A ${money(amt)} purchase takes runway from <b>${r.runwayBefore.toFixed(1)}</b> to <b>${r.runwayAfter.toFixed(1)} months</b>.` +
        (s ? ` Next 30 days of revenue band ${money(s.lo30)}–${money(s.hi30)}; ${s.clears ? "even the low end clears your bills" : "the low end runs short of bills — timing matters"}.` : "") +
        `\n\nIf it earns money back, tell me the monthly return and I'll compute the recoup window.`,
        "A range, not a promise — the band is the honest answer.",
        ["What if it returns $300/mo?", "Show my 13-week cash view"]);
    },
  },
  // ---- should I raise prices? ----
  {
    match: /\b(raise|increase|up|bump).{0,12}price|charge more|underpric/i,
    run: async (q) => {
      const e = await priceElasticity().catch(() => null);
      const m = await menuMap().catch(() => null);
      const horse = m && m.ok ? m.proposals.find((p) => p.source.includes("reprice")) : null;
      if (e && e.inelastic) {
        return answer(q,
          ["your own price change (A1)", `elasticity ${e.elasticity.toFixed(2)}`, "menu map"],
          `Your buyers already told you — <em>they can take it.</em>`,
          (e.ciLo <= 0 && e.ciHi >= 0
            ? `Your last price move measured elasticity <b>${e.elasticity.toFixed(2)}</b>, but the 90% CI [${e.ciLo.toFixed(2)}, ${e.ciHi.toFixed(2)}] includes zero — I can't rule out no effect, so I won't project a gain from it yet.`
            : `Your last price move measured elasticity <b>${e.elasticity.toFixed(2)}</b> (90% CI [${e.ciLo.toFixed(2)}, ${e.ciHi.toFixed(2)}]) — price-tolerant. A further +5% projects <b>${money(e.monthlyGain)}/mo</b>.`) +
          (horse ? `\n\nBest first move from the product map: <b>${horse.action}</b> — ${strip(horse.expected)}.` : "") +
          `\n\nTrack it as a decision and grade it in 30 days — that's the honest way to raise prices.`,
          "Measured from YOUR data, not an industry average.",
          ["Track the price test", "Which product first?"]);
      }
      return answer(q, ["price history", "product map"],
        `Not yet measured — <em>so let's measure it.</em>`,
        `I haven't seen a clean price change in your data, so I won't guess your elasticity.\n\nThe honest play: pick one product${m && m.ok && m.items[0] ? ` (your volume leader is <b>${m.items[0].product}</b>)` : ""}, move it +4%, and I'll measure the real response inside two weeks — break-aware, weekday-adjusted.`,
        "No industry-average theater — only your measured response counts.",
        ["Run the product map", "Track a +4% test"]);
    },
  },
  // ---- who owes me? ----
  {
    match: /\bowe|owed|invoice|late pay|chase|receivab|collect\b/i,
    run: async (q) => {
      if (live()) {
        return answer(q, ["invoices: none connected"],
          `No invoices connected <em>yet.</em>`,
          `Once your invoices arrive (invoices.csv or Stripe Invoicing), I build the chase order: who, how late, weighted by size — plus your true DSO.`,
          "I won't invent receivables.", ["What do I connect?"]);
      }
      const ar = await arAging();
      const top = ar.chase[0];
      return answer(q, [`${ar.open.length} open invoices`, "aging buckets", "DSO"],
        `${money(ar.overdue)} is overdue — <em>chase in this order.</em>`,
        ar.chase.slice(0, 3).map((i, n) => `${n + 1}. <b>${i.client}</b> — ${money(i.amount)}, ${i.daysLate}d late${i.bucket === "61+" ? " (call, don't email)" : ""}`).join("\n") +
        `\n\nYour invoices settle in ~${ar.dso} days on average.` + (top ? ` Start with ${top.client} today.` : ""),
        "Chase order = days late × amount — mechanical, fair, effective.",
        ["Track the chase as a decision", "Show the 13-week cash view"]);
    },
  },
  // ---- how's it going / this week / month ----
  {
    match: /\bhow('| i)?s\b.*(week|month|business|going|doing|revenue)|what changed|why.*(down|up|drop|slow)/i,
    run: async (q) => {
      const [d, s] = await Promise.all([drivers().catch(() => null), sentinel().catch(() => null)]);
      if (!d || !d.ok) {
        return answer(q, ["ledger", "history depth"],
          `Still building the picture.`,
          `${d && !d.ok ? d.reason : "Not enough history yet"} — the drivers read (traffic × basket × price) unlocks around 15 sales per 4-week window.` +
          (s ? `\n\nSentinel: ${strip(s.headline)}` : ""),
          "I say 'not enough data' instead of guessing.", ["What do the engines need?"]);
      }
      return answer(q, ["two aligned 28-day windows", "weekday-normed sentinel"],
        strip(d.headline).split("—")[0].trim() + " — <em>and I can say why.</em>",
        `${strip(d.headline)}\n\n` +
        d.parts.map((p) => `${p.key}: ${p.dollars >= 0 ? "+" : "−"}${money(Math.abs(p.dollars))} (${p.detail})`).join("\n") +
        (d.mix ? `\nmix: ${d.mix.product} now ${d.mix.to}% of revenue (was ${d.mix.from}%)` : "") +
        (s ? `\n\nSentinel: ${strip(s.headline)}` : ""),
        "The three parts sum to the move exactly — arithmetic, not a model.",
        ["Why is traffic moving?", "Show the sentinel bands"]);
    },
  },
  // ---- runway / cash / payroll ----
  {
    match: /\brunway|cash (flow|position|view)|survive|payroll|make rent|out of (money|cash)\b/i,
    run: async (q) => {
      if (noExp()) {
        const s = await cashSentry().catch(() => null);
        return answer(q, ["revenue band", "no expenses yet"],
          `Revenue side only — <em>for now.</em>`,
          `${s ? `Next 30 days banded ${money(s.lo30)}–${money(s.hi30)}.` : "Revenue band still warming up."}\n\nTrue runway needs your expenses. ${EXP_NOTE}`,
          "I won't invent a runway.", ["How do I connect expenses?"]);
      }
      const [cv, mc] = await Promise.all([cashView().catch(() => null), monteCarloRunway().catch(() => null)]);
      const cvLine = cv && cv.ok ? strip(cv.headline) : null;
      const mcLine = mc ? (mc.gapProb === 0
        ? `${mc.sims} simulated futures: none went below zero; tightest ~${mc.minCashDate} at ${money(mc.minCash)}.`
        : `${Math.round(mc.gapProb * 100)}% of ${mc.sims} futures gapped, clustering ~${mc.gapDate}.`) : null;
      return answer(q, ["13-week cash view", `${mc?.sims ?? 0} Monte Carlo futures`],
        cv && cv.ok && cv.tightWeeks > 0 ? `Tight spots ahead — <em>but you can see them coming.</em>` : `Clear water in the cautious case.`,
        [cvLine, mcLine].filter(Boolean).join("\n\n"),
        "Cautious case = the low band every single week — deliberately pessimistic.",
        ["Show the 13-week view", "What's the tightest week?"]);
    },
  },
  // ---- best product / what sells ----
  {
    match: /\bbest (product|seller)|top (product|seller)|what sells|menu|product map\b/i,
    run: async (q) => {
      const m = await menuMap();
      if (!m.ok) return answer(q, ["product ledger"], `Not enough products to map.`, `${m.reason}.`, "The map is comparative — it needs variety.", []);
      const star = m.items.find((i) => i.quadrant === "star");
      const q4 = (qd: string) => m.items.filter((i) => i.quadrant === qd).map((i) => i.product).join(", ") || "—";
      return answer(q, [`${m.items.length} products`, `${m.windowDays}d window`, "margin × velocity"],
        star ? `<em>${star.product}</em> is carrying you — margin AND volume.` : `Your map has no star yet — <em>that's the opportunity.</em>`,
        `stars: ${q4("star")}\nworkhorses: ${q4("workhorse")}\npuzzles: ${q4("puzzle")}\ndogs: ${q4("dog")}` +
        (m.proposals[0] ? `\n\nFirst move: <b>${m.proposals[0].action}</b> — ${strip(m.proposals[0].expected)}.` : ""),
        m.costAssumed ? "Costs assumed at 55% of price where unknown — labeled, replaceable." : "Real recorded costs.",
        ["Track the first move", "Why is my star a star?"]);
    },
  },
  // ---- losing customers / churn ----
  {
    match: /\b(los(e|ing)|churn|at.?risk|coming back|regulars|repeat)\b/i,
    run: async (q) => {
      const s = await customerSurvival().catch(() => null);
      if (!s || s.repeaters < 5) {
        return answer(q, ["repeat-customer ids"], `Not enough repeat history yet.`,
          `Survival analysis needs a handful of repeat customers with ids — as your data grows, I'll spot who's quietly slipping before they're gone.`,
          "Honest gap: guest checkouts hide repeat behavior.", []);
      }
      return answer(q, [`${s.repeaters} repeat customers`, "Kaplan–Meier"],
        `${s.atRisk} regulars are <em>past their usual return window.</em>`,
        `Your regulars usually return within <b>${s.medianReturnDays} days</b>; ${s.atRisk} are now past that — roughly <b>${money(s.recoverable)}</b> recoverable if a nudge brings the expected share back.\n\nA win-back message costs you ten minutes.`,
        "Censored at today — the math knows who it hasn't seen.",
        ["Track the win-back", "Who are my best customers?"]);
    },
  },
  // ---- hiring ----
  {
    match: /\bhire|hiring|employee|helper|bring (someone|somebody) on\b/i,
    run: async (q) => {
      const amt = parseAmount(q) ?? 2200;
      const r = hireScenario(amt);
      return answer(q, [`avg profit ${money(BASELINE.avgProfit)}/mo`, `worst month ${money(BASELINE.worstProfit)}`],
        r.verdict === "comfortable" ? `Yes — <em>even your worst month covers it.</em>`
          : r.verdict === "workable" ? `Workable — <em>but your worst month gets tight.</em>`
          : `Wait — <em>your worst month can't carry it.</em>`,
        `At ${money(amt)}/mo: average-month cushion <b>${money(r.cushionAvg)}</b>, worst-recorded-month cushion <b>${money(r.cushionWorst)}</b>. I stress-test against the worst month you've actually had — not the average you hope for.${noExp() ? `\n\n${EXP_NOTE}` : ""}`,
        "Stress-tested against your recorded worst, not a projection.",
        ["What about part-time at $1,200?", "Rehearse it in Plan"]);
    },
  },
  // ---- marketing / posts ----
  {
    match: /\bpost|instagram|tiktok|marketing|ads? (work|worth)|social\b/i,
    run: async (q) => {
      const [lift, ch] = await Promise.all([postLift().catch(() => null), channelAttribution().catch(() => null)]);
      const top = ch?.rows.find((r) => !r.unknown);
      return answer(q, ["UTM/referrer attribution", `${lift?.n ?? 0} logged posts`],
        lift?.reliable && lift.medianLift !== null ? `Your posts <em>move money</em> — measurably.` : `The honest answer: <em>not enough logged posts yet.</em>`,
        (top ? `${top.channel} drives ${money(top.revenue)} (${(top.share * 100).toFixed(0)}% of attributed revenue).\n\n` : "") +
        (lift?.reliable && lift.medianLift !== null
          ? `Median lift <b>${money(lift.medianLift)}</b> per post over the following 48h (weekday-adjusted, vs a ±${money(lift.noiseBand)} noise band).`
          : `Log each post in Marketing when you publish — after ~3 posts I can measure the 48h lift against your weekday norm honestly.`),
        "Event-study math, not vibes: lift is measured against YOUR weekday baseline.",
        ["Open the post log", "Which channel is growing?"]);
    },
  },
  // ---- restock ----
  {
    match: /\brestock|reorder|inventory|stock (up|out)|how (much|many).{0,20}(order|make|bake)\b/i,
    run: async (q) => {
      const n = await newsvendor().catch(() => [] as Awaited<ReturnType<typeof newsvendor>>);
      if (!n.length) return answer(q, ["demand distribution"], `Needs more product history.`, `Restock math needs per-product demand variety — it unlocks as sales accumulate.`, "Critical-fractile needs a distribution, not a guess.", []);
      return answer(q, ["critical fractile", "your demand distribution"],
        `<em>${n[0].product}:</em> stock ${n[0].stock30}, not ${n[0].naive30}.`,
        n.slice(0, 3).map((x) => `<b>${x.product}</b>: ${x.stock30} for the next 30 days — covers ${(x.fractile * 100).toFixed(0)}% of demand scenarios, frees ~${money(x.tiedUpSaved)} vs stocking for the best-ever day`).join("\n"),
        "Optimizes cost of stockout vs cost of sitting inventory — not maximum shelves.",
        ["Track the restock", "What's overstocked?"]);
    },
  },
  // ---- slow day / season ----
  {
    match: /\bslow|dead|quiet (day|week)|season|weekend|busiest|which day\b/i,
    run: async (q) => {
      const [se, st] = await Promise.all([seasonality().catch(() => null), sentinel().catch(() => null)]);
      return answer(q, ["weekday decomposition", "sentinel bands"],
        se ? `${se.strongest} run <em>${se.ratio.toFixed(1)}× your ${se.weakest}.</em>` : `Your weekly rhythm is still forming.`,
        (se ? `Strongest: <b>${se.strongest}</b> · weakest: <b>${se.weakest}</b> (${se.ratio.toFixed(1)}×). Staff and produce to that shape — and judge slow days against their OWN weekday, not the week's best.` : "") +
        (st ? `\n\nSentinel: ${strip(st.headline)}` : ""),
        "A slow Tuesday is only a problem if it's slow FOR a Tuesday.",
        ["Show staffing by day", "Was yesterday actually bad?"]);
    },
  },
];

/** Route a question to a computed answer, or null for the caller's fallback. */
export async function routeAsk(question: string): Promise<AskAnswer | null> {
  for (const intent of INTENTS) {
    if (intent.match.test(question)) {
      try {
        const a = await intent.run(question);
        if (a) return a;
      } catch { /* engine hiccup -> next intent / fallback */ }
    }
  }
  return null;
}
