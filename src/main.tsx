import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";

// Offline shell (prod only — dev server owns its own module graph).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* offline still optional */ });
  });
}

// Store billing (native builds only; dormant on web and until the
// RevenueCat keys exist). Applies an active subscription to the Pro
// entitlement at startup and keeps listening for changes.
import { initBilling } from "./engine/billing";
initBilling().catch(() => { /* billing must never block the app */ });

// Capture the Android install prompt EARLY — it fires before screens mount.
declare global { interface Window { __deferredInstall?: Event & { prompt(): Promise<void> } } }
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__deferredInstall = e as Window["__deferredInstall"];
  window.dispatchEvent(new CustomEvent("counsel:installable"));
});
window.addEventListener("appinstalled", () => { window.__deferredInstall = undefined; });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
