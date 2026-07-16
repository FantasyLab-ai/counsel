# Android toolchain setup for the Counsel native build (JDK 17 + SDK + NDK).
# Idempotent: safe to re-run; skips anything already present.
$ErrorActionPreference = "Continue"
$log = "C:\Users\bgrut\Desktop\Counsel\android-setup.log"
function L($m) { "$(Get-Date -Format HH:mm:ss) $m" | Out-File $log -Append -Encoding utf8 }

L "=== Android toolchain setup start ==="

# 1. JDK 17 (user scope, silent)
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
  L "installing Temurin JDK 17 via winget..."
  winget install EclipseAdoptium.Temurin.17.JDK --accept-package-agreements --accept-source-agreements --silent --disable-interactivity 2>&1 | Out-Null
  L "JDK install exit: $LASTEXITCODE"
} else { L "java already on PATH" }

$adoptium = "C:\Program Files\Eclipse Adoptium"
$jdk = Get-ChildItem $adoptium -Directory -ErrorAction SilentlyContinue |
  Where-Object Name -like "jdk-17*" | Select-Object -First 1
if ($jdk) {
  $env:JAVA_HOME = $jdk.FullName
  $env:PATH = "$($jdk.FullName)\bin;$env:PATH"
  L "JAVA_HOME=$($jdk.FullName)"
} else {
  L "WARN: JDK dir not found under $adoptium"
}

# 2. Android cmdline tools
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
New-Item -ItemType Directory -Force "$sdk\cmdline-tools" | Out-Null
$zip = "$env:TEMP\android-clt.zip"
$tmpdir = Join-Path $sdk "cmdline-tools\_tmp"
if (-not (Test-Path "$sdk\cmdline-tools\latest\bin\sdkmanager.bat")) {
  L "downloading commandline tools..."
  Invoke-WebRequest -Uri "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive $zip $tmpdir -Force
  Move-Item (Join-Path $tmpdir "cmdline-tools") "$sdk\cmdline-tools\latest" -Force
  if (Test-Path $tmpdir) { Remove-Item $tmpdir -Recurse -Force }
  L "cmdline tools installed"
} else { L "cmdline tools already present" }

# 3. licenses + packages (NDK is the big one)
$sdkm = "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"
L "accepting licenses..."
$yes = "y`n" * 12
$yes | & $sdkm --licenses 2>&1 | Select-Object -Last 1 | ForEach-Object { L "licenses: $_" }
L "installing platform-tools, android-34, build-tools 34, NDK 27..."
& $sdkm "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;27.0.12077973" 2>&1 |
  Select-Object -Last 2 | ForEach-Object { L "sdkmanager: $_" }
L ("NDK present: " + (Test-Path "$sdk\ndk\27.0.12077973"))
L "=== setup done ==="
