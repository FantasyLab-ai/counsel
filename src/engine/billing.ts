// Store billing via RevenueCat — the bridge between the app stores'
// subscription machinery and Counsel's entitlement flag.
//
// Design rules:
//   * NATIVE ONLY. On the web/PWA this module is a no-op: store billing
//     legally lives in the store builds; the web paywall stays informational.
//   * DORMANT WITHOUT KEYS. Until billingConfig.ts carries the public
//     SDK keys, everything returns "unavailable" and the paywall keeps
//     its honest pre-billing copy.
//   * THE ENTITLEMENT IS THE TRUTH. RevenueCat's 'pro' entitlement maps
//     to grantStorePro/revokeStorePro; founding members are NEVER
//     touched by store state (their tier isn't store-sourced).
//   * Purchases can be restored (reinstalls, new phones) — restore is a
//     first-class button, not an afterthought.

import { RC_ANDROID_KEY, RC_ENTITLEMENT, RC_IOS_KEY } from "./billingConfig";
import { grantStorePro, proState, revokeStorePro } from "./entitlement";

interface PackageView {
  id: string;
  title: string;      // "$14.99 / month"
  identifier: string; // RC package identifier
}

function nativePlatform(): "ios" | "android" | null {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    const p = cap?.getPlatform?.();
    return p === "ios" || p === "android" ? p : null;
  } catch { return null; }
}

export function billingAvailable(): boolean {
  const p = nativePlatform();
  if (!p) return false;
  return Boolean(p === "ios" ? RC_IOS_KEY : RC_ANDROID_KEY);
}

let configured = false;

async function rc() {
  const mod = await import("@revenuecat/purchases-capacitor");
  return mod.Purchases;
}

/** Configure once at app start (main.tsx). Applies any already-active
 *  subscription to the entitlement flag, and keeps listening. */
export async function initBilling(): Promise<void> {
  if (!billingAvailable() || configured) return;
  try {
    const Purchases = await rc();
    const platform = nativePlatform();
    await Purchases.configure({
      apiKey: platform === "ios" ? RC_IOS_KEY : RC_ANDROID_KEY,
    });
    configured = true;
    const apply = (info: { entitlements?: { active?: Record<string, unknown> } }) => {
      const active = Boolean(info?.entitlements?.active?.[RC_ENTITLEMENT]);
      const cur = proState();
      if (active) grantStorePro();
      // Only a store-sourced tier lapses with the subscription —
      // founding members keep Pro regardless of store state.
      else if (cur.tier === "pro" && cur.source === "store") revokeStorePro();
    };
    const { customerInfo } = await Purchases.getCustomerInfo();
    apply(customerInfo);
    await Purchases.addCustomerInfoUpdateListener((customerInfo) => apply(customerInfo));
  } catch {
    // Billing must never take the app down; the paywall degrades to
    // its informational state.
    configured = false;
  }
}

/** The offering's packages, for the paywall buttons. */
export async function listPackages(): Promise<PackageView[]> {
  if (!billingAvailable()) return [];
  try {
    const Purchases = await rc();
    if (!configured) await initBilling();
    const { current } = await Purchases.getOfferings();
    return (current?.availablePackages ?? []).map((p) => ({
      id: p.identifier,
      identifier: p.identifier,
      title: `${p.product.priceString}${p.packageType === "ANNUAL" ? " / year" : " / month"}`,
    }));
  } catch { return []; }
}

/** Purchase a package. Returns true when the entitlement is active. */
export async function purchase(identifier: string): Promise<boolean> {
  if (!billingAvailable()) return false;
  try {
    const Purchases = await rc();
    const { current } = await Purchases.getOfferings();
    const pkg = current?.availablePackages.find((p) => p.identifier === identifier);
    if (!pkg) return false;
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const ok = Boolean(customerInfo?.entitlements?.active?.[RC_ENTITLEMENT]);
    if (ok) grantStorePro();
    return ok;
  } catch { return false; } // user cancel lands here too — no drama
}

/** Restore purchases (reinstall / new device). */
export async function restore(): Promise<boolean> {
  if (!billingAvailable()) return false;
  try {
    const Purchases = await rc();
    const { customerInfo } = await Purchases.restorePurchases();
    const ok = Boolean(customerInfo?.entitlements?.active?.[RC_ENTITLEMENT]);
    if (ok) grantStorePro();
    return ok;
  } catch { return false; }
}
