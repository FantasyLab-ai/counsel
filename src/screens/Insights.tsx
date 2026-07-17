// The Insights Lab — all nine locked Tier A-C engines, computed on this
// device from the ledger. Demo data tonight; the engines are real and the
// connectors swap the fuel in Phase 2B. Every card: finding → method → limit.

import { useEffect, useState } from "react";
import { dataMode, userExpenses } from "../engine/dataSource";
import { menuMap, type MenuOut, type MenuThin, type Quadrant } from "../engine/menu";
import { displayName } from "../engine/persona";
import {
  benchmarks, counterfactual, creditReadiness, customerSurvival, expenses,
  feeAudit, money, monteCarloRunway, newsvendor, priceElasticity, seasonAdjust,
  type AuditFinding, type BenchmarkOut, type CounterfactualOut, type CreditOut,
  type ElasticityOut, type MonteCarloOut, type NewsvendorOut, type SeasonAdjOut,
  type SurvivalOut,
} from "../engine/tierMath";
import { ActOn, Awaiting, Reveal } from "../components/ui";

interface AllOut {
  elasticity: ElasticityOut | null;
  survival: SurvivalOut;
  news: NewsvendorOut[];
  cf: CounterfactualOut | null;
  audit: AuditFinding[];
  bench: BenchmarkOut[];
  credit: CreditOut;
  mc: MonteCarloOut;
  season: SeasonAdjOut;
  ms: number;
}

const QUADS: { id: Quadrant; name: string; note: string }[] = [
  { id: "star", name: "★ Stars", note: "protect — never discount" },
  { id: "puzzle", name: "◆ Puzzles", note: "high margin, low volume — promote" },
  { id: "workhorse", name: "▮ Workhorses", note: "volume, thin margin — price-test" },
  { id: "dog", name: "· Dogs", note: "rework or retire" },
];

// The product map — menu engineering for every product business.
function MenuCard() {
  const [m, setM] = useState<MenuOut | MenuThin | null>(null);
  useEffect(() => {
    let on = true;
    menuMap().then((x) => on && setM(x)).catch((e) => on && setM({ ok: false, reason: String(e) }));
    return () => { on = false; };
  }, []);

  if (!m) return <article className="mcard open il-card"><div className="il-loading">▶ mapping products…</div></article>;
  if (!m.ok) {
    return (
      <article className="mcard open il-card awaiting">
        <div className="il-head"><span className="il-kick">A1½ · the product map</span>
          <span className="pill lite-fc"><span className="dot" />warming up</span></div>
        <div className="mmean">Product map: {m.reason}.</div>
      </article>
    );
  }
  return (
    <article className="mcard open il-card">
      <div className="il-head"><span className="il-kick">A1½ · the product map</span>
        <span className="pill lite-hi"><span className="dot" />margin × velocity</span></div>
      <div className="mn-grid">
        {QUADS.map((qd) => (
          <div className={`mn-cell ${qd.id}`} key={qd.id}>
            <div className="mn-qname">{qd.name}</div>
            <div className="mn-items">
              {m.items.filter((i) => i.quadrant === qd.id).map((i) => (
                <span className="mn-chip" key={i.product} title={`${i.unitsPerWeek}/wk · ${money(i.marginPerUnit)}/unit margin`}>
                  {i.product}
                </span>
              ))}
              {m.items.every((i) => i.quadrant !== qd.id) && <span className="mn-none">—</span>}
            </div>
            <div className="mn-note">{qd.note}</div>
          </div>
        ))}
      </div>
      {m.proposals.map((p) => (
        <div className="il-row" key={p.action}>
          <div className="il-row-main"><b>{p.action}</b>{p.impact != null && <> · ~<b>{money(p.impact)}/mo</b></>}</div>
          <div className="il-row-sub">{p.expected}</div>
          <ActOn source={p.source} action={p.action} expected={p.expected} impact={p.impact} />
        </div>
      ))}
      <div className="il-cite">{m.cite}</div>
    </article>
  );
}

