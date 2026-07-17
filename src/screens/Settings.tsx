// Settings — profile, connections, HOW COUNSEL ADVISES YOU (the glass-box
// section; "tell me when unsure" is locked ON — it's Core, on principle),
// restrained briefings, and the honest Privacy & data section.

import { useEffect, useState } from "react";
import { displayName, getPersona } from "../engine/persona";
import { useNavigate } from "react-router-dom";
import { getConnections, type Source } from "../api/counsel";
import { getOnDeviceOnly, setOnDeviceOnly } from "../engine/router";
import { cycleSetting, getSettings, setSetting } from "../engine/settings";
import { clearUserData, demoView, hasUserData, setDemoView, userCharges, userExpenses, userMeta } from "../engine/dataSource";
import { listDecisions } from "../engine/decisions";
import { Reveal } from "../components/ui";

const CHEV = (
  <span className="chev">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
  </span>
);

function Toggle({ initial, locked, onChange }: { initial?: boolean; locked?: boolean; onChange?: (v: boolean) => void }) {
  const [on, setOn] = useState(!!initial);
  const flip = () => { const v = !on; setOn(v); onChange?.(v); };
  if (locked) return <div className="sw locked" aria-label="Always on" role="switch" aria-checked="true" />;
  return (
    <div
      className={`sw ${on ? "on" : ""}`}
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={flip}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } }}
    />
  );
}

const SRC_ICONS: Record<string, JSX.Element> = {
  stripe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 10h20M6 15h4" /><rect x="2" y="5" width="20" height="14" rx="2" /></svg>
  ),
  shopify: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2l1 4h10l1-4M4 6h16l-1.5 14a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8z" /></svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" /></svg>
  ),
};

