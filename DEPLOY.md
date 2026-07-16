# Deploying Counsel

## The PWA (already live)

Static, no build server needed beyond `npm run build`:

```powershell
npm run build
npx wrangler pages deploy dist --project-name counsel-demo --commit-dirty=true
```

→ https://counsel-demo.pages.dev (permanent). The on-device engines (WASM +
CSV drop-in) make the deployed PWA a REAL product with no backend at all.

## The backend (when hosted mode is wanted)

The backend adds: connector syncs stored server-side, the full Aurora Python
engine for Today/Numbers/Ask, and multi-device continuity. It's a Flask app
wrapping the Aurora repo.

**15-minute path (any of Fly.io / Railway / Render / a $5 VPS):**

1. Side-by-side checkout:
   ```bash
   git clone https://github.com/FantasyLab-ai/counsel && cd counsel
   git clone https://github.com/FantasyLab-ai/aurora aurora
   ```
2. Build + run the container:
   ```bash
   docker build -t counsel-backend -f server/Dockerfile .
   docker run -p 8100:8100 counsel-backend
   ```
3. Point the PWA at it: set `VITE_COUNSEL_API=https://your-host` at build time
   (`npm run build`) and redeploy Pages.

Endpoints the app/CLI use: `/api/health`, `/api/brief`, `/api/metrics`,
`/api/ask`, `POST /api/connect/<stripe|square|shopify|plaid>`,
`POST /api/import/csv`.

**Credentials note:** connect endpoints use credentials per-request and do
not persist them. Add a token store + auth before exposing publicly with
real keys (Phase 2C accounts work).

## Mobile

- Android: `android-build.ps1` → signed APK (also hosted at
  /CounselEngine.apk on the demo site). CI builds it on every core/android push.
- iOS: CI builds AuroraCore.xcframework; device installs need one Mac
  session (TestFlight signing) — rent a cloud Mac for launch week.
