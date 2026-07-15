// Ask — the conversational CFO. Every answer shows what was CHECKED, leads
// with a serif verdict, carries confidence + citation, can show its math,
// and honestly refuses when the data isn't there. Typing indicator = the
// "working" moment; answers are grounded, never vibes.

import { useEffect, useRef, useState } from "react";
import { ask, getSeededAsk, type AskAnswer } from "../api/counsel";
import { CitePill, ConfidencePill, Html } from "../components/ui";
import { VizView } from "../components/charts";

type Turn = { kind: "q"; text: string } | { kind: "a"; a: AskAnswer } | { kind: "thinking" };

const SEED_QUESTIONS = [
  "Can I afford to hire a part-time helper at $1,400/mo?",
  "So will next month bounce back?",
];
const PROMPTS = ["Which product should I restock first?", "Is my pricing too low?", "What's my slowest day?"];

function Answer({ a }: { a: AskAnswer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`a ${open ? "open" : ""}`}>
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
          {a.followups.map((f) => <span className="fu" key={f}>{f}</span>)}
        </div>
      )}
    </div>
  );
}

export default function Ask() {
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

  async function submit(q: string) {
    const question = q.trim();
    if (!question) return;
    setInput("");
    setTurns((t) => [...t, { kind: "q", text: question }, { kind: "thinking" }]);
    const a = await ask(question);
    setTurns((t) => [...t.filter((x) => x.kind !== "thinking"), { kind: "a", a }]);
  }

  return (
    <>
      <div className="ask-head">
        <div className="ht">
          <h1>Ask</h1>
          <p>Grounded in your data</p>
        </div>
        <div className="sp" />
        <div className="avatar">B</div>
      </div>

      <div className="thread">
        <div className="sysnote">
          Ask anything about <b>Kiln &amp; Co.</b> I answer from your real numbers — and I'll tell you when I'm not sure.
        </div>
        {turns.map((t, i) =>
          t.kind === "q" ? (
            <div className="q" key={i}>{t.text}</div>
          ) : t.kind === "thinking" ? (
            <div className="a thinking" key={i} aria-label="Counsel is checking your numbers">
              <i /><i /><i />
            </div>
          ) : (
            <Answer a={t.a} key={i} />
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