export default function Settings() {
  const nav = useNavigate();
  const [sources, setSources] = useState<Source[]>([]);
  const [prefs, setPrefs] = useState(getSettings());
  const cycle = (k: "alertThreshold" | "tone" | "briefTime" | "quietHours") => setPrefs(cycleSetting(k));
  useEffect(() => {
    let on = true;
    getConnections().then((s) => on && setSources(s));
    return () => { on = false; };
  }, []);

  function exportEverything() {
    const bundle = {
      exportedAt: new Date().toISOString(),
      settings: getSettings(),
      decisions: listDecisions(),
      userData: {
        meta: userMeta(),
        charges: userCharges() ?? "none loaded — demo mode",
        expenses: userExpenses() ?? "none loaded — demo mode",
      },
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `counsel-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function deleteMyData() {
    const sure = window.confirm(
      "Delete everything Counsel stores on this device? Your dropped-in data, decisions and preferences will be removed. (Demo data stays — it ships with the app.)"
    );
    if (!sure) return;
    clearUserData();
    try { localStorage.clear(); } catch { /* already gone */ }
    window.location.assign("/");
  }

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">{displayName()}</div>
          <h1>Settings</h1>
        </div>
        <div className="avatar">{displayName()[0]}</div>
      </div>

      <Reveal i={0}>
        <div className="profile tap" role="button" tabIndex={0} title="Edit name & line of work"
             onClick={() => nav("/welcome")}
             onKeyDown={(e) => { if (e.key === "Enter") nav("/welcome"); }}>
          <div className="pav">{displayName()[0]}</div>
          <div>
            <div className="pn">{displayName()}</div>
            <div className="pm">{getPersona()?.label ?? "your business"} · tap to edit</div>
          </div>
          <div className="plan">Pro</div>
        </div>
      </Reveal>

      <Reveal i={1}>
        <section className="sec">
          <div className="sec-h">Connected tools</div>
          <div className="group">
            {sources.map((s) => (
              <div className="srow tap" key={s.id} role="button" tabIndex={0}
                   onClick={() => nav("/power")}
                   onKeyDown={(e) => { if (e.key === "Enter") nav("/power"); }}>
                <div className="ico">{SRC_ICONS[s.id] ?? SRC_ICONS.stripe}</div>
                <div className="rl">
                  <div className="rt">{s.name}</div>
                  <div className="rs">{s.role}</div>
                </div>
                <div className="rr"><span className="sdot ok" /><span className="sync">{s.syncedLabel}</span>{CHEV}</div>
              </div>
            ))}
            <div className="addrow tap" role="button" tabIndex={0}
                 onClick={() => nav("/power")}
                 onKeyDown={(e) => { if (e.key === "Enter") nav("/power"); }}>
              <div className="plus">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              </div>
              <span>Connect Stripe, Square, Shopify, QuickBooks…</span>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal i={2}>
        <section className="sec">
          <div className="sec-h">How Counsel advises you</div>
          <div className="group">
            <div className="srow">
              <div className="rl">
                <div className="rt">Always show the math</div>
                <div className="rs">Expand the reasoning behind every insight by default.</div>
              </div>
              <div className="rr"><Toggle initial={prefs.showMathByDefault} onChange={(v) => setPrefs(setSetting("showMathByDefault", v))} /></div>
            </div>
            <div className="srow">
              <div className="rl">
                <div className="rt">Tell me when you're unsure</div>
                <div className="rs">Flag “not enough data” instead of guessing. This one's on principle.</div>
              </div>
              <div className="rr"><span className="coretag">Core</span><Toggle locked /></div>
            </div>
            <div className="srow tap" role="button" tabIndex={0} onClick={() => cycle("alertThreshold")}
                 onKeyDown={(e) => { if (e.key === "Enter") cycle("alertThreshold"); }}>
              <div className="rl">
                <div className="rt">Alert me only above</div>
                <div className="rs">Skip low-confidence noise. Tap to change.</div>
              </div>
              <div className="rr"><span className="rv">{prefs.alertThreshold}</span>{CHEV}</div>
            </div>
            <div className="srow tap" role="button" tabIndex={0} onClick={() => cycle("tone")}
                 onKeyDown={(e) => { if (e.key === "Enter") cycle("tone"); }}>
              <div className="rl">
                <div className="rt">Advisor tone</div>
                <div className="rs">How direct the plain-English reads. Tap to change.</div>
              </div>
              <div className="rr"><span className="rv">{prefs.tone}</span>{CHEV}</div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal i={3}>
        <section className="sec">
          <div className="sec-h">Briefings &amp; alerts</div>
          <div className="group">
            <div className="srow tap" role="button" tabIndex={0} onClick={() => cycle("briefTime")}
                 onKeyDown={(e) => { if (e.key === "Enter") cycle("briefTime"); }}>
              <div className="rl">
                <div className="rt">Morning brief</div>
                <div className="rs">Your one-glance read, every day. Tap to change.</div>
              </div>
              <div className="rr"><span className="rv">{prefs.briefTime}</span>{CHEV}</div>
            </div>
            <div className="srow">
              <div className="rl">
                <div className="rt">Only alert on real changes</div>
                <div className="rs">Stay quiet unless something structurally shifts.</div>
              </div>
              <div className="rr"><Toggle initial={prefs.onlyRealChanges} onChange={(v) => setPrefs(setSetting("onlyRealChanges", v))} /></div>
            </div>
            <div className="srow tap" role="button" tabIndex={0} onClick={() => cycle("quietHours")}
                 onKeyDown={(e) => { if (e.key === "Enter") cycle("quietHours"); }}>
              <div className="rl">
                <div className="rt">Quiet hours</div>
                <div className="rs">No pings overnight. Tap to change.</div>
              </div>
              <div className="rr"><span className="rv">{prefs.quietHours}</span>{CHEV}</div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal i={4}>
        <section className="sec" id="privacy-sec">
          <div className="sec-h">Privacy &amp; data</div>
          <div className="privacy-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <p>Your data is analyzed to answer your questions — <b>never sold, never used to train anything.</b> You can export or delete all of it anytime.</p>
          </div>
          <div className="group">
            <div className="srow">
              <div className="rl">
                <div className="rt">Keep analysis on this device</div>
                <div className="rs">Beta — your numbers never leave your phone. Slower, fully private.</div>
              </div>
              <div className="rr"><Toggle initial={getOnDeviceOnly()} onChange={setOnDeviceOnly} /></div>
            </div>
            <div className="srow" role="link" tabIndex={0} style={{ cursor: "pointer" }}
                 onClick={() => nav("/power")}
                 onKeyDown={(e) => { if (e.key === "Enter") nav("/power"); }}>
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
              </div>
              <div className="rl">
                <div className="rt">Power up Counsel</div>
                <div className="rs">The checklist — what to connect and what each source unlocks.</div>
              </div>
              <div className="rr">{CHEV}</div>
            </div>
            <div className="srow" role="link" tabIndex={0} style={{ cursor: "pointer" }}
                 onClick={() => nav("/engine")}
                 onKeyDown={(e) => { if (e.key === "Enter") nav("/engine"); }}>
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg>
              </div>
              <div className="rl">
                <div className="rt">See the engine run on this device</div>
                <div className="rs">Live demo — Aurora's Rust core computing in your hand.</div>
              </div>
              <div className="rr">{CHEV}</div>
            </div>
            <div className="srow" role="link" tabIndex={0} style={{ cursor: "pointer" }}
                 onClick={() => nav("/trust")}
                 onKeyDown={(e) => { if (e.key === "Enter") nav("/trust"); }}>
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>
              </div>
              <div className="rl">
                <div className="rt">The Trust Ledger</div>
                <div className="rs">Every claim's method — and exactly when Counsel refuses to speak.</div>
              </div>
              <div className="rr">{CHEV}</div>
            </div>
            <div className="srow">
              <div className="rl">
                <div className="rt">Where your data lives</div>
                <div className="rs">{hasUserData() ? "Your dropped-in data is on THIS device only — nothing was uploaded." : "Demo ledger ships with the app; anything you drop in stays on this device."}</div>
              </div>
              <div className="rr"><span className="rv">{hasUserData() ? "this device" : "demo"}</span></div>
            </div>
            {hasUserData() && (
              <div className="srow">
                <div className="rl">
                  <div className="rt">Demo showroom</div>
                  <div className="rs">View the app on the demo ledger (for testing &amp; show-and-tell). Your real data stays untouched — flip back anytime.</div>
                </div>
                <div className="rr"><Toggle initial={demoView()} onChange={(v) => { setDemoView(v); window.location.reload(); }} /></div>
              </div>
            )}
            <div className="srow tap" role="button" tabIndex={0} onClick={exportEverything}
                 onKeyDown={(e) => { if (e.key === "Enter") exportEverything(); }}>
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              </div>
              <div className="rl">
                <div className="rt">Export everything</div>
                <div className="rs">Downloads your data, decisions and preferences as one JSON file.</div>
              </div>
              <div className="rr">{CHEV}</div>
            </div>
            <div className="srow danger tap" role="button" tabIndex={0} onClick={deleteMyData}
                 onKeyDown={(e) => { if (e.key === "Enter") deleteMyData(); }}>
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </div>
              <div className="rl">
                <div className="rt">Delete my data</div>
                <div className="rs">Permanent. Clears everything Counsel stores on this device.</div>
              </div>
              <div className="rr">{CHEV}</div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal i={5}>
        <section className="sec">
          <div className="sec-h">Your business</div>
          <div className="group">
            <div className="srow tap" role="button" tabIndex={0} onClick={() => nav("/welcome")}
                 onKeyDown={(e) => { if (e.key === "Enter") nav("/welcome"); }}>
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /></svg>
              </div>
              <div className="rl">
                <div className="rt">Name &amp; line of work</div>
                <div className="rs">{displayName()} · {getPersona()?.label ?? "not set yet"}</div>
              </div>
              <div className="rr">{CHEV}</div>
            </div>
            <div className="srow">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.8 5.7 21l2.3-7-6-4.6h7.6z" /></svg>
              </div>
              <div className="rl">
                <div className="rt">No account, no bill</div>
                <div className="rs">Counsel runs on this device — nothing to sign into, nothing to cancel. Pricing arrives with the hosted service.</div>
              </div>
              <div className="rr"><span className="rv">free</span></div>
            </div>
          </div>
        </section>
      </Reveal>

      <div className="sfooter">
        <div className="v">Counsel v0.1.0 · prototype</div>
        <a className="pb" href="https://github.com/FantasyLab-ai/aurora" target="_blank" rel="noopener noreferrer">
          powered by Aurora ↗
        </a>
        <div className="lk">
          <button className="lk-b" onClick={() => document.getElementById("privacy-sec")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            Privacy &amp; data
          </button>
        </div>
      </div>
    </div>
  );
}
