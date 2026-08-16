// Today — the morning brief. The advisor SPEAKS on dark stationery, then
// SHOWS on paper: triaged attention, read tiles (break-line on revenue),
// the honest "watching" section, and connected sources.

import { useEffect, useState } from "react";
import { displayName } from "../engine/persona";
import { useNavigate } from "react-router-dom";
import { getBrief, getMetrics, type Brief, type Metric } from "../api/counsel";
import { demoView, hasUserData } from "../engine/dataSource";
import { composeDigest } from "../engine/digest";
import { money, revenueBand, type RevenueBand } from "../engine/insights";
import { overdueCount } from "../engine/decisions";
import { sentinel, type SentinelOut } from "../engine/sentinel";
import { dataBasis, type DataBasis } from "../engine/dataBasis";
import { CitePill, ConfidencePill, CountUp, Html, Receipt, Reveal, Written } from "../components/ui";
import { BreakSpark, VizView } from "../components/charts";

const SHIELD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export default function Today() {
  const nav = useNavigate();
  const [brief, setBrief] = useState<Brief | null>(null);
  // First-run coach: teach the reading model ONCE, then get out of the
  // way forever. Progressive disclosure needs a key to the layers.
  const [coach, setCoach] = useState<boolean>(() => {
    try { return !localStorage.getItem("counsel.coach.today"); } catch { return false; }
  });
  const dismissCoach = () => {
    setCoach(false);
    try { localStorage.setItem("counsel.coach.today", "1"); } catch { /* fine */ }
  };
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [digest, setDigest] = useState<string | null>(null);
  const [artifactTitle, setArtifactTitle] = useState("morning digest");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState<SentinelOut | null>(null);
  const [band, setBand] = useState<RevenueBand | null>(null);
  const [basis, setBasis] = useState<DataBasis | null>(null);
  const toGrade = overdueCount();

  useEffect(() => {
    if (!digest) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDigest(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [digest]);

  useEffect(() => {
    let on = true;
    getBrief().then((b) => on && setBrief(b));
    getMetrics("month").then((m) => on && setMetrics(m));
    sentinel().then((s) => on && setSent(s)).catch(() => undefined);
    revenueBand().then((b) => on && setBand(b)).catch(() => undefined);
    dataBasis().then((b) => on && setBasis(b)).catch(() => undefined);
    return () => { on = false; };
  }, []);

  async function openDigest() {
    setArtifactTitle("morning digest");
    setDigest("composing…");
    setDigest(await composeDigest());
  }
  async function openWeek() {
    setArtifactTitle("week in review");
    setDigest("composing…");
    const { composeWeekReview } = await import("../engine/weekReview");
    setDigest(await composeWeekReview());
  }
  async function openBoard() {
    const { isPro } = await import("../engine/entitlement");
    if (!isPro()) { nav("/pro"); return; }
    setArtifactTitle("the board meeting");
    setDigest("composing…");
    const { composeBoardMeeting } = await import("../engine/boardMeeting");
    setDigest(await composeBoardMeeting());
  }
  async function copyDigest() {
    if (!digest) return;
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  if (!brief) {
    return (
      <div className="app">
        <div className="appbar">
          <div className="wordmark"><b>Counsel</b><span>by Aurora</span></div>
          <div className="avatar">{displayName()[0]}</div>
        </div>
        <div className="greet">reading your numbers…</div>
        <div className="skl-voice">
          <div className="skl skl-dark" style={{ width: "40%" }} />
          <div className="skl skl-dark skl-big" style={{ width: "88%" }} />
          <div className="skl skl-dark skl-big" style={{ width: "64%" }} />
          <div className="skl skl-dark" style={{ width: "76%" }} />
        </div>
      </div>
    );
  }

  // Only the four dashboard tiles (revenue wide, margin, cash, customers wide)
  const dash = metrics.filter((m) => ["revenue", "margin", "runway", "customers"].includes(m.id));

  return (
    <div className="app">
      <div className="appbar">
        <div className="wordmark"><b>Counsel</b><span>by Aurora</span></div>
        <div className="artifact-btns">
          <button className="digest-btn" onClick={openDigest} title="Morning digest — copy it anywhere">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4zM4 9h16M9 20V9" /></svg>
            digest
          </button>
          <button className="digest-btn" onClick={openWeek} title="Week in review — the Sunday read">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
            week
          </button>
          <button className="digest-btn board-btn" onClick={openBoard} title="The Board Meeting — the Pro Sunday packet">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l9 5-9 5-9-5z" /><path d="M5 12v5c0 1.5 3 3 7 3s7-1.5 7-3v-5" /></svg>
            board
          </button>
        </div>
      </div>
      <div className="greet">
        {brief.greeting.date} · <b>{displayName()}</b>
      </div>

      {digest && (
        <div className="digest-modal" role="dialog" aria-modal="true" aria-label="Morning digest"
             onClick={(e) => { if (e.target === e.currentTarget) setDigest(null); }}>
          <div className="digest-card">
            <div className="digest-head">
              <span className="il-kick">{artifactTitle}</span>
              <button className="dt-btn" onClick={() => setDigest(null)}>close</button>
            </div>
            <pre className="digest-pre">{digest}</pre>
            <div className="dropin-row">
              <button className="dbtn primary" onClick={copyDigest}>{copied ? "✓ copied" : "Copy digest"}</button>
            </div>
            <div className="il-cite">composed from the same engines as every screen · becomes the daily push/email when the hosted service lands</div>
          </div>
        </div>
      )}

      {coach && (
        <Reveal i={0}>
          <div className="coach-card" role="note">
            <div className="coach-title">How to read this page</div>
            <div className="coach-line"><b>Plain words first.</b> Counsel tells you what's happening in sentences — you never need the math to act.</div>
            <div className="coach-line"><b>Every number opens.</b> The ≡ mark means tap it — the receipt shows how it was computed, from your data.</div>
            <div className="coach-line"><b>Pills say how sure.</b> High, moderate, or "not ready to call" — Counsel says which, and refuses to bluff.</div>
            <button className="dt-btn coach-got" onClick={dismissCoach}>got it</button>
          </div>
        </Reveal>
      )}

      <Reveal i={0}>
        <section className="voice">
          <div className="eyebrow on-dark">{brief.state.eyebrow}</div>
          <div className="said"><Written text={brief.state.headline} mode="letters" startDelay={200} /></div>
          <div className="sub"><Written text={brief.state.sub} mode="words" startDelay={900} /></div>
          <div className="micro">
            {brief.state.micro.map((m) => (
              <div className="m" key={m.label}>
                <div className="ml">{m.label}</div>
                <div className="mv"><span className={`dot dot-${m.tone}`} />{m.value}</div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* The daily sentinel — quiet by design; speaks when a day breaks its
          weekday band or a soft streak forms. Holiday-aware. */}
      {sent && (
        <Reveal i={1}>
          <div className={`sentinel ${sent.status}`}>
            <span className="sentinel-dot" />
            <div style={{ flex: 1 }}>
              <div className="sentinel-txt"><Html text={sent.headline} /></div>
              <div className="sentinel-sub">{sent.detail}{sent.todaySoFar ? ` · ${sent.todaySoFar}` : ""}</div>
              {sent.status !== "quiet" && (
                <button className="dt-btn" style={{ marginTop: 7 }} onClick={() => nav("/numbers")}>
                  → see WHY in the drivers
                </button>
              )}
            </div>
          </div>
        </Reveal>
      )}

      {/* Power Up — the app-wide activation banner. Front and center until
          real data is loaded; slims down once your data is active. */}
      <Reveal i={1}>
        <button className="setup-banner" onClick={() => nav("/power")}>
          <div className="sb-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg>
          </div>
          <div className="sb-body">
            {hasUserData() && demoView() ? (
              <><div className="sb-title">Demo showroom view</div>
                <div className="sb-sub">Your live data is safe and untouched — flip back in Settings → Privacy &amp; data →</div></>
            ) : hasUserData() ? (
              <><div className="sb-title">Your data is active</div>
                <div className="sb-sub">Manage sources, drop in more files, see what else unlocks →</div></>
            ) : (
              <><div className="sb-title">You're on demo data — power up Counsel</div>
                <div className="sb-sub">The checklist: connect a source or drop in your CSV (on-device, never uploaded) →</div></>
            )}
          </div>
        </button>
      </Reveal>

      <div className="eyebrow">Needs your attention</div>
      <div className="eyebrow-sub">the few things worth a minute today, ranked</div>
      <div className="rows">
        {brief.attention.map((a, i) => (
          <Reveal i={i + 1} key={a.id}>
            <article className="row-card">
              <div className="rank">{i + 1}</div>
              <div className="rbody">
                <div className="src">{a.source}</div>
                <div className="txt"><Html text={a.headline} /></div>
                <div className="rfoot">
                  <ConfidencePill confidence={a.confidence} label={a.confidenceLabel ?? a.confidence} />
                  {a.citationChip && <CitePill text={a.citationChip} />}
                </div>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <div className="eyebrow">The numbers, read</div>
      <div className="eyebrow-sub">tap any number to see exactly how it was computed</div>
      <div className="grid2">
        {dash.map((m, i) => (
          <Reveal i={i + 3} key={m.id} className={m.wide ? "tile wide" : "tile"}>
            <div className="tl">{m.label}</div>
            <div className="tv">
              <Receipt math={m.math} title={m.label}>
                <CountUp value={m.value} />
              </Receipt>
              {m.delta && <span className={`dlt ${m.delta.dir}`}>{m.delta.text}</span>}
            </div>
            {m.spark && <BreakSpark viz={m.spark} />}
            <div className="mean"><Html text={m.meaning} /></div>
            {(m.id === "revenue" || m.id === "customers") && (
              <div className="tfoot">
                <ConfidencePill
                  confidence={m.confidence}
                  label={m.id === "customers" ? "Moderate · attribution" : `${m.confidenceLabel} confidence`}
                />
              </div>
            )}
          </Reveal>
        ))}
      </div>

      {band && (
        <>
          <div className="eyebrow">The band ahead — two weeks, honestly ranged</div>
          <div className="eyebrow-sub">where your revenue most likely lands — a range, on purpose</div>
          <Reveal i={6}>
            <article className="mcard open il-card">
              <VizView viz={{
                kind: "fan",
                history: band.history,
                mid: band.mid, hi: band.hi, lo: band.lo,
                hiLabel: money(band.hi14), loLabel: money(band.lo14),
              }} />
              <div className="il-row-sub" style={{ marginTop: 8 }}>
                <Receipt title="the band ahead — the math" math={{
                  methodPlain: "Each day is first divided by its weekday factor, so your weekly rhythm is modeled as structure rather than noise; an AR(1) fit on that adjusted series produces the fan, re-seasonalized day by day. The residual scale uses a robust estimator (median-based), so one promo spike or refund day cannot widen every future day's band. The 14-day total's band comes from 2,000 seeded simulated paths — never from summing daily extremes, and the same ledger always draws the same band.",
                  keyStatPlain: `Next 14 days: ${money(band.lo14)}–${money(band.hi14)} is the planning band — 8 in 10 simulated paths land inside. The wider 95% range is ${money(band.lo14w)}–${money(band.hi14w)}; tail weeks are real, so it is shown, not hidden.`,
                  keyStatNotation: `weekday-adjusted AR(1) · ${band.sigmaMethod === "robust" ? "robust (MAD) residual scale" : "OLS residual scale"} · seeded 2,000-path totals · 80% planning / 95% disclosed`,
                  citation: { method: "AR(1) banded forecast, weekday-adjusted", source: "your daily revenue" },
                }}>
                  <span>Next 14 days: <b>{money(band.lo14)}–{money(band.hi14)}</b> — 8 in 10 paths land here; the tails live in the receipt.</span>
                </Receipt>
              </div>
            </article>
          </Reveal>
        </>
      )}

      <div className="eyebrow">Watching · not ready to call</div>
      <div className="eyebrow-sub">signals forming — named early, judged only when the data is enough</div>
      <Reveal i={7}>
        <div className="watch">
          {brief.watching.map((w) => (
            <div className="w" key={w.id}>
              <span className="pill lite-none"><span className="dot breathe" />{w.pillLabel}</span>
              <div className="wtxt"><Html text={w.text} /></div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* The hub — every deep section, one grid. Fixes discovery. */}
      <div className="fleuron" aria-hidden="true">◆</div>
      <div className="eyebrow">Go deeper</div>
      <Reveal i={9}>
        <div className="hub-grid">
          <button className="hub-card" onClick={() => nav("/insights")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 3v6L4 20a1.5 1.5 0 0 0 1.4 2h13.2a1.5 1.5 0 0 0 1.4-2L15 9V3M7 3h10" /></svg>
            <span className="hc-t">Insights Lab</span>
            <span className="hc-s">nine deep reads</span>
          </button>
          <button className="hub-card" onClick={() => nav("/money")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
            <span className="hc-t">Money</span>
            <span className="hc-s">calendar · AR · tax pot</span>
          </button>
          <button className="hub-card" onClick={() => nav("/ops")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5m0 0l9-5m-9 5v8" /></svg>
            <span className="hc-t">Stock &amp; shipping</span>
            <span className="hc-s">cover · reorders · stalls</span>
          </button>
          <button className="hub-card" onClick={() => nav("/decisions")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            <span className="hc-t">Decisions{toGrade > 0 && <span className="hc-badge">{toGrade} to grade</span>}</span>
            <span className="hc-s">the track record</span>
          </button>
          <button className="hub-card" onClick={() => nav("/marketing")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11l18-8-8 18-2.5-7.5z" /></svg>
            <span className="hc-t">Marketing</span>
            <span className="hc-s">channels · post lift</span>
          </button>
        </div>
      </Reveal>

      <div className="sources">
        <div className="srcs">
          {brief.sources.map((s) => (
            <span className="src-chip" key={s.id}><b>◆</b> {s.name}</span>
          ))}
        </div>
        <div className="privacy">{SHIELD} Private</div>
      </div>
      {basis && (
        <div className="basis-foot">
          {basis.line}
          {basis.flags.length > 0 && <span className="basis-foot-flag"> · △ {basis.flags[0]}</span>}
        </div>
      )}
    </div>
  );
}
