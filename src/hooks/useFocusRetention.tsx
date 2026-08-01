import { useCallback, useEffect, useRef } from "react";

/**
 * Evita que o foco "caia" para o <body> quando um trecho do painel é
 * desmontado/remontado (troca de tabs, refetch de filtros, expansão de árvore).
 *
 * Estratégia:
 * 1. Guardamos uma chave estável do último elemento focado dentro do container
 *    (`id` ou `data-focus-key`, com fallback para um seletor por testid+texto).
 * 2. Um MutationObserver observa o container. Se, depois de uma mudança de DOM,
 *    o foco estiver no <body> (ou fora do container), tentamos devolvê-lo ao
 *    mesmo elemento; se ele não existir mais, focamos o container (que é
 *    programaticamente focável via tabIndex={-1}).
 *
 * Só age quando o foco realmente se perdeu — nunca "rouba" foco do usuário.
 */
export function useFocusRetention<T extends HTMLElement = HTMLDivElement>() {
  const containerRef = useRef<T | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const restoringRef = useRef(false);

  const keyOf = useCallback((el: HTMLElement): string | null => {
    const explicit = el.getAttribute("data-focus-key");
    if (explicit) return `[data-focus-key="${CSS.escape(explicit)}"]`;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const testid = el.getAttribute("data-testid");
    if (testid) return `[data-testid="${CSS.escape(testid)}"]`;
    return null;
  }, []);

  // Registra o último elemento focado dentro do container.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (restoringRef.current) return;
      const container = containerRef.current;
      const target = event.target as HTMLElement | null;
      if (!container || !target || !container.contains(target)) return;
      lastKeyRef.current = keyOf(target);
    };
    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, [keyOf]);

  // Restaura o foco depois de remontagens de conteúdo.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof MutationObserver === "undefined") return;

    let frame = 0;
    const restore = () => {
      const active = document.activeElement as HTMLElement | null;
      const lostFocus = !active || active === document.body;
      if (!lostFocus) return;

      restoringRef.current = true;
      try {
        const key = lastKeyRef.current;
        const target = key ? (container.querySelector(key) as HTMLElement | null) : null;
        if (target) {
          target.focus({ preventScroll: true });
        } else {
          container.focus({ preventScroll: true });
        }
      } finally {
        restoringRef.current = false;
      }
    };

    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(restore);
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return containerRef;
}
