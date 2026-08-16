// The visual grammar: every math shape from the design, as small SVG/DOM
// renderers. The break line (brass dashed + node) is the hero device and
// draws itself in — the moment of "discovery" made visible.

import type {
  ArithmeticViz,
  AttributionViz,
  BandViz,
  BreaklineViz,
  CushionViz,
  FanViz,
  MathBlock,
  TrendViz,
  Viz,
} from "../api/counsel";
import { Html } from "./ui";

const CITE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

function toPath(values: number[], x0: number, x1: number, w: number): string {
  const n = values.length;
  const step = (x1 - x0) / Math.max(1, n - 1);
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${(x0 + i * step).toFixed(1)},${v.toFixed(1)}`).join(" ");
}

/** Dashboard sparkline: grey before, brass break line + node, forest after. */
export function BreakSpark({ viz, height = 40 }: { viz: BreaklineViz; height?: number }) {
  const W = 340;
  const mid = W / 2;
  const beforeY = viz.before;
  const afterY = viz.after;
  const scale = (v: number) => (v / 60) * height + 4;
  const bPath = toPath(beforeY.map(scale), 0, mid, W);
  const lastB = scale(beforeY[beforeY.length - 1]);
  const aPath = `M${mid},${lastB.toFixed(1)} ` + viz.after
    .map((v, i) => `L${(mid + ((i + 1) * (W - mid)) / afterY.length).toFixed(1)},${scale(v).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="tspark" viewBox={`0 0 ${W} ${height + 8}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="draw" style={{ ["--len" as string]: 400 }} d={bPath} fill="none" stroke="#8B978D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={mid} y1="4" x2={mid} y2={height + 3} stroke="#cdae7e" strokeWidth="1.4" strokeDasharray="3 3" className="reveal" style={{ ["--rd" as string]: "500ms" }} />
      <circle cx={mid} cy={lastB} r="3.6" fill="#cdae7e" className="pop" style={{ ["--rd" as string]: "620ms" }} />
      <path className="draw" style={{ ["--len" as string]: 400, ["--rd" as string]: "560ms" }} d={aPath} fill="none" stroke="#61a029" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Show-the-math break chart with level guides + day labels. */
function BreakChart({ viz }: { viz: BreaklineViz }) {
  const W = 300, H = 80, mid = 150;
  const bPath = toPath(viz.before, 0, mid, W);
  const lastB = viz.before[viz.before.length - 1];
  const aPath =
    `M${mid},${lastB} ` +
    viz.after.map((v, i) => `L${(mid + ((i + 1) * (W - mid)) / viz.after.length).toFixed(1)},${v}`).join(" ");
  return (
    <svg className="breakchart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="26" x2={mid} y2="26" stroke="#3a453c" strokeOpacity=".4" strokeWidth="1" strokeDasharray="2 4" />
      <line x1={mid} y1="52" x2={W} y2="52" stroke="#3a453c" strokeOpacity=".4" strokeWidth="1" strokeDasharray="2 4" />
      <path className="draw" style={{ ["--len" as string]: 360 }} d={bPath} fill="none" stroke="#75827a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={mid} y1="6" x2={mid} y2="74" stroke="#cdae7e" strokeWidth="1.5" strokeDasharray="4 3" className="reveal" style={{ ["--rd" as string]: "420ms" }} />
      <circle cx={mid} cy={lastB} r="3.6" fill="#cdae7e" className="pop" style={{ ["--rd" as string]: "540ms" }} />
      <path className="draw" style={{ ["--len" as string]: 360, ["--rd" as string]: "480ms" }} d={aPath} fill="none" stroke="#61a029" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <text x="8" y="18" fontFamily="'JetBrains Mono',monospace" fontSize="7" fill="#93a095">{viz.beforeLabel}</text>
      <text x="200" y="70" fontFamily="'JetBrains Mono',monospace" fontSize="7" fill="#8fd3ac">{viz.afterLabel}</text>
    </svg>
  );
}

function Band({ viz }: { viz: BandViz }) {
  return (
    <div className="band">
      <div className="zone" />
      <div className="zlbl">{viz.rangeLabel}</div>
      <div className="now" style={{ left: `${viz.nowPosPct}%` }} />
      <div className="nowlbl" style={{ left: `${viz.nowPosPct}%` }}>{viz.nowLabel}</div>
    </div>
  );
}

function Calc({ viz }: { viz: ArithmeticViz }) {
  return (
    <div className="calc">
      {viz.lines.map((l, i) => (
        <div key={i}>
          {l.kind === "result" ? (
            <span className="res">{l.text}</span>
          ) : l.kind === "warn" ? (
            <span className="warn">{l.text}</span>
          ) : (
            <>
              {l.text} {l.op ? <span className="op">{l.op}</span> : null}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function Attrib({ viz }: { viz: AttributionViz }) {
  return (
    <div className="attrib">
      {viz.bars.map((b, i) => (
        <div className="abar" key={b.name}>
          <span className="an">{b.name}</span>
          <span className="atrack">
            <span className={`afill ${b.unknown ? "unk" : ""}`} style={{ width: `${b.pct}%`, animationDelay: `${i * 90}ms` }} />
          </span>
          <span className="av">{b.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function Trend({ viz }: { viz: TrendViz }) {
  return (
    <div className="trend">
      {viz.points.map((p, i) => (
        <div className="tp" key={p.label}>
          <span className="tv2">{p.value}</span>
          <span className="tbar" style={{ height: `${p.heightPct}%`, animationDelay: `${i * 110}ms` }} />
          <span className="tl2">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Fan({ viz }: { viz: FanViz }) {
  const W = 300, H = 96, nowX = 160;
  const hist = toPath(viz.history, 0, nowX, W);
  const midPath =
    `M${nowX},${viz.mid[0]} ` +
    viz.mid.slice(1).map((v, i) => `L${(nowX + ((i + 1) * (W - nowX)) / (viz.mid.length - 1)).toFixed(0)},${v}`).join(" ");
  const step = (W - nowX) / (viz.hi.length - 1);
  const hiPts = viz.hi.map((v, i) => `${(nowX + i * step).toFixed(0)},${v}`);
  const loPts = viz.lo.map((v, i) => `${(nowX + i * step).toFixed(0)},${v}`).reverse();
  return (
    <svg className="fan" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="fanband" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#61a029" stopOpacity=".22" />
          <stop offset="1" stopColor="#61a029" stopOpacity=".05" />
        </linearGradient>
      </defs>
      <path className="draw" style={{ ["--len" as string]: 300 }} d={hist} fill="none" stroke="#75827a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={nowX} y1="10" x2={nowX} y2="86" stroke="#cdae7e" strokeWidth="1.2" strokeDasharray="3 3" className="reveal" style={{ ["--rd" as string]: "350ms" }} />
      <text x={nowX - 10} y="8" fontFamily="'JetBrains Mono',monospace" fontSize="7" fill="#cdae7e" textAnchor="end">now</text>
      <polygon points={[...hiPts, ...loPts].join(" ")} fill="url(#fanband)" className="reveal" style={{ ["--rd" as string]: "430ms" }} />
      <path className="draw" style={{ ["--len" as string]: 220, ["--rd" as string]: "430ms" }} d={midPath} fill="none" stroke="#61a029" strokeWidth="2.4" strokeDasharray="5 4" strokeLinecap="round" />
      <text x={W - 4} y="24" fontFamily="'JetBrains Mono',monospace" fontSize="7" fill="#8fd3ac" textAnchor="end">{viz.hiLabel}</text>
      <text x={W - 4} y="70" fontFamily="'JetBrains Mono',monospace" fontSize="7" fill="#93a095" textAnchor="end">{viz.loLabel}</text>
    </svg>
  );
}

export function Cushion({ viz }: { viz: CushionViz }) {
  return (
    <div className="cushion">
      <div className="floor" />
      <div className="floorlbl">{viz.floorLabel}</div>
      <div className="bars">
        {viz.bars.map((b, i) => (
          <div className={`cb ${b.tight ? "tight" : ""}`} key={b.label}>
            <span className="cbar" style={{ height: `${b.heightPct}%`, animationDelay: `${i * 110}ms` }} />
            <span className="cl2">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VizView({ viz }: { viz: Viz }) {
  switch (viz.kind) {
    case "breakline": return <BreakChart viz={viz} />;
    case "band": return <Band viz={viz} />;
    case "arithmetic": return <Calc viz={viz} />;
    case "attribution": return <Attrib viz={viz} />;
    case "trend": return <Trend viz={viz} />;
    case "fan": return <Fan viz={viz} />;
    case "cushion": return <Cushion viz={viz} />;
  }
}

/** The full "show the math" middle layer: plain method → viz → translated
 *  stat with real notation beneath → citation. */
export function MathView({ math }: { math: MathBlock }) {
  return (
    <>
      {math.methodPlain && <div className="method"><Html text={math.methodPlain} /></div>}
      {math.viz && <VizView viz={math.viz} />}
      {math.keyStatPlain && (
        <div className="mathbox">
          <div className="plain"><Html text={math.keyStatPlain} /></div>
          <div className="note">{math.keyStatNotation}</div>
        </div>
      )}
      {math.extraPlain && <div className="method" style={{ marginBottom: 14 }}><Html text={math.extraPlain} /></div>}
      <div className="cite">
        {CITE_ICON}
        <span>Method: {math.citation.method} · Source: {math.citation.source}</span>
      </div>
    </>
  );
}
