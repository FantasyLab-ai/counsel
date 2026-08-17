// Counsel Pro — the entitlement layer.
//
// The rule this file enforces by construction: the HONESTY is free.
// Receipts, math sheets, calibration, refusals — no gate touches them,
// ever. Pro gates the parts of Counsel that ACT (execution rails, Pay
// Yourself), WATCH (sentinel push), or SCALE (board packet, extra
// sources). "You pay for Counsel to work for you, not to stop lying
// to you."
//
// Tiers:
//   free      the full honest advisor
//   founding  pilot users — Pro forever, redeemed with an offline code
//   pro       store subscription (RevenueCat wiring lands with the
//             store builds; until then the purchase buttons are
//             honest about not being live)
//
// Founding codes: 12 codes live OUTSIDE the repo with Brandon; only
// their SHA-256 hashes ship here (this repo is public). Redemption is
// on-device — no server, consistent with the no-login model.

export type ProTier = "free" | "founding" | "pro";

interface ProState {
  tier: ProTier;
  since: string;       // ISO date of grant
  source: "code" | "store" | "none";
}

const KEY = "counsel.pro";

// SHA-256 hashes of the 12 founding-member codes (codes themselves are
// with Brandon, off-repo). A hash match grants the founding tier.
const FOUNDING_HASHES = new Set<string>([
  "9f1c98711bc78d72b9789d1f1bb4096951204631ed89a59ed0626c9569b920bf",
  "62a6e661ea82bc889b1b0bf8bcbdbc99ec99fa4bdd7952eeb98ad37835519383",
  "280fa7b8cf7af2d6af408f48a4fc8737b54af16f22403238d5e27de97ecd90c4",
  "cbb785b6dc03fa2c7bae421f1de6d31a72847dd1beef1e7bc1af21a7b8e97419",
  "185c5c60c810796bba499ed1ce7b1627adf3bc1c4b7083ac6490609b7f3252cd",
  "6f7054b66b538afeb4b54d64aec59b91fb4f5278619fa8df08c6a0d92e794ce1",
  "12e57094c49d910d7aae18ddcef8fc1f1666fdaa38a458481a01d8209732ab35",
  "2be5cca30ce379976cf846e41fd18974a1bb7073571afc0e8b6da54016f258f9",
  "bbc73dd10da628d7ea5909ce1c67572ff157f15c947cf7863d296a53c05a9d7e",
  "635ca6dd3eba18658f1835a75b15fbcd552ccad8ce34657eaf59576dc2a1106b",
  "0f665d58d33d7605c6ce0915e63030f804202d175fc649d77b30f60ed759d125",
  "f190a1c14b63d24a340b19e559117f2ddcee22813df42fe5f7eecce320794b2d",
]);

export function proState(): ProState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as ProState;
      if (s && (s.tier === "founding" || s.tier === "pro")) return s;
    }
  } catch { /* fall through to free */ }
  return { tier: "free", since: "", source: "none" };
}

export function isPro(): boolean {
  const t = proState().tier;
  return t === "founding" || t === "pro";
}

export function tierLabel(): string {
  const s = proState();
  if (s.tier === "founding") return "Founding member · Pro for life";
  if (s.tier === "pro") return "Counsel Pro";
  return "Free";
}

/** Redeem a founding-member code. Returns true on success. */
export async function redeemFoundingCode(code: string): Promise<boolean> {
  const clean = code.trim().toUpperCase();
  if (!clean) return false;
  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(clean),
  );
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!FOUNDING_HASHES.has(hex)) return false;
  const state: ProState = {
    tier: "founding",
    since: new Date().toISOString().slice(0, 10),
    source: "code",
  };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { return false; }
  return true;
}

/** Store-billing hooks — driven by RevenueCat's entitlement state (see
 *  engine/billing.ts). Founding tiers are never store-sourced, so a
 *  lapsed subscription can only revoke what a subscription granted. */
export function grantStorePro(): void {
  if (proState().tier === "founding") return; // founding outranks store
  const state: ProState = {
    tier: "pro",
    since: new Date().toISOString().slice(0, 10),
    source: "store",
  };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* noop */ }
}

export function revokeStorePro(): void {
  const cur = proState();
  if (cur.tier === "pro" && cur.source === "store") {
    try { localStorage.removeItem(KEY); } catch { /* noop */ }
  }
}

/** What Pro includes — one list, used by the paywall and any gate copy.
 *  Keep in sync with docs/STORE_LISTING.md. */
export const PRO_FEATURES: { name: string; line: string; status: "live" | "soon" }[] = [
  { name: "Pay Yourself", line: "the largest owner draw your cash floor can support, computed not guessed", status: "live" },
  { name: "Execution rails", line: "price changes with your signature, watched by the engine that proposed them, auto-reverted if reality disagrees", status: "live" },
  { name: "The Weekly Board Meeting", line: "a Sunday board packet for businesses too small to have a board", status: "live" },
  { name: "Unlimited sources + bank feeds", line: "every connector at once, bank expenses included", status: "live" },
  { name: "Counsel Watch", line: "24/7 sentinel with push alerts when a day breaks its band", status: "soon" },
  { name: "Accountant handoff", line: "a clean monthly close packet your CPA can bill less for", status: "soon" },
];
