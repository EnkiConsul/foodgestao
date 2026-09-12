import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { DP_ADMIN_NAV } from "@/config/dpNavigation";
import { applyMenuLayout } from "@/lib/dp/menuLayout";
import { useDpMenuLayout } from "@/hooks/useDpMenuLayout";
import { useHiddenScreens } from "@/hooks/useHiddenScreens";
import { filterSurface } from "@/lib/nav/hiddenScreens";

const EDGE_PX = 28;
const MIN_DELTA_X = 70;
const MAX_DURATION_MS = 500;
const MAX_DELTA_Y = 70;

function horizontalScrollerDoToque(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target : null;
  while (el) {
    if (el.scrollWidth > el.clientWidth + 8) {
      const overflowX = window.getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return el as HTMLElement;
    }
    el = el.parentElement;
  }
  return null;
}

function scrollerBloqueiaSwipe(scroller: HTMLElement | null, dx: number): boolean {
  if (!scroller) return false;
  const max = scroller.scrollWidth - scroller.clientWidth;
  if (dx < 0) return scroller.scrollLeft < max - 4;
  return scroller.scrollLeft > 4;
}

/**
 * Gesto de arrastar na tela de Início (mobile): esquerda abre o próximo menu
 * principal, direita volta ao anterior, na mesma ordem dos ícones. Sem laço
 * nas pontas. Não interfere nos gestos de borda (Hub/Mais), em rolagens
 * horizontais nem com diálogo aberto. Só atua quando o toque começa dentro
 * do container informado.
 */
export function useHomeSwipeMenus() {
  const navigate = useNavigate();
  const { hidden } = useHiddenScreens();
  const { layout } = useDpMenuLayout("dp");

  const destinos = useMemo(() => {
    const base = filterSurface(DP_ADMIN_NAV, hidden);
    const grupos = (layout ? applyMenuLayout(base, layout) : base).groups;
    return grupos.map((g) => g.hubTo ?? g.items[0]?.to ?? "/dp");
  }, [hidden, layout]);

  const destinosRef = useRef(destinos);
  destinosRef.current = destinos;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const container: HTMLElement | Window = window;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let ativo = false;
    let scroller: HTMLElement | null = null;

    const onStart = (e: TouchEvent) => {
      ativo = false;
      scroller = null;
      if (window.innerWidth >= 768) return;
      const t = e.touches[0];
      if (!t || e.touches.length > 1) return;
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        )
      )
        return;
      const w = window.innerWidth;
      if (t.clientX <= EDGE_PX || t.clientX >= w - EDGE_PX) return;
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      ativo = true;
      scroller = horizontalScrollerDoToque(e.target);
    };

    const onEnd = (e: TouchEvent) => {
      if (!ativo) return;
      ativo = false;
      const currentScroller = scroller;
      scroller = null;
      const t = e.changedTouches[0];
      if (!t) return;
      if (Date.now() - startT > MAX_DURATION_MS) return;
      if (Math.abs(t.clientY - startY) > MAX_DELTA_Y) return;
      const dx = t.clientX - startX;
      if (Math.abs(dx) < MIN_DELTA_X) return;
      if (scrollerBloqueiaSwipe(currentScroller, dx)) return;

      const lista = destinosRef.current;
      if (lista.length < 2) return;
      // Não há "menu atual" no Início: esquerda abre o primeiro, direita o último.
      // A partir do hub de um menu, o gesto de abas das telas assume.
      const alvo = dx < 0 ? lista[0] : lista[lista.length - 1];
      navigate(alvo);
    };

    container.addEventListener("touchstart", onStart, { passive: true });
    container.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchend", onEnd);
    };
  }, [containerRef, navigate]);
}
