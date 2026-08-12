/**
 * Recuperação de bundle desatualizado.
 *
 * Depois de um deploy, um celular que já visitou o site pode ter um HTML/Service
 * Worker antigo em cache apontando para chunks JS que não existem mais. O import
 * dinâmico falha e a tela quebra ("erro ao abrir"). Aqui detectamos esse caso,
 * limpamos caches + Service Worker e recarregamos uma única vez.
 */

const FLAG = "sf-stale-bundle-reload";

const STALE_PATTERNS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "unexpected token '<'", // index.html devolvido no lugar de um .js
  "chunkloaderror",
  "loading chunk",
  "loading css chunk",
];

export function isStaleBundleError(message: unknown): boolean {
  const text = String(
    typeof message === "string" ? message : (message as Error | undefined)?.message ?? "",
  ).toLowerCase();
  return STALE_PATTERNS.some((p) => text.includes(p));
}

/**
 * Limpa caches/SW e recarrega — no máximo uma vez por sessão.
 * Com `force = true` (ação manual do usuário) o guard de sessão é ignorado.
 */
export async function recoverFromStaleBundle(force = false): Promise<boolean> {
  try {
    if (!force && sessionStorage.getItem(FLAG)) return false;
    sessionStorage.setItem(FLAG, "1");
  } catch {
    // sessionStorage bloqueado (modo privado antigo do iOS): segue sem guarda.
  }


  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
    }
  } catch {
    // Ignora: o reload abaixo ainda pode resolver.
  }

  window.location.reload();
  return true;
}

/** Escuta falhas globais de carregamento de módulo. */
export function installStaleBundleRecovery() {
  const handle = (message: unknown) => {
    if (!isStaleBundleError(message)) return;
    void recoverFromStaleBundle();
  };

  window.addEventListener("error", (e) => handle(e.message || e.error));
  window.addEventListener("unhandledrejection", (e) => handle(e.reason));
}
