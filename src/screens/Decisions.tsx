// The Decisions Tracker — an Asana-style board for business decisions:
// considering → testing → grading → graded. Add your own, advance them,
// grade them against the numbers, drop them. Everything persists on-device.
// The "Was it worth it?" engine (Plan) is the measuring stick for grading.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDecision, board, deleteDecision, gradeDecision, isOverdue, setStatus, stats,
  type Decision, type DecisionStatus, type Verdict,
} from "../engine/decisions";
import { money } from "../engine/tierMath";
import { Reveal } from "../components/ui";

const COLUMNS: { id: DecisionStatus; title: string; hint: string }[] = [
  { id: "considering", title: "Considering", hint: "rehearse it in Plan first" },
  { id: "testing", title: "Testing", hint: "the change is live — let it run" },
  { id: "grading", title: "Grading soon", hint: "window closing — judge against the numbers" },
  { id: "graded", title: "Graded", hint: "the track record" },
];
const NEXT: Partial<Record<DecisionStatus, DecisionStatus>> = {
  considering: "testing",
  testing: "grading",
};

function AddForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState("");
  const [expected, setExpected] = useState("");
  const [impact, setImpact] = useState("");
  const [days, setDays] = useState(30);
  if (!open) {
    return (
      <button className="dbtn primary dt-add" onClick={() => setOpen(true)}>+ Track a decision</button>
    );
  }
  return (
    <article className="mcard open il-card">
      <div className="il-kick" style={{ marginBottom: 8 }}>New decision</div>
      <input className="dt-input" placeholder="What are you doing? e.g. Raising mug price 8%"
             value={action} maxLength={140} onChange={(e) => setAction(e.target.value)} />
      <input className="dt-input" placeholder="What do you expect? e.g. revenue holds, volume −5% max"
             value={expected} maxLength={200} onChange={(e) => setExpected(e.target.value)} />
      <input className="dt-input" type="number" inputMode="decimal" placeholder="$ at stake per month (optional)"
             value={impact} onChange={(e) => setImpact(e.target.value)} />
      <div className="dt-days">
        <span>Judge it in</span>
        {[14, 30, 60].map((d) => (
          <button key={d} className={`seg ${days === d ? "on" : ""}`} onClick={() => setDays(d)}>{d} days</button>
        ))}
      </div>
      <div className="dropin-row">
        <button className="dbtn primary" disabled={!action.trim()}
          onClick={() => {
            addDecision(action, expected, days, "considering",
              impact.trim() ? { expectedImpact: parseFloat(impact) } : undefined);
            setAction(""); setExpected(""); setImpact(""); setOpen(false); onAdded();
          }}>
          Add to board
        </button>
        <button className="dbtn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </article>
  );
}

function GradeBox({ d, onDone }: { d: Decision; onDone: () => void }) {
  const [verdict, setVerdict] = useState<Verdict>("held");
  const [note, setNote] = useState("");
  return (
    <div className="dt-grade">
      <div className="dt-days" style={{ marginTop: 0 }}>
        {(["held", "mixed", "missed"] as Verdict[]).map((v) => (
          <button key={v} className={`seg ${verdict === v ? "on" : ""}`} onClick={() => setVerdict(v)}>{v}</button>
        ))}
      </div>
      <input className="dt-input" placeholder="What actually happened? (check Was it worth it? in Plan)"
             value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      <div className="dropin-row">
        <button className="dbtn primary" onClick={() => { gradeDecision(d.id, verdict, note || "graded by owner"); onDone(); }}>
          Save grade
        </button>
      </div>
    </div>
  );
}

export default function Decisions() {
  const nav = useNavigate();
  const [, force] = useState(0);
  const refresh = () => force((x) => x + 1);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const b = board();
  const s = stats();

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">Kiln &amp; Co. · the track record</div>
          <h1>Decisions</h1>
        </div>
        <div className="avatar">B</div>
      </div>

      <Reveal i={0}>
        <section className="voice">
          <div className="eyebrow on-dark">Why this exists</div>
          <div className="said">Every call gets <em>graded.</em></div>
          <div className="sub">
            Log a decision, let it run, then judge it against the numbers — not against memory.
            {s.heldRate !== null && <> So far: <b style={{ color: "#d8c19a" }}>{Math.round(s.heldRate * 100)}% held</b> of {s.graded} graded.</>}
          </div>
          <div className="micro">
            <div className="m"><div className="ml">open</div><div className="mv">{s.open}</div></div>
            <div className="m"><div className="ml">at stake</div><div className="mv">{s.atStake > 0 ? money(s.atStake) : "—"}</div></div>
            <div className="m"><div className="ml">held</div><div className="mv">{s.held}/{s.graded}</div></div>
          </div>
        </section>
      </Reveal>

      <Reveal i={1}><AddForm onAdded={refresh} /></Reveal>

      {COLUMNS.map((col, ci) => (
        b[col.id].length > 0 && (
          <div key={col.id}>
            <div className="eyebrow">{col.title} · {b[col.id].length} <span className="dt-hint">— {col.hint}</span></div>
            <Reveal i={ci + 2}>
              <article className="mcard open il-card">
                {b[col.id].map((d) => (
                  <div className="dt-row" key={d.id}>
                    <div className="dt-main">
                      <div className="dt-action">
                        {d.action}
                        {isOverdue(d) && <span className="hc-badge grade">grade me</span>}
                      </div>
                      <div className="dl-expected">
                        expected: {d.expected}
                        {d.expectedImpact != null && <> · <b>{money(d.expectedImpact)}</b> at stake</>}
                      </div>
                      <div className="dt-meta">
                        logged {d.loggedAt} · {d.status === "graded" ? "closed" : `judge by ${d.gradeAt}`}
                        {d.source && <> · from {d.source}</>}
                      </div>
                      {d.grade && (
                        <div className="dl-note">
                          <span className={`pill lite-${d.grade.verdict === "held" ? "hi" : d.grade.verdict === "mixed" ? "mod" : "none"}`} style={{ marginRight: 8 }}>
                            <span className="dot" />{d.grade.verdict}
                          </span>
                          {d.grade.note}
                        </div>
                      )}
                      {gradingId === d.id && <GradeBox d={d} onDone={() => { setGradingId(null); refresh(); }} />}
                    </div>
                    <div className="dt-actions">
                      {NEXT[d.status] && (
                        <button className="dt-btn" title={`Move to ${NEXT[d.status]}`}
                          onClick={() => { setStatus(d.id, NEXT[d.status]!); refresh(); }}>
                          → {NEXT[d.status]}
                        </button>
                      )}
                      {d.status !== "graded" && (
                        <button className="dt-btn brass" onClick={() => setGradingId(gradingId === d.id ? null : d.id)}>
                          grade
                        </button>
                      )}
                      <button className="dt-btn danger" onClick={() => { deleteDecision(d.id); refresh(); }}>drop</button>
                    </div>
                  </div>
                ))}
              </article>
            </Reveal>
          </div>
        )
      ))}

      <Reveal i={7}>
        <div className="reassure">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          Grading tip: run <b style={{ cursor: "pointer" }} onClick={() => nav("/plan")}>“Was it worth it?”</b> on
          your decision date first — grade with the math, not the memory. Auto-grading lands with connectors.
        </div>
      </Reveal>
    </div>
  );
}
