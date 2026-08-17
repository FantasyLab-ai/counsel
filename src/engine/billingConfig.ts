// RevenueCat PUBLIC SDK keys — these are shippable client identifiers,
// not secrets (they can only be used to make purchases INTO our
// account). Empty string = billing dormant: the paywall shows the
// founding-member path and the honest "billing arrives with the store
// build" note instead of purchase buttons.
//
// Fill these from RevenueCat -> Project -> API keys after the account
// exists (see docs/STORE_LISTING.md release-tracks section).
// PRODUCTION App Store key. In TestFlight this still means SANDBOX
// purchases (no real charges) — real money begins only at public App
// Store release. Test Store key (test_gQjPRVsUGUsyXvnPTDzRcDvpCXU)
// retired 2026-08-17 after validating the purchase loop.
export const RC_IOS_KEY = "appl_YaUxMjQjYjkZrAduhrNVlAYCqrC";
export const RC_ANDROID_KEY = "";
export const RC_ENTITLEMENT = "Counsel Pro"; // matches the RC dashboard identifier exactly
