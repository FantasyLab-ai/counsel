// Counsel Pro — the paywall, written the way Counsel talks: what you
// get, what it costs, and what stays free for everyone, forever. No
// countdown timers, no fake scarcity, no guilt buttons. The honesty is
// free; Pro is Counsel working for you.

import { useEffect, useState } from "react";
import { BackBtn, Reveal, tapFeedback } from "../components/ui";
import {
  PRO_FEATURES, isPro, redeemFoundingCode, tierLabel,
} from "../engine/entitlement";
import { billingAvailable, billingDiag, listPackages, purchase, restore } from "../engine/billing";

export default function Pro() {
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "bad" | "good">("idle");
  const [pkgs, setPkgs] = useState<{ id: string; identifier: string; title: string }[]>([]);
  const [diag, setDiag] = useState("");
  const [busy, setBusy] = useState(false);
  // ?paywall=1 lets a founding member preview exactly what non-members
  // see: buttons, prices, diagnosis line and all. Entitlement untouched.
  const pro = isPro() && !window.location.search.includes("paywall=1");

  // Native store builds with billing configured show real buy buttons;
  // everywhere else the paywall stays informational + founding codes.
  // When billing SHOULD work but no products load, say why — never a
  // silent empty paywall.
  useEffect(() => {
    // Diagnose in EVERY empty-paywall case — a silent empty paywall is
    // the one failure mode this screen is not allowed to have.
    listPackages().then((pk) => {
      setPkgs(pk);
      if (!pk.length) billingDiag().then(setDiag).catch((e) => setDiag(`diagnosis failed: ${String(e).slice(0, 90)}`));
    }).catch(() => billingDiag().then(setDiag).catch((e) => setDiag(`diagnosis failed: ${String(e).slice(0, 90)}`)));
  }, []);

  // Founding auto-claim: the first 50 public-link installs become founding
  // members automatically, each on its own seat. No code to type.
  useEffect(() => {
    if (isPro()) return;
    (async () => {
      try {
        const { claimFoundingSeat } = await import("../engine/cloudSync");
        const r = await claimFoundingSeat();
        if (r.ok) {
          const { grantFounding } = await import("../engine/entitlement");
          grantFounding(r.seat);
          window.location.reload();
        }
      } catch { /* offline; claimed on a later visit */ }
    })();
  }, []);

  async function buy(identifier: string) {
    tapFeedback(); setBusy(true);
    try {
      if (await purchase(identifier)) window.location.assign("/");
    } finally { setBusy(false); }
  }
  async function doRestore() {
    tapFeedback(); setBusy(true);
    try {
      if (await restore()) window.location.assign("/");
    } finally { setBusy(false); }
  }

  async function redeem() {
    tapFeedback();
    const ok = await redeemFoundingCode(code);
    setState(ok ? "good" : "bad");
    if (ok) setTimeout(() => window.location.assign("/"), 1200);
  }

  return (
    <div className="app">
      <div className="appbar">
        <BackBtn />
        <div className="wordmark"><b>Counsel</b><span>Pro</span></div>
        <div style={{ width: 38 }} />
      </div>

      <Reveal i={0}>
        <section className="voice">
          <div className="eyebrow on-dark">the deal, plainly</div>
          <div className="said">The math is free. <em>The work</em> is Pro.</div>
          <div className="sub">
            Every receipt, every method, every honest refusal stays free for
            everyone, forever — paying to see why a number is true would make
            the number worth less. Pro is Counsel <b>acting</b> on your
            numbers: paying you, executing with your signature, watching
            while you sleep, and writing the Sunday packet.
          </div>
        </section>
      </Reveal>

      {pro ? (
        <Reveal i={1}>
          <article className="mcard open il-card" style={{ marginTop: 16 }}>
            <div className="il-kick">your plan</div>
            <div className="mmean" style={{ marginTop: 8 }}>
              <b>{tierLabel()}.</b> Everything below is yours. Thank you for
              being early — founding members keep Pro for as long as Counsel
              exists.
            </div>
          </article>
        </Reveal>
      ) : (
        <Reveal i={1}>
          <article className="mcard open il-card" style={{ marginTop: 16 }}>
            <div className="il-kick">counsel pro</div>
            <div className="tv" style={{ marginTop: 8 }}>
              <span className="num">$14.99</span>
              <span className="dlt flat">/ month · or $119/yr (2 months free)</span>
            </div>
            {pkgs.length > 0 ? (
              <>
                {pkgs.map((p) => (
                  <button key={p.id} className="btn" style={{ marginTop: 10 }}
                          disabled={busy} onClick={() => buy(p.identifier)}>
                    {busy ? "…" : `Subscribe · ${p.title}`}
                  </button>
                ))}
                <button className="subbtn" style={{ width: "100%" }} disabled={busy}
                        onClick={doRestore}>
                  already subscribed? restore purchases
                </button>
                <div className="mmean" style={{ marginTop: 10 }}>
                  Billed by the app store; cancel anytime in your store
                  subscriptions. The math stays free either way.
                </div>
              </>
            ) : (
              <>
                <div className="mmean">
                  Billing arrives with the app-store builds. Until then, Pro is
                  open only to founding members — the twelve pilot businesses
                  helping test Counsel keep it free for life.
                </div>
                {diag && (
                  <div className="honest-note" style={{ marginTop: 10 }}>{diag}</div>
                )}
              </>
            )}
            <div className="field" style={{ marginTop: 14 }}>
              <input
                value={code}
                onChange={(e) => { setCode(e.target.value); setState("idle"); }}
                placeholder="founding member code"
                aria-label="Founding member code"
                autoCapitalize="characters"
              />
              <button className="go" onClick={redeem} aria-label="Redeem code">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
            {state === "bad" && (
              <div className="mmean" style={{ marginTop: 8 }}>
                That code didn't match. Codes look like FOUNDER-XXXXXXXXXX.
              </div>
            )}
            {state === "good" && (
              <div className="mmean" style={{ marginTop: 8 }}>
                <b>Welcome, founding member.</b> Pro is yours for life —
                taking you back to Today.
              </div>
            )}
          </article>
        </Reveal>
      )}

      <div className="eyebrow">What Pro pays for</div>
      <div className="rows">
        {PRO_FEATURES.map((f, i) => (
          <Reveal i={i + 2} key={f.name}>
            <article className="row-card">
              <div className="rank">◆</div>
              <div className="rbody">
                <div className="src">{f.status === "soon" ? "coming to pro" : "in pro today"}</div>
                <div className="txt"><b>{f.name}.</b> {f.line}</div>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <div className="eyebrow">Free for everyone, forever</div>
      <Reveal i={9}>
        <div className="watch">
          <div className="w"><div className="wtxt">The morning read, every engine's findings on your data, the 14-day band, and <b>every receipt behind every number</b> — the honesty is the product, not the upsell.</div></div>
        </div>
      </Reveal>
    </div>
  );
}
