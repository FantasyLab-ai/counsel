// Ask — the conversational CFO. Every answer shows what was CHECKED, leads
// with a serif verdict, carries confidence + citation, can show its math,
// and honestly refuses when the data isn't there. Typing indicator = the
// "working" moment; answers are grounded, never vibes.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { displayName } from "../engine/persona";
import { ask, getSeededAsk, type AskAnswer } from "../api/counsel";
import { CitePill, ConfidencePill, Html } from "../components/ui";
import { VizView } from "../components/charts";
import { route, type DerivedSummary, type RouteDecision } from "../engine/router";

type Turn =
  | { kind: "q"; text: string }
  | { kind: "a"; a: AskAnswer; decision?: RouteDecision }
  | { kind: "thinking" }
  | { kind: "disclosure"; d: DerivedSummary; decision: RouteDecision };

/** The privacy boundary made visible: exactly what a cloud call would carry. */
function Disclosure({ d, onSend, onLocal }: { d: DerivedSummary; onSend: () => void; onLocal: () => void }) {
  return (
    <div className="a disclosure">
      <div className="checked"><span className="cl">Before I go online</span></div>
      <div className="verdict">This one's better answered by the <em>cloud model.</em></div>
      <div className="abody">
        To do that, I'd send <b>these figures and your question — nothing else.</b> No
        transactions, no customers, no account names. You decide.
      </div>
      <div className="disclose-box">
        {d.figures.map((f) => (
          <div className="dline" key={f.label}>
            <span className="dl">{f.label}</span>
            <span className="dv">{f.value}</span>
          </div>
        ))}
        <div className="dline dq"><span className="dl">your question</span><span className="dv">“{d.question}”</span></div>
      </div>
      <div className="disclose-actions">
        <button className="dbtn primary" onClick={onSend}>Send those figures</button>
        <button className="dbtn" onClick={onLocal}>Keep it on this device</button>
      </div>
    </div>
  );
}

function RouteBadge({ decision }: { decision?: RouteDecision }) {
  if (!decision) return null;
  const onDevice = decision.runWhere !== "cloud";
  return (
    <div className={`route-badge ${onDevice ? "device" : "cloud"}`} title={decision.reason}>
      {onDevice ? "● answered on this device" : "◌ answered via cloud · approved figures only"}
    </div>
  );
}

const SEED_QUESTIONS = [
  "Can I afford to hire a part-time helper at $1,400/mo?",
  "So will next month bounce back?",
];
// Follow-ups the cloud model may suggest — every one verified answerable
// by the on-device router, so a suggested chip never dead-ends.
const CLOUD_FOLLOWUP_MENU = [
  "Can I afford a helper at $1,400/mo?",
  "What's my slowest day?",
  "What should I staff each day?",
  "Should I raise prices?",
];
const PROMPTS = ["Which product should I restock first?", "Is my pricing too low?", "What's my slowest day?"];

