import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Today from "./screens/Today";
import Numbers from "./screens/Numbers";
import Ask from "./screens/Ask";
import Settings from "./screens/Settings";
import Onboarding from "./screens/Onboarding";
import Engine from "./screens/Engine";
import Plan from "./screens/Plan";
import Packet from "./screens/Packet";

const TABS = [
  {
    to: "/",
    label: "Today",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 12l9-8 9 8M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    to: "/numbers",
    label: "Numbers",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
      </svg>
    ),
  },
  {
    to: "/ask",
    label: "Ask",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    to: "/plan",
    label: "Plan",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M15.5 8.5l-2 5-5 2 2-5z" />
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

export default function App() {
  const { pathname } = useLocation();
  const inOnboarding = pathname.startsWith("/welcome");
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!inOnboarding && pathname !== "/packet" && <TabBar />}
    </div>
  );
}
