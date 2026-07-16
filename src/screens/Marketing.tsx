// Marketing — reach → revenue, without a social API. Three live sources:
// UTM/referrer attribution already in the ledger, the tap-to-log post log
// (event-study lift math), and the UTM link maker. When social APIs are
// registered later they feed the SAME post store automatically.

import { useEffect, useState } from "react";
import { displayName } from "../engine/persona";
import {
  addPost, buildUtmLink, channelAttribution, deletePost, listPosts, postLift,
  type ChannelRow, type LiftSummary,
} from "../engine/socialMath";
import { money } from "../engine/tierMath";
import { Reveal } from "../components/ui";

const PLATFORMS = ["instagram", "tiktok", "facebook", "pinterest", "email", "other"];

export default function Marketing() {
  const [channels, setChannels] = useState<{ rows: ChannelRow[]; unknownShare: number } | null>(null);
  const [lift, setLift] = useState<LiftSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, force] = useState(0);
  const refresh = () => {
    postLift().then(setLift).catch((e) => setErr(String(e)));
    force((x) => x + 1);
  };

  useEffect(() => {
    let on = true;
    channelAttribution().then((c) => on && setChannels(c)).catch((e) => on && setErr(String(e)));
    postLift().then((l) => on && setLift(l)).catch((e) => on && setErr(String(e)));
    return () => { on = false; };
  }, []);

  const top = channels?.rows.find((r) => !r.unknown);

  return (
    <div className="app">
      <div className="appbar">
        <div className="titleblock">
          <div className="kicker">{displayName()} · reach → revenue</div>
          <h1>Marketing</h1>
        </div>
        <div className="avatar">B</div>
      </div>

      {err && <div className="reassure">Engine unavailable: {err}</div>}

      <Reveal i={0}>
        <section className="voice">
          <div className="eyebrow on-dark">The marketing read</div>
          {channels && lift ? (
            <>
              <div className="said">
                {top ? <><em>{top.channel}</em> is your engine{top.trend === "up" ? " — and growing." : "."}</> : <>Where your buyers <em>come from.</em></>}
              </div>
              <div className="sub">
                {top && <>{top.channel} drove {money(top.revenue)} ({(top.share * 100).toFixed(0)}% of attributed revenue, {top.customers} customers). </>}
                {lift.reliable && lift.medianLift !== null
                  ? <>Your posts are moving money: median <b style={{ color: "#d8c19a" }}>{money(lift.medianLift)}</b> per post over the following 48h.</>
                  : <>Post lift: <b style={{ color: "#d8c19a" }}>not enough logged posts to call it yet</b> — log each post below and I'll measure honestly.</>}
              </div>
              <div className="micro">
                <div className="m"><div className="ml">top channel</div><div className="mv">{top?.channel ?? "—"}</div></div>
                <div className="m"><div className="ml">posts logged</div><div className="mv">{lift.n}</div></div>
                <div className="m"><div className="ml">median lift</div><div className="mv">{lift.medianLift !== null ? money(lift.medianLift) : "—"}</div></div>
              </div>
            </>
          ) : <div className="sub">reading the channels…</div>}
        </section>
      </Reveal>

      {/* channel attribution — from data you already have */}
      <div className="eyebrow">Channels — from UTM &amp; referrer data you already have</div>
      {channels && (
        <Reveal i={1}>
          <article className="mcard open il-card">
            {channels.rows.map((r) => (
              <div className="il-comp" key={r.channel}>
                <span className="il-comp-name">
                  {r.channel}
                  {r.trend === "up" && <span className="mk-trend up"> ▴ growing</span>}
                  {r.trend === "down" && <span className="mk-trend down"> ▾ fading</span>}
                </span>
                <span className="il-comp-track"><span className={`il-comp-fill ${r.unknown ? "unk" : ""}`} style={{ width: `${r.share * 100}%` }} /></span>
                <span className="il-comp-pts">{(r.share * 100).toFixed(0)}%</span>
              </div>
            ))}
            <div className="il-cite">
              first-touch attribution from your commerce data (UTM tags + referrers) · {(channels.unknownShare * 100).toFixed(0)}% untraceable — honest gap, shrink it with tracked links below · trend compares the last half of the window vs the first
            </div>
          </article>
        </Reveal>
      )}

      {/* post log + lift */}
      <div className="eyebrow">Post lift — did it move money?</div>
      <Reveal i={2}><PostLog lift={lift} onChange={refresh} /></Reveal>

      {/* link maker */}
      <div className="eyebrow">Tracked links — make every post traceable</div>
      <Reveal i={3}><LinkMaker /></Reveal>

      <Reveal i={4}>
        <div className="reassure">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          No social API needed for any of this. When the official integrations arrive they'll
          auto-fill the post log — the math stays identical. Platform analytics exports (CSV)
          drop in via Power Up.
        </div>
      </Reveal>
    </div>
  );
}

