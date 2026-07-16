// The Insights Lab — all nine locked Tier A-C engines, computed on this
// device from the ledger. Demo data tonight; the engines are real and the
// connectors swap the fuel in Phase 2B. Every card: finding → method → limit.

import { useEffect, useState } from "react";
import {
  benchmarks, counterfactual, creditReadiness, customerSurvival, expenses,
  feeAudit, money, monteCarloRunway, newsvendor, priceElasticity, seasonAdjust,
  type AuditFinding, type BenchmarkOut, type CounterfactualOut, type CreditOut,
  type ElasticityOut, type MonteCarloOut, type NewsvendorOut, type SeasonAdjOut,
  type SurvivalOut,
} from "../engine/tierMath";
import { Reveal } from "../components/ui";

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

export default function Insights() {
  const [out, setOut] = useState<AllOut | null>(null);
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
          <div className="kicker">Kiln &amp; Co. · nine deep reads</div>
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
                <div className="il-cite">natural experiment around your own price change · 90% CI [{out.elasticity.ciLo.toFixed(2)}, {out.elasticity.ciHi.toFixed(2)}] · {out.elasticity.nPre}+{out.elasticity.nPost} selling days · measured only BEFORE the March break so the stockout can't masquerade as price sensitivity</div>
              </article>
            </Reveal>
          )}

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
            <article className="mcard open il-card">
              <div className="il-head"><span className="il-kick">B5 · the audit</span>
                <span className="pill lite-mod"><span className="dot" />{out.audit.length} findings</span></div>
              {out.audit.map((a, i) => (
                <div className="il-row" key={i}>
                  <div className="il-row-main"><b>{a.title}</b> · worth ~<b>{money(a.annual)}/yr</b></div>
                  <div className="il-row-sub">{a.detail}</div>
                </div>
              ))}
              <div className="il-cite">duplicate scan + monotone-creep test + fee-rate drift across {"{"}Dec…Mar{"}"} · every claim traceable to specific charges</div>
            </article>
          </Reveal>

          <Reveal i={5}>
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
          </Reveal>

          <Reveal i={6}>
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
          </Reveal>

          {/* ============ TIER C ============ */}
          <div className="eyebrow">Tier C — the daily habit</div>

          <Reveal i={7}>
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
