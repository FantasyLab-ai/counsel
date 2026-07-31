# Counsel on iOS

Everything that can be done without a Mac is done. This file is the Mac-side
runbook, plus the decisions already made so you do not have to rediscover them
at 1am inside Xcode.

## Where it stands

| Piece | State |
|---|---|
| Capacitor iOS platform | added (`mobile/ios`) |
| Dependency manager | Swift Package Manager, not CocoaPods |
| Bundle identifier | `ai.fantasylab.counsel` (same as Android) |
| Version | 0.5.0, build 1 (matches Android) |
| Minimum iOS | 15.0 |
| Devices | iPhone only |
| Icons and splash | generated, light and dark |
| Privacy manifest | written and registered in the Xcode project |
| Export compliance | answered in Info.plist |
| Web assets | synced from the current `npm run build` |

Capacitor 8 moved iOS to Swift Package Manager, so there is no `pod install`
and no CocoaPods to fight. That is why the whole platform could be scaffolded
and configured from Windows.

## Decisions already made, and why

**iPhone only.** The layout is phone-first with a bottom tab bar. An iPad
reviewer seeing stretched screens is a design rejection under guideline 4.0.
Reverse it by setting `TARGETED_DEVICE_FAMILY = "1,2"` in the project once the
layout earns a tablet breakpoint.

**Portrait only.** Same reason. Landscape stretches every card. iPad keeps all
orientations for the day the above changes.

**arm64, not armv7.** The Capacitor template still ships the 32-bit value,
which is long dead and can fail validation.

**`ITSAppUsesNonExemptEncryption` is false.** Counsel uses only standard HTTPS,
which is exempt. Without this key App Store Connect asks the export compliance
question on every single upload.

**The privacy manifest declares crash data.** The ErrorBoundary posts an error
name, message and route to counsel-cloud. That is real collection, so it is
declared rather than hidden, marked not linked to identity and not used for
tracking. Everything else genuinely stays on the device.

## On the Mac

You need macOS with Xcode 15 or newer and an Apple Developer account. A cloud
Mac (MacStadium, Scaleway, AWS EC2 Mac, or a borrowed machine) is fine.

```bash
# 1. get the repo and install
git clone https://github.com/FantasyLab-ai/counsel.git
cd counsel && npm install && npm run build
cd mobile && npm install
cp -r ../dist/* www/
npx cap sync ios

# 2. open it
npx cap open ios
```

In Xcode:

1. Select the **App** target, **Signing and Capabilities**. Set your Team.
   Let Xcode manage signing automatically for the first build.
2. Pick a real device or a simulator and hit Run. Confirm the app boots to
   Today, the tab bar sits above the home indicator, and scrolling feels right.
3. **Product, Archive** with "Any iOS Device (arm64)" selected.
4. In the Organizer, **Distribute App**, then App Store Connect.

## On App Store Connect

Create the app with bundle ID `ai.fantasylab.counsel`, then fill in:

- **Category**: Finance
- **Age rating**: 4+
- **Privacy policy URL**: the privacy page on the Counsel site
- **App privacy**: Crash Data, not linked to the user, app functionality only.
  Nothing else. This must match `PrivacyInfo.xcprivacy`.
- **Sign in required**: no. Say so explicitly, and note in the review notes
  that the demo dataset loads with no account, because reviewers reject apps
  they cannot exercise.
- **Screenshots**: 6.7 inch and 6.5 inch iPhone are the required sizes. Take
  them from the simulator with Cmd+S.

### Review notes worth pasting

> Counsel analyses a small business owner's own sales and expense data entirely
> on the device. No account is required. Open the app and the demo dataset loads
> automatically, so every screen can be exercised immediately. Tapping any
> number opens the arithmetic behind it. The app does not process payments and
> is not a banking product; connectors are read-only and optional.

## Keeping the two platforms in step

After any web change:

```bash
npm run build
cp -r dist/* mobile/www/          # Copy-Item -Recurse -Force dist\* mobile\www\ on Windows
cd mobile && npx cap sync
```

When bumping a release, change all three so nothing drifts:
`android/app/build.gradle` (versionName, versionCode),
`ios/App/App.xcodeproj/project.pbxproj` (MARKETING_VERSION,
CURRENT_PROJECT_VERSION), and the root `package.json`.

## Still to do, and it is not code

Apple Developer Program enrolment, 99 dollars a year. Enrolling as an
individual is far faster than as an organisation, which needs a D-U-N-S number
and can take weeks. If you have already started DUNS for Google Play, the same
number serves both, but do not let it block the iOS submission: you can enrol
as an individual now and convert later.
