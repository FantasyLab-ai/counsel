// Settings — profile, connections, HOW COUNSEL ADVISES YOU (the glass-box
// section; "tell me when unsure" is locked ON — it's Core, on principle),
// restrained briefings, and the honest Privacy & data section.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getConnections, type Source } from "../api/counsel";
import { Reveal } from "../components/ui";

const CHEV = (
  <span className="chev">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
  </span>
);

function Toggle({ initial, locked }: { initial?: boolean; locked?: boolean }) {
  const [on, setOn] = useState(!!initial);
  if (locked) return <div className="sw locked" aria-label="Always on" role="switch" aria-checked="true" />;
  return (
    <div
      className={`sw ${on ? "on" : ""}`}
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={() => setOn(!on)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOn(!on); } }}
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
  useEffect(() => {
    let on = true;
    getConnections().then((s) => on && setSources(s));
    return () => { on = false; };
  }, []);

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">Kiln &amp; Co.</div>
          <h1>Settings</h1>
        </div>
        <div className="avatar">B</div>
      </div>

      <Reveal i={0}>
        <div className="profile">
          <div className="pav">K</div>
          <div>
            <div className="pn">Kiln &amp; Co.</div>
            <div className="pm">Brandon · handmade ceramics</div>
          </div>
          <div className="plan">Pro</div>
        </div>
      </Reveal>

      <Reveal i={1}>
        <section className="sec">
          <div className="sec-h">Connected tools</div>
          <div className="group">
            {sources.map((s) => (
              <div className="srow" key={s.id}>
                <div className="ico">{SRC_ICONS[s.id]}</div>
                <div className="rl">
                  <div className="rt">{s.name}</div>
                  <div className="rs">{s.role}</div>
                </div>
                <div className="rr"><span className="sdot ok" /><span className="sync">{s.syncedLabel}</span></div>
              </div>
            ))}
            <div className="addrow">
              <div className="plus">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              </div>
              <span>Connect QuickBooks, Square, Google…</span>
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
              <div className="rr"><Toggle initial /></div>
            </div>
            <div className="srow">
              <div className="rl">
                <div className="rt">Tell me when you're unsure</div>
                <div className="rs">Flag “not enough data” instead of guessing. This one's on principle.</div>
              </div>
              <div className="rr"><span className="coretag">Core</span><Toggle locked /></div>
            </div>
            <div className="srow">
              <div className="rl">
                <div className="rt">Alert me only above</div>
                <div className="rs">Skip low-confidence noise.</div>
              </div>
              <div className="rr"><span className="rv">Moderate</span>{CHEV}</div>
            </div>
            <div className="srow">
              <div className="rl">
                <div className="rt">Advisor tone</div>
                <div className="rs">How direct the plain-English reads.</div>
              </div>
              <div className="rr"><span className="rv">Direct</span>{CHEV}</div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal i={3}>
        <section className="sec">
          <div className="sec-h">Briefings &amp; alerts</div>
          <div className="group">
            <div className="srow">
              <div className="rl">
                <div className="rt">Morning brief</div>
                <div className="rs">Your one-glance read, every day.</div>
              </div>
              <div className="rr"><span className="rv">7:30 AM</span>{CHEV}</div>
            </div>
            <div className="srow">
              <div className="rl">
                <div className="rt">Only alert on real changes</div>
                <div className="rs">Stay quiet unless something structurally shifts.</div>
              </div>
              <div className="rr"><Toggle initial /></div>
            </div>
            <div className="srow">
              <div className="rl">
                <div className="rt">Quiet hours</div>
                <div className="rs">No pings overnight.</div>
              </div>
              <div className="rr"><span className="rv">9 PM–7 AM</span>{CHEV}</div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal i={4}>
        <section className="sec">
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
              <div className="rr"><Toggle /></div>
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
            <div className="srow">
              <div className="rl">
                <div className="rt">Where your data lives</div>
                <div className="rs">Encrypted at rest.</div>
              </div>
              <div className="rr"><span className="rv">US · encrypted</span>{CHEV}</div>
            </div>
            <div className="srow">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              </div>
              <div className="rl">
                <div className="rt">Export everything</div>
                <div className="rs">Download all your data as CSV.</div>
              </div>
              <div className="rr">{CHEV}</div>
            </div>
            <div className="srow danger">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </div>
              <div className="rl">
                <div className="rt">Delete my data</div>
                <div className="rs">Permanent. Removes everything from our servers.</div>
              </div>
              <div className="rr">{CHEV}</div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal i={5}>
        <section className="sec">
          <div className="sec-h">Plan</div>
          <div className="group">
            <div className="srow">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.8 5.7 21l2.3-7-6-4.6h7.6z" /></svg>
              </div>
              <div className="rl">
                <div className="rt">Counsel Pro</div>
                <div className="rs">$49 / month · billed monthly</div>
              </div>
              <div className="rr"><span className="rv">Manage</span>{CHEV}</div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal i={6}>
        <section className="sec">
          <div className="sec-h">Account</div>
          <div className="group">
            <div className="srow">
              <div className="rl">
                <div className="rt">Brandon G.</div>
                <div className="rs">brandon@kilnandco.com</div>
              </div>
              <div className="rr">{CHEV}</div>
            </div>
            <div className="srow danger">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              </div>
              <div className="rl"><div className="rt">Sign out</div></div>
            </div>
          </div>
        </section>
      </Reveal>

      <div className="sfooter">
        <div className="v">Counsel v0.1.0 · prototype</div>
        <div className="pb">powered by Aurora</div>
        <div className="lk"><span>Privacy</span> &nbsp;·&nbsp; <span>Terms</span> &nbsp;·&nbsp; <span>Support</span></div>
      </div>
    </div>
  );
}
