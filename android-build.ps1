# Builds the Counsel Engine APK end-to-end (ASCII only - PS 5.1 reads
# BOM-less files as ANSI, so no fancy dashes here):
#   1. cargo-ndk compiles aurora-core for arm64-v8a + x86_64 -> jniLibs
#   2. Gradle assembles the release APK
$ErrorActionPreference = "Stop"
$counsel = "C:\Users\bgrut\Desktop\Counsel"
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$ndkDir = Get-ChildItem "$sdk\ndk" -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $ndkDir) { throw "NDK not installed yet - run android-setup.ps1 first" }
$jdk = Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory | Where-Object Name -like "jdk-17*" | Select-Object -First 1

$env:ANDROID_HOME = $sdk
$env:ANDROID_NDK_HOME = $ndkDir.FullName
$env:JAVA_HOME = $jdk.FullName
$cargoBin = "$env:USERPROFILE\.cargo\bin"
$env:PATH = "$($jdk.FullName)\bin;$cargoBin;$env:PATH"

Write-Host "== 1/2 cargo-ndk: aurora-core -> jniLibs (NDK $($ndkDir.Name)) =="
Set-Location "$counsel\core"
cargo ndk -t arm64-v8a -t x86_64 -o "$counsel\android\app\src\main\jniLibs" build --release --features ffi
if ($LASTEXITCODE -ne 0) { throw "cargo-ndk build failed" }

Write-Host "== 2/2 Gradle assembleRelease =="
Set-Location "$counsel\android"
& "$counsel\tools\gradle-8.9\bin\gradle.bat" assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { throw "gradle build failed" }

$apk = Get-ChildItem "$counsel\android\app\build\outputs\apk\release\*.apk" | Select-Object -First 1
$mb = [math]::Round($apk.Length / 1mb, 1)
Write-Host "APK: $($apk.FullName)  ($mb MB)"
