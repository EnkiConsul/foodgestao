// Validação fail-closed do ambiente ANTES de qualquer outro módulo (inclusive
// do cliente do banco, importado indiretamente por App).
import "./bootstrap/ambiente";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { supabase } from "./integrations/supabase/client";
import { instalarGuardasHomologacao } from "./lib/env/homologacaoRuntime";
import { installStaleBundleRecovery } from "./lib/staleBundle";
import { installCspViolationLogger } from "./lib/security/cspViolationLogger";


import "@fontsource/urbanist/600.css";
import "@fontsource/urbanist/700.css";
import "@fontsource/urbanist/800.css";
import "@fontsource/epilogue/300.css";
import "@fontsource/epilogue/400.css";
import "@fontsource/epilogue/500.css";
import "@fontsource/epilogue/600.css";
import "./index.css";

// Em homologação, mocks/allowlist/bloqueio de e-mail já foram instalados no
// `fetch` por `./bootstrap/ambiente` (antes deste cliente existir). Aqui só a
// guarda complementar dos métodos do Auth. Em produção não instala nada.
instalarGuardasHomologacao(supabase as never);

installStaleBundleRecovery();
installCspViolationLogger();
// Offline caching was removed because an old app-shell cache could route valid
// URLs to the legacy 404 page. Aqui desregistramos qualquer Service Worker
// remanescente para garantir sempre o bundle novo.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.allSettled(registrations.map((registration) => registration.unregister())))
    .catch(() => undefined);
}


createRoot(document.getElementById("root")!).render(<App />);
