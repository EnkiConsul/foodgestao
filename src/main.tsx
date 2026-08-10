import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { installStaleBundleRecovery } from "./lib/staleBundle";
import "@fontsource/urbanist/600.css";
import "@fontsource/urbanist/700.css";
import "@fontsource/urbanist/800.css";
import "@fontsource/epilogue/300.css";
import "@fontsource/epilogue/400.css";
import "@fontsource/epilogue/500.css";
import "@fontsource/epilogue/600.css";
import "./index.css";

installStaleBundleRecovery();


// PWA: register service worker only in production, outside Lovable preview/iframe.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const host = window.location.hostname;
const isPreviewHost =
  host.includes("id-preview--") ||
  host.includes("lovableproject.com") ||
  host.includes("lovable.app") && host.includes("--");

// Kill-switch: allow `?sw=off` to force-unregister any SW and clear caches.
const swOff = new URLSearchParams(window.location.search).get("sw") === "off";

if (swOff && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (regs) => {
    await Promise.allSettled(regs.map((r) => r.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((k) => caches.delete(k)));
    }
    window.location.replace(window.location.pathname);
  });
} else if (import.meta.env.PROD && !isInIframe && !isPreviewHost && "serviceWorker" in navigator) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        // New version available: apply immediately to avoid stale-bundle white screens.
        updateSW(true);
      },
      onRegisteredSW: (_swUrl, registration) => {
        if (!registration) return;
        // Periodically check for updates so long-lived tabs pick up new deploys.
        setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
      },
    });
  });
} else if ("serviceWorker" in navigator && (isInIframe || isPreviewHost)) {
  // Cleanup any previously registered SW in preview/iframe contexts.
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}


createRoot(document.getElementById("root")!).render(<App />);