function Answer({ a, decision, onAsk }: { a: AskAnswer; decision?: RouteDecision; onAsk?: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`a ${open ? "open" : ""}`}>
      <RouteBadge decision={decision} />
      <div className="checked">
        <span className="cl">Checked</span>
        {a.checked.map((c) => <span className="schip" key={c}>{c}</span>)}
      </div>
      <div className="verdict"><Html text={a.verdict} /></div>
      <div className="abody"><Html text={a.body} /></div>
      {a.math?.viz && a.confidence === "forecast" && <VizView viz={a.math.viz} />}
      {a.math?.viz && a.id === "ask-hire" && (
        <>
          <button className="mtoggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span>Show the math</span>
            <span className="chev" style={{ transform: open ? "rotate(180deg)" : undefined }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 9l6 6 6-6" /></svg>
            </span>
          </button>
          {open && <VizView viz={a.math.viz} />}
        </>
      )}
      {a.honestNote && <div className="honest-note">{a.honestNote}</div>}
      <div className="arow">
        <ConfidencePill confidence={a.confidence} label={a.confidenceLabel ?? a.confidence} />
        {a.citationChip && <CitePill text={a.citationChip} />}
      </div>
      {a.followups.length > 0 && (
        <div className="followups" style={{ marginTop: 14 }}>
          {a.followups.map((f) => (
            <button type="button" className="fu" key={f} onClick={() => onAsk?.(f)}>{f}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Ask() {
  const nav = useNavigate();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let on = true;
    getSeededAsk().then((seed) => {
      if (!on) return;
      const t: Turn[] = [];
      seed.forEach((a, i) => {
        t.push({ kind: "q", text: SEED_QUESTIONS[i] ?? "…" });
        t.push({ kind: "a", a });
      });
      setTurns(t);
    });
    return () => { on = false; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function runLocal(question: string, decision: RouteDecision) {
    setTurns((t) => [...t.filter((x) => x.kind !== "disclosure"), { kind: "thinking" }]);
    const a = await ask(question);
    setTurns((t) => [...t.filter((x) => x.kind !== "thinking"), { kind: "a", a, decision }]);
  }

  async function runCloud(question: string, decision: RouteDecision, d: DerivedSummary) {
    setTurns((t) => [...t.filter((x) => x.kind !== "disclosure"), { kind: "thinking" }]);
    try {
      const { cloudAsk } = await import("../engine/cloudSync");
      const r = await cloudAsk(question, d.figures, CLOUD_FOLLOWUP_MENU);
      const a: AskAnswer = {
        id: `cloud-${Date.now()}`,
        headline: question,
        confidence: "moderate",
        confidenceLabel: "Cloud model · aggregates only",
        checked: d.figures.map((f) => f.label),
        verdict: r.verdict,
        body: r.body,
        honestNote: "Answered by the cloud model from the figures you approved — nothing else left this device.",
        followups: r.followups,
      };
      setTurns((t) => [...t.filter((x) => x.kind !== "thinking"), { kind: "a", a, decision }]);
    } catch (e) {
      // The honest fallback: cloud failed, so answer locally and say so.
      const a = await ask(question);
      const honest: AskAnswer = {
        ...a,
        honestNote: `Cloud call didn't go through (${String(e instanceof Error ? e.message : e).slice(0, 90)}) — this is the on-device answer instead.`,
      };
      setTurns((t) => [
        ...t.filter((x) => x.kind !== "thinking"),
        { kind: "a", a: honest, decision: { ...decision, runWhere: "device-limited", reason: "cloud unavailable — answered on-device" } },
      ]);
    }
  }

  async function submit(q: string) {
    const question = q.trim();
    if (!question) return;
    setInput("");
    setTurns((t) => [...t, { kind: "q", text: question }]);

    // Action requests aren't questions: "connect a source", "load more
    // data" — those go to Power Up, not to a model.
    const ACTION_RE = /\b(connect|link|hook ?up)\b.*\b(source|bank|data|square|stripe|shopify|etsy|quickbooks)\b|what (do|should) i connect|connect (another|a) source|\b(load|import|upload|drop|add)\b.*\b(data|csv|file|statement|receipt|expense)|load more data|go live/i;
    if (ACTION_RE.test(question)) {
      const a: AskAnswer = {
        id: `act-${Date.now()}`,
        headline: question,
        confidence: "moderate",
        confidenceLabel: "Action",
        checked: ["Power Up"],
        verdict: "That's a doing thing — <em>let's go do it.</em>",
        body: "Connecting sources and dropping in files both live on Power Up. Taking you there now — the guided walk starts at the top, the file drop is just below it.",
        honestNote: "",
        followups: [],
      };
      setTurns((t) => [...t, { kind: "a", a }]);
      setTimeout(() => nav("/power"), 1100);
      return;
    }

    // Ask v2: the intent router first. If a REAL engine can answer this
    // question with computed numbers, it stays on-device — no cloud consent
    // needed, because nothing would leave.
    setTurns((t) => [...t, { kind: "thinking" }]);
    const routed = await import("../engine/askRouter").then((r) => r.routeAsk(question)).catch(() => null);
    if (routed) {
      const decision: RouteDecision = { task: "ask-known", runWhere: "device", reason: "matched a computed analysis — answered by the engine, on-device" };
      setTurns((t) => [...t.filter((x) => x.kind !== "thinking"), { kind: "a", a: routed, decision }]);
      return;
    }
    setTurns((t) => t.filter((x) => x.kind !== "thinking"));

    const decision = await route(question);
    if (decision.runWhere === "cloud" && decision.disclosure) {
      // The transparency step: show what would be sent, let the user choose.
      setTurns((t) => [...t, { kind: "disclosure", d: decision.disclosure!, decision }]);
      return;
    }
    await runLocal(question, decision);
  }

  return (
    <>
      <div className="ask-head">
        <div className="ht">
          <h1>Ask</h1>
          <p>Grounded in your data</p>
        </div>
        <div className="sp" />
        <button className="ask-close" aria-label="Close Ask" onClick={() => nav(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="thread">
        <div className="sysnote">
          Ask anything about <b>{displayName()}</b> I answer from your real numbers — and I'll tell you when I'm not sure.
        </div>
        {turns.map((t, i) =>
          t.kind === "q" ? (
            <div className="q" key={i}>{t.text}</div>
          ) : t.kind === "thinking" ? (
            <div className="a thinking" key={i} aria-label="Counsel is checking your numbers">
              <i /><i /><i />
            </div>
          ) : t.kind === "disclosure" ? (
            <Disclosure
              key={i}
              d={t.d}
              onSend={() => runCloud(t.d.question, t.decision, t.d)}
              onLocal={() =>
                runLocal(t.d.question, { ...t.decision, runWhere: "device-limited", reason: "user chose to keep it on-device" })
              }
            />
          ) : (
            <Answer a={t.a} decision={t.decision} onAsk={submit} key={i} />
          )
        )}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <div className="prompts">
          {PROMPTS.map((p) => (
            <button className="prompt" key={p} onClick={() => submit(p)}>
              <span className="pi">↗</span>{p}
            </button>
          ))}
        </div>
        <form
          className="field"
          onSubmit={(e) => { e.preventDefault(); submit(input); }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your business…"
            aria-label="Ask about your business"
          />
          <button className="go" type="submit" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </form>
      </div>
    </>
  );
}
