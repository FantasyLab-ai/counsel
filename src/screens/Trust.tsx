// The Trust Ledger — the register of every kind of claim Counsel makes,
// the method behind it, and the exact condition under which it refuses to
// speak. No other tool in the category publishes this page. That is the
// point of publishing it.

import { useNavigate } from "react-router-dom";
import { displayName } from "../engine/persona";
import { BackBtn, Reveal } from "../components/ui";

interface Entry {
  name: string;
  method: string;
  refuses: string;
}

const REGISTER: Entry[] = [
  { name: "The morning read", method: "trailing-30 comparison · transparent arithmetic", refuses: "under 14 trading days it says \"building your history\" instead of calling a trend" },
  { name: "What changed (drivers)", method: "exact identity — Rev = sales × units/sale × $/unit, parts telescope to the move", refuses: "under ~15 sales per 28-day window" },
  { name: "Daily sentinel", method: "weekday median ± 2.5·MAD, US-holiday-aware", refuses: "won't judge a partial day, a holiday, or a weekday with fewer than 3 priors" },
  { name: "Change-points", method: "PELT (rbf cost) + Welch's t-test · parity-tested against the Python reference", refuses: "no break is claimed without p < 0.05" },
  { name: "Price power (A1)", method: "natural experiment around YOUR price change · bootstrap CI", refuses: "no clean price change in the data → no elasticity claim, ever" },
  { name: "Customers at risk (A2)", method: "Kaplan–Meier survival, censored at today", refuses: "guest-heavy data gets an honest gap, not a guess" },
  { name: "Restock math (A3)", method: "newsvendor critical fractile on real demand distribution", refuses: "thin product history → no quantity" },
  { name: "The audit (B5)", method: "duplicate scan + monotone-creep + fee-drift, every claim traceable to charges", refuses: "runs only on YOUR expenses — never proposes from demo spending" },
  { name: "13-week cash view", method: "p15/p50/p85 weekly bands × margin + probability-weighted AR − bill schedule", refuses: "without expenses it shows an awaiting card, not an invented runway" },
  { name: "Stress-tested runway (C8)", method: "Monte Carlo bootstrap by weekday over the ledger", refuses: "same — no true burn, no simulation" },
  { name: "Season adjustment (C9)", method: "weekday decomposition — a slow Tuesday is judged as a Tuesday", refuses: "raw vs adjusted always shown together" },
  { name: "The product map", method: "margin × velocity quadrants at the medians", refuses: "price moves are $-quantified only when elasticity was measured" },
  { name: "Your best customers", method: "TO-DATE value by cohort & first-touch channel", refuses: "deliberately not \"LTV\" — lifetimes we haven't observed don't get projected" },
  { name: "Goal pace", method: "weekday-weighted pace vs your target, band = your own weekly variability", refuses: "\"behind\" is only said beyond YOUR normal swing — never on noise" },
  { name: "Post lift", method: "event study — 48h windows vs weekday norms, MAD noise band", refuses: "under 3 logged posts it says \"not enough to call it\"" },
  { name: "Ask", method: "intent-routed to the engines above; open questions disclose the five figures a cloud call would carry", refuses: "answers only from computed results — never from a vibe" },
];

export default function Trust() {
  const nav = useNavigate();
  return (
    <div className="app">
      <div className="appbar">
        <BackBtn />
        <div className="titleblock">
          <div className="kicker">{displayName()} · the register</div>
          <h1>The Trust Ledger</h1>
        </div>
        <button className="dt-btn" onClick={() => nav("/settings")}>← settings</button>
      </div>

      <Reveal i={0}>
        <section className="voice">
          <div className="eyebrow on-dark">The standing account</div>
          <div className="said">Every number in this app has a <em>receipt.</em></div>
          <div className="sub">
            This page is the register: each kind of claim Counsel makes, the method behind it,
            and — the part that matters — the exact condition under which it <b style={{ color: "#d8c19a" }}>refuses to speak</b>.
            An advisor you can audit is the only kind worth keeping.
          </div>
          <div className="micro">
            <div className="m"><div className="ml">fabricated numbers</div><div className="mv">0</div></div>
            <div className="m"><div className="ml">claims cited</div><div className="mv">all</div></div>
            <div className="m"><div className="ml">refusal conditions</div><div className="mv">{REGISTER.length}</div></div>
          </div>
        </section>
      </Reveal>

      <div className="eyebrow">The register — method &amp; refusal, per claim</div>
      <Reveal i={1}>
        <article className="mcard open il-card">
          {REGISTER.map((e) => (
            <div className="tl-row" key={e.name}>
              <div className="tl-name">{e.name}</div>
              <div className="tl-method">{e.method}</div>
              <div className="tl-refuse">refuses: {e.refuses}</div>
            </div>
          ))}
        </article>
      </Reveal>

      <Reveal i={2}>
        <div className="reassure">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          The refusals aren't limitations — they're the product. A tool that answers everything
          is guessing somewhere; this one shows you exactly where it draws the line.
        </div>
      </Reveal>

      <div className="fleuron" aria-hidden="true">◆</div>
    </div>
  );
}
