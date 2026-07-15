# aurora-core on mobile

One Rust crate, three delivery paths. The math is identical everywhere and
golden-parity-tested against the Python Aurora engine (`cargo test`).

## 1. WebAssembly (LIVE today)

The 65 KB `aurora_core.wasm` runs inside the Counsel PWA — computing PELT,
Welch, and AR(1) **on the device**, offline-capable:

```powershell
# rebuild after core changes (isolated rustup; system Rust untouched)
& "$env:USERPROFILE\.cargo\bin\cargo.exe" build --release --target wasm32-unknown-unknown
Copy-Item target\wasm32-unknown-unknown\release\aurora_core.wasm ..\public\ -Force
```

Loader: `src/engine/auroraCore.ts` (hand-rolled C ABI, no wasm-bindgen).
Demo screen: `/engine` — live at https://counsel-demo.pages.dev/engine

## 2. iOS (Swift) — bindings generated, needs a Mac to build

Artifacts in `bindings/`: `aurora_core.swift`, `aurora_coreFFI.h`,
`aurora_coreFFI.modulemap`.

On a Mac:
```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
cargo build --release --features ffi --target aarch64-apple-ios
cargo build --release --features ffi --target aarch64-apple-ios-sim
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libaurora_core.a -headers bindings \
  -library target/aarch64-apple-ios-sim/release/libaurora_core.a -headers bindings \
  -output AuroraCore.xcframework
```
Drag the xcframework + `aurora_core.swift` into Xcode. Call it:
```swift
let breaks = changepoints(values: revenue, model: "rbf", penalty: 10.0)
let test   = welch(a: before, b: after)          // test.p
let fc     = ar1(y: revenue, horizon: 30, alpha: 0.05)
```

## 3. Android (Kotlin) — bindings generated, needs the NDK to build

Artifact: `bindings/uniffi/aurora_core/aurora_core.kt`.

```bash
rustup target add aarch64-linux-android x86_64-linux-android
cargo install cargo-ndk
cargo ndk -t arm64-v8a -t x86_64 -o app/src/main/jniLibs \
  build --release --features ffi
```
Put `aurora_core.kt` under `app/src/main/kotlin/uniffi/aurora_core/`, add
`net.java.dev.jna:jna@aar`, then:
```kotlin
val breaks = changepoints(revenue, "rbf", 10.0)
val test   = welch(before, after)               // test.p
val fc     = ar1(revenue, 30u, 0.05)
```

## Regenerating bindings after API changes

```powershell
& "$env:USERPROFILE\.cargo\bin\cargo.exe" build --release --features ffi
& "$env:USERPROFILE\.cargo\bin\cargo.exe" run --release --features ffi --bin uniffi-bindgen -- `
  generate --library target/release/aurora_core.dll --language kotlin --language swift --out-dir bindings
```

## The rule that never bends

Python is the reference. Any change to the math must keep
`cargo test` green against a freshly generated `golden/golden.json`.
A port that drifts silently is worse than no port.
