import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { isStaleBundleError, recoverFromStaleBundle, staleReloadAlreadyTried } from "@/lib/staleBundle";

/**
 * React.lazy resiliente a deploys: quando o arquivo da tela não carrega
 * ("Failed to fetch dynamically imported module"), tenta de novo uma vez e,
 * persistindo a falha, limpa cache + service worker e recarrega uma única vez
 * a cada 30 segundos (guarda compartilhada com `staleBundle`).
 */
export function lazyWithRetry<P extends object, T extends ComponentType<P>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<ComponentType<P>> {
  return lazy<ComponentType<P>>(async () => {
    try {
      return await factory();
    } catch {
      // Segunda tentativa: falha de rede momentânea resolve aqui, sem recarregar.
      try {
        return await factory();
      } catch (error) {
        if (isStaleBundleError(error) && !staleReloadAlreadyTried()) {
          const recovered = await recoverFromStaleBundle();
          if (!recovered) throw error;
          // Mantém o Suspense ativo enquanto a página recarrega.
          return new Promise<{ default: T }>(() => {});
        }
        throw error;
      }
    }
  });
}
