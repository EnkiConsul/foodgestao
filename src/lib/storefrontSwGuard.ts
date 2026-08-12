/**
 * Invalidação automática de Service Worker antigo nas rotas públicas /c/*.
 *
 * Celulares que visitaram o site antes da remoção do PWA podem ter um Service
 * Worker + cache de app-shell antigos, que devolvem HTML/JS obsoleto e travam o
 * cardápio. Ao abrir qualquer rota /c/*, esta rotina:
 *   1. desregistra todos os Service Workers do domínio;
 *   2. apaga os caches de app-shell (Workbox/precache/runtime/html);
 *   3. recarrega a página uma única vez, para pegar o HTML/bundle novo.
 *
 * Só recarrega quando havia algo a limpar e no máximo uma vez por sessão.
 */

const RELOAD_FLAG = "sf-sw-purge-reload";

const APP_SHELL_CACHE = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)workbox|^html$/i;

export function isStorefrontPath(pathname: string): boolean {
  return pathname === "/c" || pathname.startsWith("/c/");
}

function alreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === "1";
  } catch {
    return false;
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // sessionStorage bloqueado: segue sem guarda (o unregister já evita loop).
  }
}

/** Executa a limpeza; devolve true se a página vai recarregar. */
export async function purgeLegacyServiceWorker(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  let removedSw = false;
  let removedCache = false;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const results = await Promise.allSettled(registrations.map((r) => r.unregister()));
      removedSw = results.some((r) => r.status === "fulfilled" && r.value);
    }
  } catch {
    // Ignorado: seguimos tentando limpar os caches.
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      const stale = keys.filter((k) => APP_SHELL_CACHE.test(k));
      const results = await Promise.allSettled(stale.map((k) => caches.delete(k)));
      removedCache = results.some((r) => r.status === "fulfilled" && r.value);
    }
  } catch {
    // Ignorado.
  }

  if (!removedSw && !removedCache) return false;
  if (alreadyReloaded()) return false;

  markReloaded();
  window.location.reload();
  return true;
}

/** Ponto de entrada usado pela página pública da loja. */
export function installStorefrontSwGuard() {
  if (typeof window === "undefined") return;
  if (!isStorefrontPath(window.location.pathname)) return;
  void purgeLegacyServiceWorker();
}