export default function Insights() {
  const [out, setOut] = useState<AllOut | null>(null);
  // Live business without expenses: baseline-fed cards say so instead of
  // borrowing the demo's cash/burn/margin numbers.
  const needsExp = dataMode() === "live" && !userExpenses();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    const t0 = performance.now();
    (async () => {
      await expenses(); // warm both fetches
      const [elasticity, survival, news, cf, audit, bench, credit, mc, season] =
        await Promise.all([
          priceElasticity(), customerSurvival(), newsvendor(), counterfactual(),
          feeAudit(), benchmarks(), creditReadiness(), monteCarloRunway(), seasonAdjust(),
        ]);
      if (on) setOut({ elasticity, survival, news, cf, audit, bench, credit, mc, season, ms: performance.now() - t0 });
    })().catch((e) => on && setErr(String(e)));
    return () => { on = false; };
  }, []);

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">{displayName()} · nine deep reads</div>
          <h1>The Insights Lab</h1>
        </div>
        <div className="avatar">B</div>
      </div>

      {err && <div className="reassure">Engine unavailable: {err}</div>}
      {!out && !err && <div className="il-loading">▶ running nine analyses on this device…</div>}

      {out && (
        <>
          <div className="reassure">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            All nine computed on this device in {(out.ms / 1000).toFixed(1)}s — elasticity, survival,
            inventory, counterfactual, audit, benchmarks, credit, Monte Carlo, seasonality. Demo ledger;
            the math is live.
          </div>

          {/* ============ TIER A ============ */}
          <div className="eyebrow">Tier A — only real math can say these</div>

          {out.elasticity && (
            <Reveal i={0}>
              <article className="mcard open il-card">
                <div className="il-head"><span className="il-kick">A1 · price power</span>
                  <span className="pill lite-hi"><span className="dot" />measured, not guessed</span></div>
                <div className="mval"><span className="num">{out.elasticity.elasticity.toFixed(2)}</span><span className="dlt">elasticity</span></div>
                <div className="mmean">
                  Your Feb 1 price move (+{out.elasticity.pricePct.toFixed(0)}% on the Sunset Mug) cost only{" "}
                  <b>{Math.abs(out.elasticity.qtyPct).toFixed(0)}% of unit demand</b> — your buyers are{" "}
                  {out.elasticity.inelastic ? <b>price-tolerant</b> : <b>price-sensitive</b>}.{" "}
                  {out.elasticity.inelastic && out.elasticity.monthlyGain > 0 && (
                    <>A further +5% test projects <b>{money(out.elasticity.monthlyGain)}/mo</b> of margin.</>
                  )}
                </div>
                {out.elasticity.inelastic && out.elasticity.monthlyGain > 0 && (
                  <ActOn source="A1 · price power" action="Run the +5% price test"
                    expected={`margin gain ≈ ${money(out.elasticity.monthlyGain)}/mo; volume drop stays inside the CI`}
                    impact={out.elasticity.monthlyGain} />
                )}
                <div className="il-cite">natural experiment around your own price change · 90% CI [{out.elasticity.ciLo.toFixed(2)}, {out.elasticity.ciHi.toFixed(2)}] · {out.elasticity.nPre}+{out.elasticity.nPost} selling days · measured only BEFORE the March break so the stockout can't masquerade as price sensitivity</div>
              </article>
            </Reveal>
          )}

          <Reveal i={1}><MenuCard /></Reveal>

          <Reveal i={1}>
            <article className="mcard open il-card">
              <div className="il-head"><span className="il-kick">A2 · customers at risk</span>
                <span className="pill lite-mod"><span className="dot" />Kaplan–Meier</span></div>
              <div className="mval"><span className="num">{out.survival.atRisk}</span><span className="dlt">quietly slipping away</span></div>
              <div className="mmean">
                Your regulars usually return within <b>{out.survival.medianReturnDays} days</b>.{" "}
                {out.survival.atRisk} of {out.survival.repeaters} are now past that window — roughly{" "}
                <b>{money(out.survival.recoverable)}</b> of recoverable revenue if a nudge brings even the
                expected share back.
              </div>
              <ActOn source="A2 · customers at risk" action={`Win-back nudge to ${out.survival.atRisk} at-risk regulars`}
                expected={`recover a meaningful share of ${money(out.survival.recoverable)}`}
                impact={out.survival.recoverable} />
              <div className="il-cite">survival analysis on {out.survival.repeaters} repeat customers · censored at today · P(return after 45d) = {(out.survival.pReturn45 * 100).toFixed(0)}%</div>
            </article>
          </Reveal>

          {out.news.length > 0 && (
            <Reveal i={2}>
              <article className="mcard open il-card">
                <div className="il-head"><span className="il-kick">A3 · restock, solved</span>
                  <span className="pill lite-hi"><span className="dot" />newsvendor optimum</span></div>
                {out.news.map((n) => (
                  <div className="il-row" key={n.product}>
                    <div className="il-row-main"><b>{n.product}</b> — stock <b>{n.stock30}</b> for the next 30 days, not {n.naive30}.</div>
                    <div className="il-row-sub">covers {(n.fractile * 100).toFixed(0)}% of demand scenarios · frees ~{money(n.tiedUpSaved)} vs stocking for the best-ever day</div>
                  </div>
                ))}
                {out.news[0] && (
                  <ActOn source="A3 · restock math" action={`Restock ${out.news[0].product} to ${out.news[0].stock30}`}
                    expected={`~${(out.news[0].fractile * 100).toFixed(0)}% demand coverage · ${money(out.news[0].tiedUpSaved)} freed vs max-stocking`}
                    impact={out.news[0].tiedUpSaved} />
                )}
                <div className="il-cite">critical-fractile inventory math on each product's real demand distribution · holding cost assumed 25% of unit cost</div>
              </article>
            </Reveal>
          )}

          {out.cf && (
            <Reveal i={3}>
              <article className="mcard open il-card">
                <div className="il-head"><span className="il-kick">A4 · the month that would have been</span>
                  <span className="pill lite-fc"><span className="dot" />counterfactual</span></div>
                <div className="mval"><span className="num">{money(out.cf.cost)}</span><span className="dlt">cost of the {out.cf.breakDate} break</span></div>
                <div className="mmean">
                  Without the {out.cf.breakDate} break, the last {out.cf.postDays} days project to{" "}
                  <b>{money(out.cf.wouldMid)}</b> ({money(out.cf.wouldLo)}–{money(out.cf.wouldHi)}). You actually
                  took <b>{money(out.cf.actual)}</b>. That gap is what the stockout + ended promo cost.
                </div>
                <div className="il-cite">pre-break AR(1) projected forward, on-device · a projection with bands, not a certainty</div>
              </article>
            </Reveal>
          )}

          {/* ============ TIER B ============ */}
          <div className="eyebrow">Tier B — money found &amp; trust built</div>

          <Reveal i={4}>
            {needsExp ? (
              <Awaiting title="B5 · the audit" needs="your expenses (bank or accounting export)"
                unlocks="Duplicate charges, subscription creep and fee drift get hunted in YOUR spending — often worth hundreds a year." />
            ) : (
            <article className="mcard open il-card">
              <div className="il-head"><span className="il-kick">B5 · the audit</span>
                <span className="pill lite-mod"><span className="dot" />{out.audit.length} findings</span></div>
              {out.audit.map((a, i) => (
                <div className="il-row" key={i}>
                  <div className="il-row-main"><b>{a.title}</b> · worth ~<b>{money(a.annual)}/yr</b></div>
                  <div className="il-row-sub">{a.detail}</div>
                </div>
              ))}
              {out.audit.length > 0 && (
                <ActOn source="B5 · the audit" action={`Fix ${out.audit.length} audit findings`}
                  expected={`recover ~${money(out.audit.reduce((s, a) => s + a.annual, 0))}/yr (refund, cancel creep, call processor)`}
                  impact={out.audit.reduce((s, a) => s + a.annual, 0) / 12} />
              )}
              <div className="il-cite">duplicate scan + monotone-creep test + fee-rate drift across {"{"}Dec…Mar{"}"} · every claim traceable to specific charges</div>
            </article>
            )}
          </Reveal>

          <Reveal i={5}>
            {needsExp ? (
              <Awaiting title="B6 · where you stand" needs="your expenses (for a real margin)"
                unlocks="Percentile benchmarks against reference ranges — computed from your true margin, not a borrowed one." />
            ) : (
            <article className="mcard open il-card">
              <div className="il-head"><span className="il-kick">B6 · where you stand</span>
                <span className="pill lite-none"><span className="dot" />reference ranges</span></div>
              {out.bench.map((b) => (
                <div className="il-bench" key={b.label}>
                  <div className="il-bench-top"><span>{b.label}</span><b>{b.yours} · {b.percentile}th pctile</b></div>
                  <div className="il-bench-bar">
                    <span className="q" style={{ left: "25%" }} /><span className="q" style={{ left: "50%" }} /><span className="q" style={{ left: "75%" }} />
                    <span className="you" style={{ left: `${b.percentile}%` }} />
                  </div>
                  <div className="il-bench-lbl"><span>p25 {b.p25}</span><span>median {b.p50}</span><span>p75 {b.p75}</span></div>
                </div>
              ))}
              <div className="il-cite">honest label: compiled public reference ranges for handmade/craft retail — a live, anonymized peer cohort arrives with the network</div>
            </article>
            )}
          </Reveal>

          <Reveal i={6}>
            {needsExp ? (
              <Awaiting title="B7 · lender-ready?" needs="your expenses (coverage needs true costs)"
                unlocks="The transparent credit-readiness score lenders recognize — real stability and coverage measures from your books." />
            ) : (
            <article className="mcard open il-card">
              <div className="il-head"><span className="il-kick">B7 · lender-ready?</span>
                <span className={`pill ${out.credit.band === "strong" ? "lite-hi" : "lite-mod"}`}><span className="dot" />{out.credit.band}</span></div>
              <div className="mval"><span className="num">{out.credit.score}</span><span className="dlt">/ 100 credit readiness</span></div>
              {out.credit.components.map((c) => (
                <div className="il-comp" key={c.name}>
                  <span className="il-comp-name">{c.name} · {c.value}</span>
                  <span className="il-comp-track"><span className="il-comp-fill" style={{ width: `${(c.points / c.max) * 100}%` }} /></span>
                  <span className="il-comp-pts">{c.points}/{c.max}</span>
                </div>
              ))}
              <div className="il-cite">transparent formula — the same stability &amp; coverage measures lenders compute · no debt on file, so DSCR is n/a · pairs with the Banker's Packet</div>
            </article>
            )}
          </Reveal>

          {/* ============ TIER C ============ */}
          <div className="eyebrow">Tier C — the daily habit</div>

          <Reveal i={7}>
            {needsExp ? (
              <Awaiting title="C8 · stress-tested runway" needs="your expenses/bank (true cash & burn)"
                unlocks="1,000 simulated futures over YOUR outgoings — the honest probability of a cash gap, not a demo's." />
            ) : (
            <article className="mcard open il-card">
              <div className="il-head"><span className="il-kick">C8 · stress-tested runway</span>
                <span className="pill lite-hi"><span className="dot" />{out.mc.sims} simulations</span></div>
              <div className="mval"><span className="num">{(out.mc.gapProb * 100).toFixed(0)}%</span><span className="dlt">chance of a cash gap in 90 days</span></div>
              <div className="mmean">
                {out.mc.gapProb === 0
                  ? <>In {out.mc.sims} simulated futures — weekday-realistic revenue, rent on the 1st, materials, draw on the 28th — <b>none went below zero</b>. The tightest moment is ~<b>{out.mc.minCashDate}</b> at {money(out.mc.minCash)}.</>
                  : <>{Math.round(out.mc.gapProb * out.mc.sims)} of {out.mc.sims} futures gapped, clustering around <b>{out.mc.gapDate}</b>. Tightest point ~{out.mc.minCashDate} at {money(out.mc.minCash)}.</>}
              </div>
              <div className="il-cite">Monte Carlo bootstrap by weekday over your ledger + scheduled outgoings · assumptions visible in Plan</div>
            </article>
            )}
          </Reveal>

          <Reveal i={8}>
            <article className="mcard open il-card">
              <div className="il-head"><span className="il-kick">C9 · the false-alarm killer</span>
                <span className="pill lite-hi"><span className="dot" />season-adjusted</span></div>
              <div className="mmean">
                Last 7 days read <b>{out.season.rawPct > 0 ? "+" : ""}{out.season.rawPct.toFixed(0)}% raw</b> — but
                season-adjusted it's <b>{out.season.adjPct > 0 ? "+" : ""}{out.season.adjPct.toFixed(0)}%</b>.{" "}
                {Math.abs(out.season.rawPct - out.season.adjPct) > 3
                  ? "Most of that swing is just your weekly rhythm, not a real change."
                  : "The raw and adjusted stories agree this week."}
              </div>
              <div className="il-factors">
                {out.season.factors.map((f) => (
                  <span className="il-factor" key={f.day}><b>{f.day}</b> {f.f.toFixed(2)}×</span>
                ))}
              </div>
              <div className="il-cite">weekday decomposition of your full ledger · every alert Counsel raises is checked against this first</div>
            </article>
          </Reveal>
        </>
      )}
    </div>
  );
}
