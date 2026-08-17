// RevenueCat PUBLIC SDK keys — these are shippable client identifiers,
// not secrets (they can only be used to make purchases INTO our
// account). Empty string = billing dormant: the paywall shows the
// founding-member path and the honest "billing arrives with the store
// build" note instead of purchase buttons.
//
// Fill these from RevenueCat -> Project -> API keys after the account
// exists (see docs/STORE_LISTING.md release-tracks section).
// CURRENTLY THE TEST STORE KEY: purchases are SIMULATED (no money, no
// Apple). Validates the full buy->unlock->lapse->lock loop in TestFlight.
// BEFORE PUBLIC RELEASE swap to the production key (RC dashboard, Apps):
//   appl_YaUxMjQjYjkZrAduhrNVlAYCqrC
export const RC_IOS_KEY = "test_gQjPRVsUGUsyXvnPTDzRcDvpCXU";
export const RC_ANDROID_KEY = "";
export const RC_ENTITLEMENT = "Counsel Pro"; // matches the RC dashboard identifier exactly
