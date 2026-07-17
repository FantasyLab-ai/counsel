import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Today from "./screens/Today";
import Numbers from "./screens/Numbers";
import Ask from "./screens/Ask";
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
    to: "/ask",
    label: "Ask",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11.5a7.5 7 0 0 1-7.5 7c-1 0-2-.16-2.9-.47L5 19.5l1.2-3.4A6.8 6.8 0 0 1 5 11.5a7.5 7 0 0 1 15 0z" />
        <path d="M12.5 9.4l1 2.1 1-2.1-1-2.1z" fill="currentColor" stroke="none" transform="rotate(45 12.5 11.5) scale(.9)" />
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
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.to}
          className={`tab ${pathname === t.to ? "on" : ""}`}
          onClick={() => nav(t.to)}
          aria-current={pathname === t.to ? "page" : undefined}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// First-run: no persona chosen AND never explicitly skipped -> onboarding.
function isFirstRun(): boolean {
  try {
    return !localStorage.getItem("counsel.persona") && !localStorage.getItem("counsel.visited");
  } catch {
    return false;
  }
}

export default function App() {
  const { pathname } = useLocation();
  const inOnboarding = pathname.startsWith("/welcome");
  if (pathname === "/" && isFirstRun()) {
    return <Navigate to="/welcome" replace />;
  }
  return (
    <div className="wrap">
      {/* key on pathname re-triggers the entrance transition per screen */}
      <div className="screen page-enter" key={pathname}>
        <Routes>
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/" element={<Today />} />
          <Route path="/numbers" element={<Numbers />} />
          <Route path="/ask" element={<Ask />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!inOnboarding && pathname !== "/packet" && <TabBar />}
    </div>
  );
}
