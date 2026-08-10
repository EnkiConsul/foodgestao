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

// Offline caching was removed because an old app-shell cache could route valid
// public storefront URLs to the legacy 404 page. The replacement /sw.js also
// unregisters returning browsers that have not loaded this bundle yet.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.allSettled(registrations.map((registration) => registration.unregister())))
    .catch(() => undefined);
}

createRoot(document.getElementById("root")!).render(<App />);
