import { Component, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Today from "./screens/Today";
import Numbers from "./screens/Numbers";
import Ask from "./screens/Ask";
import PnL from "./screens/PnL";
import Ledger from "./screens/Ledger";
import Settings from "./screens/Settings";
import Onboarding from "./screens/Onboarding";
import Engine from "./screens/Engine";
import Plan from "./screens/Plan";
import Packet from "./screens/Packet";
import Insights from "./screens/Insights";
import Ops from "./screens/Ops";
import Power from "./screens/Power";
import Marketing from "./screens/Marketing";
import Decisions from "./screens/Decisions";
import Money from "./screens/Money";
import Trust from "./screens/Trust";
import Pro from "./screens/Pro";

// The tab set — drawn as a set, not picked from a sheet: 1.5px strokes,
// round caps, one idea each. Today is the morning sun over the horizon;
// Numbers is the ledger's bars ON a baseline; Ask is the advisor's bubble
// with the ◆; Plan is a compass wanting north; Settings is three sliders
// (a craftsman's board, not a machine's cog).
const TABS = [
  {
    to: "/",
    label: "Today",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 17a5.5 5.5 0 0 1 11 0" />
        <path d="M12 8V5.5M5.6 10.6L4 9M18.4 10.6L20 9" />
        <path d="M3 20h18" />
      </svg>
    ),
  },
  {
    to: "/numbers",
    label: "Numbers",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 19v-6M11 19V5M16 19v-9M21 19v-3" />
        <path d="M3 21.5h18" />
      </svg>
    ),
  },
  {
    to: "/pnl",
    label: "P&L",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5.5C10 4 7.5 3.5 4 3.5v15c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-15c-3.5 0-6 .5-8 2z" />
        <path d="M12 5.5v15" />
        <path d="M7 8.5h2.5M7 12h2.5M14.5 8.5H17M14.5 12H17" opacity=".55" />
      </svg>
    ),
  },
  {
    to: "/ledger",
    label: "Ledger",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 5.5h.01M4.5 12h.01M4.5 18.5h.01" strokeWidth="2.4" />
        <path d="M8.5 5.5H20M8.5 12H20M8.5 18.5H20" />
      </svg>
    ),
  },
  {
    to: "/plan",
    label: "Plan",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M15.2 8.8l-1.8 4.6-4.6 1.8 1.8-4.6z" />
        <circle cx="12" cy="12" r=".6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16M4 12h16M4 17h16" opacity=".45" />
        <circle cx="9" cy="7" r="2.1" fill="var(--card, #fbfaf5)" />
        <circle cx="15" cy="12" r="2.1" fill="var(--card, #fbfaf5)" />
        <circle cx="7" cy="17" r="2.1" fill="var(--card, #fbfaf5)" />
      </svg>
    ),
  },
];

function TabBar() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  // The dock breathes with the reader: tucks away while you scroll down
  // into the content, resurfaces the moment you scroll back or near the top.
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - last;
        if (y < 90) setTucked(false);
        else if (delta > 8) setTucked(true);
        else if (delta < -8) setTucked(false);
        last = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { setTucked(false); }, [pathname]);
  return (
    <nav className={`tabbar ${tucked ? "tucked" : ""}`} aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.to}
          className={`tab ${pathname === t.to ? "on" : ""}`}
          onClick={() => { try { navigator.vibrate?.(4); } catch { /* no haptics */ } nav(t.to); }}
          aria-current={pathname === t.to ? "page" : undefined}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// Human names for the live-region route announcer (screen-reader "you are here").
const ROUTE_NAMES: Record<string, string> = {
  "/": "Today", "/numbers": "Numbers", "/pnl": "Profit and loss", "/ledger": "The ledger", "/ask": "Ask",
  "/plan": "Plan", "/settings": "Settings", "/money": "Money", "/ops": "Stock and shipments",
  "/insights": "Insights Lab", "/decisions": "Decisions", "/marketing": "Marketing",
  "/power": "Power Up", "/packet": "Banker's Packet", "/trust": "Trust Ledger", "/pro": "Counsel Pro",
  "/engine": "Engine", "/welcome": "Welcome",
};
const routeName = (p: string) => ROUTE_NAMES[p] ?? "Counsel";

// First-run: no persona chosen AND never explicitly skipped -> onboarding.
function isFirstRun(): boolean {
  try {
    return !localStorage.getItem("counsel.persona") && !localStorage.getItem("counsel.visited");
  } catch {
    return false;
  }
}

// A crash in one card must never white-screen the whole advisor.
class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) {
    // Error NAME + message only — never data. Fire-and-forget.
    try {
      fetch("https://counsel-cloud.fantasy-labai.workers.dev/v1/telemetry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: err.name, msg: String(err.message).slice(0, 200), path: window.location.pathname }),
      }).catch(() => {});
    } catch { /* telemetry is optional by design */ }
  }
  render() {
    if (this.state.err) {
      return (
        <div className="app">
          <section className="voice" style={{ marginTop: 24 }}>
            <div className="eyebrow on-dark">A hiccup — not a cover-up</div>
            <div className="said">Something in this screen <em>misfired.</em></div>
            <div className="sub">
              Your data is untouched — this is a display fault, not a data one.
              ({String(this.state.err.message).slice(0, 120)})
            </div>
          </section>
          <button className="btn brass" style={{ marginTop: 16 }}
            onClick={() => { this.setState({ err: null }); window.location.assign("/"); }}>
            Back to Today
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { pathname } = useLocation();
  const nav = useNavigate();

  // Every screen opens at its top — carrying scroll position between
  // routes makes pages appear mid-thought.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const inOnboarding = pathname.startsWith("/welcome");
  if (pathname === "/" && isFirstRun()) {
    return <Navigate to="/welcome" replace />;
  }
  return (
    <div className="wrap">
      <a className="skip-link" href="#main">Skip to content</a>
      {/* live-region announcer: tells a screen reader which screen it landed on */}
      <div className="sr-only" aria-live="polite" role="status">{routeName(pathname)}</div>
      {/* key on pathname re-triggers the entrance transition per screen */}
      <main className="screen page-enter" id="main" tabIndex={-1} key={pathname}>
        <ErrorBoundary>
        <Routes>
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/" element={<Today />} />
          <Route path="/numbers" element={<Numbers />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/pnl" element={<PnL />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/engine" element={<Engine />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/packet" element={<Packet />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/ops" element={<Ops />} />
          <Route path="/power" element={<Power />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/decisions" element={<Decisions />} />
          <Route path="/money" element={<Money />} />
          <Route path="/trust" element={<Trust />} />
          <Route path="/pro" element={<Pro />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
      </main>
      {!inOnboarding && pathname !== "/packet" && pathname !== "/ask" && (
        <button className="ask-fab" aria-label="Ask Counsel" title="Ask — grounded in your data"
          onClick={() => { try { navigator.vibrate?.(8); } catch { /* no haptics */ } nav("/ask"); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 11.5a7.5 7 0 0 1-7.5 7c-1 0-2-.16-2.9-.47L5 19.5l1.2-3.4A6.8 6.8 0 0 1 5 11.5a7.5 7 0 0 1 15 0z" />
          </svg>
          <span className="fab-diamond" aria-hidden="true">◆</span>
        </button>
      )}
      {/* No dock on /ask: the floating tab bar would sit on the composer.
          Ask is a room you enter by FAB and leave by its close button. */}
      {!inOnboarding && pathname !== "/packet" && pathname !== "/ask" && <TabBar />}
    </div>
  );
}
