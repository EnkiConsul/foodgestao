import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Reseta o scroll para o topo a cada navegação de rota.
 * Preserva scroll quando há hash (âncoras) ou state.preserveScroll === true.
 * Respeita prefers-reduced-motion via CSS global (scroll-behavior: auto).
 */
export function ScrollToTop() {
  const { pathname, hash, state } = useLocation();

  useEffect(() => {
    if (hash) return;
    if (state && (state as { preserveScroll?: boolean }).preserveScroll) return;

    // Usa 'instant' para evitar animação em transições de página.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash, state]);

  return null;
}
