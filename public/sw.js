/* Counsel service worker — the "airplane mode works" claim, made literal.
   Strategies:
     · navigations: network-first, cached shell as the offline fallback
     · /assets/* (content-hashed): cache-first, immutable by construction
     · other same-origin GETs (data JSON, wasm, icons): stale-while-revalidate
     · counsel-cloud API + Plaid: never intercepted — live things stay live.
   Bump V to invalidate everything. */

const V = "counsel-v2026-07-17";
const SHELL = "/index.html";
const CORE = [
  SHELL,
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(V).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Live services stay live — never serve a stale sync or bank flow.
  if (url.hostname.includes("counsel-cloud") || url.hostname.includes("plaid")) return;

  // Navigations: network first, shell offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(V).then((c) => c.put(SHELL, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  if (url.origin !== location.origin) {
    // fonts etc.: stale-while-revalidate, silently
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res.ok || res.type === "opaque") {
              const copy = res.clone();
              caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }

  // Hashed build assets: immutable, cache-first.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })),
    );
    return;
  }

  // Everything else same-origin (demo JSON, wasm, icons): SWR.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
