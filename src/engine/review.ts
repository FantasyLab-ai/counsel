// In-app rating request, asked at a moment of value and never again.
//
// Two moments qualify: the third opened receipt (they are reading the
// math — the thing this app is for), or the first successful cloud
// sync (they just trusted us with real data). Whichever lands first
// asks; the flag then blocks every later ask. iOS itself may decline
// to show the sheet (Apple caps prompts per year) — that is Apple's
// call, ours is only to never nag.

const K_ASKED = "counsel.reviewAsked";
const K_OPENS = "counsel.receiptOpens";

function isNative(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    const plat = cap?.getPlatform?.();
    return plat === "ios" || plat === "android";
  } catch { return false; }
}

export async function maybeRequestReview(trigger: "receipts" | "sync"): Promise<void> {
  try {
    if (!isNative()) return;
    if (localStorage.getItem(K_ASKED)) return;
    if (trigger === "receipts") {
      const opens = parseInt(localStorage.getItem(K_OPENS) || "0", 10);
      if (opens < 3) return;
    }
    localStorage.setItem(K_ASKED, new Date().toISOString().slice(0, 10));
    const { InAppReview } = await import("@capacitor-community/in-app-review");
    await InAppReview.requestReview();
  } catch { /* a rating ask must never break anything */ }
}

/** Called on every opened math sheet; the third open triggers the ask. */
export function noteReceiptOpen(): void {
  try {
    const n = parseInt(localStorage.getItem(K_OPENS) || "0", 10) + 1;
    localStorage.setItem(K_OPENS, String(n));
    if (n >= 3) void maybeRequestReview("receipts");
  } catch { /* fine */ }
}
