import { lazy, type ComponentType } from "react";

const RELOAD_FLAG = "lovable:chunk-reloaded";

/**
 * React.lazy resiliente a deploys: quando um chunk antigo some do CDN
 * ("Failed to fetch dynamically imported module"), tenta novamente com
 * cache-busting e, em último caso, recarrega a página uma única vez.
 */
export function lazyWithRetry<T extends ComponentType<never>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (error) {
      const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1";
      if (!alreadyReloaded) {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
        // Mantém o Suspense ativo enquanto a página recarrega.
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
