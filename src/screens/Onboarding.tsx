// Onboarding — five taps to the first aha: welcome → what you sell →
// trust-forward connect → the WORKING MOMENT (real method names checking
// off; never a generic spinner) → the first cited finding.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PERSONA_GROUPS, PERSONAS, setBusinessName, setPersona } from "../engine/persona";

const ARROW = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
);

function markVisited(): void {
  try {
    localStorage.setItem("counsel.visited", "1");
  } catch { /* fine */ }
}
const ANALYZE_STEPS = [
  "Loaded 41 days of payments",
  "Scanning for structural changes",
  "Checking margins & cash",
  "Writing your first brief",
];

export default function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [who, setWho] = useState("maker");
  const [bizName, setBizName] = useState("");
  const persona = PERSONAS.find((p) => p.id === who)!;
  const [done, setDone] = useState(0); // analyzing checklist progress

  const isPaper = step === 2 || step === 3;

  // The working moment: methods check off sequentially, then auto-advance.
  useEffect(() => {
    if (step !== 4) return;
    setDone(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    ANALYZE_STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setDone(i + 1), 500 + i * 650));
    });
    timers.push(setTimeout(() => setStep(5), 500 + ANALYZE_STEPS.length * 650 + 700));
    return () => timers.forEach(clearTimeout);
  }, [step]);

  return (
    <div className="ob">
      <div className={`prog ${isPaper ? "on-paper" : ""}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <div className={`segp ${step >= n ? "done" : ""}`} key={n}><span className="fill" /></div>
        ))}
      </div>

      {step === 1 && (
        <section className="step dark active">
          <div className="brandmark">◆ Counsel <span>by Aurora</span></div>
          <div className="content">
            <div className="kick">Welcome</div>
            <h1 className="big">The honest financial advisor for <em>your business.</em></h1>
            <p className="lede">
              Counsel reads your real numbers the way a seasoned CFO would — tells you what changed, what it means,
              and when it isn't sure. <b>Receipts, not narratives:</b> every insight carries the method and the
              confidence behind it. Takes about a minute.
            </p>
          </div>
          <button className="btn" onClick={() => setStep(2)}>Get started {ARROW}</button>
        </section>
      )}

      {step === 2 && (
        <section className="step paper active">
          <div className="content top">
            <div className="kick paper">About you · 1 of 3</div>
            <h1 className="big">First — what do you <em>run?</em></h1>
            <p className="lede">This tailors what I lead with, and which of your tools to read first.</p>
            <div className="field-lbl">Business name</div>
            <input
              className="ob-name-input"
              placeholder="e.g. Kiln & Co."
              value={bizName}
              maxLength={60}
              onChange={(e) => setBizName(e.target.value)}
            />
            <div className="field-lbl">Your line of work</div>
            <div className="persona-scroll">
              {PERSONA_GROUPS.map((g) => (
                <div key={g}>
                  <div className="pg-label">{g}</div>
                  <div className="chips">
                    {PERSONAS.filter((p) => p.group === g).map((p) => (
                      <button className={`chip ${who === p.id ? "sel" : ""}`} key={p.id} onClick={() => setWho(p.id)}>
                        {p.icon} {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="ob-persona-note">
              <b>{persona.label}:</b> you likely live in {persona.systems}. I'll start with{" "}
              {persona.leadInsight}.
            </div>
          </div>
          <button className="btn" onClick={() => { setPersona(who); if (bizName.trim()) setBusinessName(bizName); setStep(3); }}>
            Continue {ARROW}
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="step paper active">
          <div className="content top">
            <div className="kick paper">Connect · 2 of 3</div>
            <h1 className="big">Connect your <em>payments</em> to begin.</h1>
            <p className="lede">Stripe is the fastest way to start — it's where the story of your revenue lives.</p>
            <div className="connect-card">
              <div className="cc-head">
                <div className="cc-logo">S</div>
                <div>
                  <div className="ccn">Stripe</div>
                  <div className="ccs">Payments &amp; payouts</div>
                </div>
              </div>
              <div className="trust">
                <div className="t">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><line x1="4" y1="4" x2="20" y2="20" /></svg>
                  <span><b>Read-only.</b> Counsel can never move money or make changes.</span>
                </div>
                <div className="t">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <span><b>Bank-level encryption.</b> You log in on Stripe — we never see your password.</span>
                </div>
                <div className="t">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64A9 9 0 1 1 5.64 6.64M12 2v10" /></svg>
                  <span><b>Disconnect anytime.</b> Never sold, never used to train anything.</span>
                </div>
              </div>
            </div>
          </div>
          {/* TODO(PHASE 2): real Stripe OAuth. This button is a prototype stub. */}
          <button className="btn" onClick={() => setStep(4)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Connect Stripe securely
          </button>
          <div className="subbtn">Prefer another tool? Connect Shopify or Square instead.</div>
        </section>
      )}

      {step === 4 && (
        <section className="step dark active">
          <div className="content">
            <div className="orbit" />
            <div className="analyzing-h">Reading your last 41 days…</div>
            <div className="analyzing-s">Running the real math — this is Aurora at work.</div>
            <div className="checklist">
              {ANALYZE_STEPS.map((s, i) => (
                <div className={`ci ${done > i ? "done" : ""}`} key={s}>
                  <div className="box">{CHECK}</div>
                  <span className="cl">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="step dark active">
          <div className="content">
            <div className="kick">Your first finding</div>
            <h1 className="big">Found it — revenue <em>structurally changed</em> on March 4.</h1>
            <svg className="insight-spark" viewBox="0 0 340 64" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#7fce9f" stopOpacity=".28" />
                  <stop offset="1" stopColor="#7fce9f" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="draw" style={{ ["--len" as string]: 300 }} d="M0,22 L34,18 L68,24 L102,17 L136,21 L170,22" fill="none" stroke="#9CA79B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="170" y1="6" x2="170" y2="60" stroke="#cdae7e" strokeWidth="1.4" strokeDasharray="3 3" className="reveal" style={{ ["--rd" as string]: "450ms" }} />
              <circle cx="170" cy="22" r="3.8" fill="#cdae7e" className="pop" style={{ ["--rd" as string]: "560ms" }} />
              <path className="draw" style={{ ["--len" as string]: 300, ["--rd" as string]: "520ms" }} d="M170,22 L204,38 L238,44 L272,40 L306,46 L340,43" fill="none" stroke="#7fce9f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M170,22 L204,38 L238,44 L272,40 L306,46 L340,43 L340,64 L170,64 Z" fill="url(#ig)" className="reveal" style={{ ["--rd" as string]: "700ms" }} />
            </svg>
            <div className="chips-row">
              <span className="pill conf-hi"><span className="dot" />High confidence</span>
              <span className="pill cite-dark">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>
                change-point · p&lt;0.01
              </span>
            </div>
            <div className="insight-note">
              This is the kind of thing I'll surface every morning — in plain English, with the math behind it.
              For your {persona.label.toLowerCase()}: {persona.leadInsight}.
            </div>
          </div>
          <div className="ob-cta-row">
            <button className="btn brass" onClick={() => { markVisited(); nav("/power"); }}>Load MY data now (on-device) {ARROW}</button>
            <button className="btn ghost" onClick={() => { markVisited(); nav("/"); }}>Explore with demo data first</button>
          </div>
        </section>
      )}
    </div>
  );
}