function PostLog({ lift, onChange }: { lift: LiftSummary | null; onChange: () => void }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [platform, setPlatform] = useState("instagram");
  const [label, setLabel] = useState("");
  const posts = listPosts();

  return (
    <article className="mcard open il-card">
      {lift && (
        <div className="mmean" style={{ marginBottom: 10 }}>
          {lift.reliable && lift.medianLift !== null ? (
            <>Median lift <b>{money(lift.medianLift)}</b> per post (next 48h, weekday-adjusted) — typical
              2-day noise is ±{money(lift.noiseBand)}, so this clears the bar.</>
          ) : lift.n > 0 && lift.medianLift !== null ? (
            <>Median lift <b>{money(lift.medianLift)}</b> across {lift.n} post{lift.n === 1 ? "" : "s"} vs a
              ±{money(lift.noiseBand)} noise band — <b>too few posts to call it reliable yet.</b> Keep logging.</>
          ) : (
            <>Log each post when you publish it — I'll measure the following 48h against your weekday norm.</>
          )}
        </div>
      )}
      {lift?.perPost.map(({ post, lift: L, window }) => (
        <div className="il-row" key={post.id}>
          <div className="il-row-main" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span><b>{post.platform}</b>{post.label ? ` · ${post.label}` : ""} <span className="mk-date">{post.date}</span></span>
            <span style={{ whiteSpace: "nowrap" }}>
              {L === null ? <span className="mk-na">n/a</span>
                : <b className={L >= 0 ? "mk-pos" : "mk-neg"}>{L >= 0 ? "+" : ""}{money(L)}</b>}
              <button className="dt-btn danger" style={{ marginLeft: 10 }} onClick={() => { deletePost(post.id); onChange(); }}>×</button>
            </span>
          </div>
          <div className="il-row-sub">{window}</div>
        </div>
      ))}
      <div className="mk-add">
        <input className="dt-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Post date" />
        <select className="dt-input" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className="dt-input" placeholder="label (optional)" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        <button className="dbtn primary" onClick={() => { addPost(date, platform, label); setLabel(""); onChange(); }}>Log post</button>
      </div>
      <div className="il-cite">
        event study: post day + next day vs your weekday expectation (post windows excluded from the baseline) ·
        needs ≥3 measurable posts AND a median beyond the noise band before I'll stand behind it
      </div>
    </article>
  );
}

function LinkMaker() {
  const [dest, setDest] = useState("kilnandco.com/shop");
  const [platform, setPlatform] = useState("instagram");
  const [label, setLabel] = useState("spring collection");
  const [copied, setCopied] = useState(false);
  const link = buildUtmLink(dest, platform, label);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <article className="mcard open il-card">
      <div className="mmean">
        Use this link in your bio and posts — every click carries its source, so attribution
        gets sharper and the <b>unknown slice shrinks</b>.
      </div>
      <div className="mk-add">
        <input className="dt-input" placeholder="destination (your shop URL)" value={dest} onChange={(e) => setDest(e.target.value)} />
        <select className="dt-input" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className="dt-input" placeholder="campaign label" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
      </div>
      {link && (
        <div className="mk-link">
          <code>{link}</code>
          <button className="dbtn primary" onClick={copy}>{copied ? "✓ copied" : "Copy"}</button>
        </div>
      )}
      <div className="il-cite">
        works with Shopify/Etsy/any site that records UTM parameters · short branded links
        (go.counsel.app) arrive with the hosted service — same idea, prettier
      </div>
    </article>
  );
}
