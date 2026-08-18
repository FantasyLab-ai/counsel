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

const _direct: Record<string, unknown> = {};

/** The offering's packages, for the paywall buttons. */
export async function listPackages(): Promise<PackageView[]> {
  if (!billingAvailable()) return [];
  try {
    const Purchases = await rc();
    if (!configured) await initBilling();
    const { current } = await Purchases.getOfferings();
    const pks = (current?.availablePackages ?? []).map((p) => ({
      id: p.identifier,
      identifier: p.identifier,
      title: `${p.product.priceString}${p.packageType === "ANNUAL" ? " / year" : " / month"}`,
    }));
    if (pks.length) return pks;
    // Offerings empty -> go straight at the store products. Sidesteps any
    // offering-level config or cache issue; StoreKit is the only gate left.
    const res = await Purchases.getProducts({ productIdentifiers: ["counsel_pro_monthly", "counsel_pro_annual"] });
    return (res.products ?? []).map((pr) => {
      _direct[`direct:${pr.identifier}`] = pr;
      return {
        id: `direct:${pr.identifier}`,
        identifier: `direct:${pr.identifier}`,
        title: `${pr.priceString}${pr.identifier.includes("annual") ? " / year" : " / month"}`,
      };
    });
  } catch { return []; }
}

/** Why is the paywall empty? A plain-English, stage-by-stage diagnosis —
 *  the same honesty the OAuth failure pages practice. */
export async function billingDiag(): Promise<string> {
  const p = nativePlatform();
  if (!p) {
    return typeof window !== "undefined" && (window as { Capacitor?: unknown }).Capacitor
      ? "native shell detected but platform undetected — billing bridge not wired"
      : "";
  }
  if (!(p === "ios" ? RC_IOS_KEY : RC_ANDROID_KEY)) return `no ${p} billing key in this build yet`;
  try {
    const Purchases = await rc();
    if (!configured) await initBilling();
    if (!configured) return "billing SDK could not start — close and reopen the app";
    const offerings = await Purchases.getOfferings();
    const all = Object.keys(offerings.all ?? {});
    if (!offerings.current) {
      return all.length
        ? `no offering is marked CURRENT in RevenueCat (found: ${all.join(", ")})`
        : "no offerings configured in RevenueCat yet";
    }
    const n = offerings.current.availablePackages?.length ?? 0;
    if (n === 0) {
      return `offering "${offerings.current.identifier}" is current, but the App Store returned none of its products — subscription metadata or availability is still incomplete or propagating`;
    }
    return `offering "${offerings.current.identifier}" has ${n} package${n > 1 ? "s" : ""} — if no buttons show, reopen this screen`;
  } catch (e) {
    return `billing check failed: ${String(e instanceof Error ? e.message : e).slice(0, 120)}`;
  }
}

/** Purchase a package. Returns true when the entitlement is active. */
export async function purchase(identifier: string): Promise<boolean> {
  if (!billingAvailable()) return false;
  try {
    const Purchases = await rc();
    if (identifier.startsWith("direct:")) {
      const product = _direct[identifier];
      if (!product) return false;
      const rcAny = Purchases as unknown as { purchaseStoreProduct: (o: { product: unknown }) => Promise<{ customerInfo: { entitlements?: { active?: Record<string, unknown> } } }> };
      const { customerInfo } = await rcAny.purchaseStoreProduct({ product });
      const okD = Boolean(customerInfo?.entitlements?.active?.[RC_ENTITLEMENT]);
      if (okD) grantStorePro();
      return okD;
    }
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
