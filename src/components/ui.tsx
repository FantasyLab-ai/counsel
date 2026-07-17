import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Confidence } from "../api/counsel";

/** Render trusted mock copy that carries <b>/<em> emphasis. All strings come
 *  from our own api layer (mockData), never from user input. */
export function Html({ text, className }: { text: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: text }} />;
}

/** Staggered entrance wrapper — pass an index; children rise in like a page
 *  being laid on the desk. Once per mount, ~40ms apart. */
export function Reveal({ i = 0, children, className }: { i?: number; children: ReactNode; className?: string }) {
  return (
    <div className={`reveal ${className ?? ""}`} style={{ ["--rd" as string]: `${i * 45}ms` }}>
      {children}
    </div>
  );
}

const CITE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

const PILL_CLASS: Record<Confidence, string> = {
  high: "lite-hi",
  moderate: "lite-mod",
  insufficient: "lite-none",
  forecast: "lite-fc",
};

export function ConfidencePill({
  confidence,
  label,
  breathe,
}: {
  confidence: Confidence;
  label: string;
  breathe?: boolean;
}) {
  return (
    <span className={`pill ${PILL_CLASS[confidence]}`}>
      <span className={`dot ${breathe ? "breathe" : ""}`} />
      {label}
    </span>
  );
}

export function CitePill({ text }: { text: string }) {
  return (
    <span className="pill lite-cite">
      {CITE_ICON}
      {text}
    </span>
  );
}

/** Count-up number — mono tabular digits settle in ~380ms. Non-numeric parts
 *  of the string are preserved ("$61,200" / "34%" / "7 mo"). */
export function CountUp({ value, className = "num" }: { value: string; className?: string }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    // Re-run on every value change (period filters, fresh syncs) — a stale
    // number wearing a fresh delta is the worst kind of wrong.
    setDisplay(value);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const m = value.match(/([\d,]+(?:\.\d+)?)/);
    if (!m) return;
    const target = parseFloat(m[1].replace(/,/g, ""));
    if (!isFinite(target) || target === 0) return;
    const hasCommas = m[1].includes(",");
    const start = performance.now();
    const dur = 380;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      let cur = Math.round(target * eased);
      let curStr = hasCommas ? cur.toLocaleString("en-US") : String(cur);
      setDisplay(value.replace(m[1], curStr));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{display}</span>;
}

// ActOn — the insight -> decision bridge. One tap turns a computed insight
// into a tracked decision (status: considering) with the expected outcome
// pre-filled. The tracker grades it later; that loop is the product.
import { trackFromInsight } from "../engine/decisions";

export function ActOn({ source, action, expected, impact }: {
  source: string; action: string; expected: string; impact?: number;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={`acton ${done ? "done" : ""}`}
      disabled={done}
      onClick={() => { trackFromInsight(source, action, expected, impact); setDone(true); }}
    >
      {done ? "✓ on the board — grade it when the window closes" : `→ Track it: ${action}`}
    </button>
  );
}

// Awaiting — the live-mode replacement for a demo fixture. In a live
// business's app, a section that needs data they haven't connected says so
// honestly instead of borrowing the showroom's numbers.
export function Awaiting({ title, needs, unlocks }: { title: string; needs: string; unlocks: string }) {
  return (
    <article className="mcard open il-card awaiting">
      <div className="il-head">
        <span className="il-kick">{title}</span>
        <span className="pill lite-fc"><span className="dot" />awaiting your data</span>
      </div>
      <div className="mmean">This reads <b>{needs}</b> — not connected yet. {unlocks}</div>
      <button className="acton" onClick={() => window.location.assign("/power")}>
        → Connect it in Power Up
      </button>
    </article>
  );
}

// Written — the advisor's voice appears as if being written in real time:
// each letter arrives with a soft ink-fade (opacity + blur + a breath of
// rise). Tag-aware for the <em>/<b> the voice uses; words never break
// mid-flow because letters wrap in word-level nowrap spans. Honors
// prefers-reduced-motion (CSS renders everything instantly).
export function Written({ text, mode = "letters", startDelay = 0 }: {
  text: string; mode?: "letters" | "words"; startDelay?: number;
}) {
  const html = useMemo(() => {
    const step = mode === "letters" ? 26 : 60; // ms between arrivals
    let t = startDelay;
    const render = (s: string): string =>
      s.split(/(<[^>]+>)/g).map((tok) => {
        if (!tok) return "";
        if (tok.startsWith("<")) return tok; // pass tags through untouched
        return tok.split(/(\s+)/).map((word) => {
          if (!word.trim()) return word;
          if (mode === "words") {
            const d = t; t += step;
            return `<span class="wr" style="animation-delay:${d}ms">${word}</span>`;
          }
          const letters = [...word].map((ch) => {
            const d = t; t += step;
            return `<span class="wr" style="animation-delay:${d}ms">${ch}</span>`;
          }).join("");
          return `<span class="wr-word">${letters}</span>`;
        }).join("");
      }).join("");
    return render(text);
  }, [text, mode, startDelay]);
  return <span className="written" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---- The universal receipt gesture -----------------------------------------
// Receipt wraps ANY displayed number/claim; tapping opens the MathSheet — the
// method card: what was computed, over what window, under what assumptions.
// This is "show the math" as a physical gesture, app-wide.
import type { MathBlock } from "../api/counsel";

export function MathSheet({ block, title, onClose }: { block: MathBlock; title?: string; onClose: () => void }) {
  return (
    <div className="sheet-veil" role="dialog" aria-label="The math"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-grab" aria-hidden="true" />
        <div className="digest-head">
          <span className="il-kick">{title ?? "the math"}</span>
          <button className="dt-btn" onClick={onClose}>close</button>
        </div>
        <div className="sheet-body">
          <div className="sheet-lbl">method, plainly</div>
          <p className="sheet-p">{block.methodPlain}</p>
          <div className="sheet-lbl">the key figure</div>
          <p className="sheet-p"><b>{block.keyStatPlain}</b></p>
          {block.extraPlain && <p className="sheet-p">{block.extraPlain}</p>}
          {block.viz?.kind === "arithmetic" && (
            <div className="sheet-arith">
              {block.viz.lines.map((l, i) => (
                <div className={`sa-line ${l.kind ?? ""}`} key={i}>{l.op && <span className="sa-op">{l.op}</span>}{l.text}</div>
              ))}
            </div>
          )}
          <div className="sheet-notation">{block.keyStatNotation}</div>
          <div className="il-cite">{block.citation.method} · {block.citation.source}{block.citation.reference ? ` · ${block.citation.reference}` : ""}</div>
        </div>
      </div>
    </div>
  );
}

export function Receipt({ math, title, children }: { math?: MathBlock; title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!math) return <>{children}</>;
  return (
    <>
      <button className="receipt" onClick={() => setOpen(true)} title="Show the math">
        {children}
        <span className="receipt-mark" aria-hidden="true">≡</span>
      </button>
      {open && <MathSheet block={math} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

// ShareCard — a finding becomes a hand-set card (canvas, no deps) the owner
// can post. Quiet chip; the card carries the receipt and the standing line.
import { shareReceiptCard, type ReceiptCardOpts } from "../engine/receiptCard";

export function ShareCard(opts: ReceiptCardOpts) {
  const [busy, setBusy] = useState(false);
  return (
    <button className="share-chip" disabled={busy}
      onClick={async () => { setBusy(true); try { await shareReceiptCard(opts); } finally { setBusy(false); } }}
      title="Share this finding as a card">
      {busy ? "…" : "share ↗"}
    </button>
  );
}
