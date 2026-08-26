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
// public storefront URLs to the legacy 404 page. Aqui desregistramos qualquer
// Service Worker remanescente; nas rotas /c/* a rotina abaixo também apaga os
// caches antigos e recarrega uma vez para garantir o bundle novo no celular.
if ("serviceWorker" in navigator) {
  if (isStorefrontPath(window.location.pathname)) {
    void purgeLegacyServiceWorker();
  } else {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.allSettled(registrations.map((registration) => registration.unregister())))
      .catch(() => undefined);
  }
}


createRoot(document.getElementById("root")!).render(<App />);
