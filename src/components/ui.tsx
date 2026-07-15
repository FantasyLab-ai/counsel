import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
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
