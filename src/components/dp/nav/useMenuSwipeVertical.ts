import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DP_ADMIN_NAV } from "@/config/dpNavigation";
import { applyMenuLayout } from "@/lib/dp/menuLayout";
import { useDpMenuLayout } from "@/hooks/useDpMenuLayout";
import { useHiddenScreens } from "@/hooks/useHiddenScreens";
import { filterSurface } from "@/lib/nav/hiddenScreens";
import { destinoMenuVertical } from "@/lib/nav/menuSwipe";
import { haptic } from "@/lib/haptics";

const EDGE_PX = 28;
const MIN_DELTA_Y = 56;
const MAX_DURATION_MS = 800;
const MAX_DELTA_X = 70;
const HOME_TO = "/dp";

/** Primeiro ancestral com rolagem vertical, se houver. */
function verticalScrollerDoToque(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target : null;
  while (el) {
    if (el.scrollHeight > el.clientHeight + 8) {
      const overflowY = window.getComputedStyle(el).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return el as HTMLElement;
    }
    el = el.parentElement;
  }
  return null;
}

/** O gesto só arma quando não há mais rolagem na direção do arrasto. */
function rolagemBloqueiaGesto(scroller: HTMLElement | null, direcao: "cima" | "baixo"): boolean {
  if (scroller) {
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (direcao === "cima") return scroller.scrollTop < max - 4;
    return scroller.scrollTop > 4;
  }
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  if (direcao === "cima") return window.scrollY < max - 4;
  return window.scrollY > 4;
}

/**
 * Gesto vertical (mobile) nas telas de navegação: arrastar de baixo para cima
 * abre o próximo menu principal; de cima para baixo volta ao anterior (e do
 * primeiro volta ao Início). Não interfere nos gestos de borda (Hub/Mais),
 * na rolagem do conteúdo nem com diálogo aberto.
 */
export function useMenuSwipeVertical() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { hidden } = useHiddenScreens();
  const { layout } = useDpMenuLayout("dp");

  const rotas = useMemo(() => {
    const base = filterSurface(DP_ADMIN_NAV, hidden);
    const grupos = (layout ? applyMenuLayout(base, layout) : base).groups;
    return grupos.map((g) => g.hubTo ?? g.items[0]?.to).filter((r): r is string => Boolean(r));
  }, [hidden, layout]);

  const ref = useRef({ rotas, pathname });
  ref.current = { rotas, pathname };

  useEffect(() => {
    if (typeof window === "undefined") return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let ativo = false;
    let disparado = false;
    let scroller: HTMLElement | null = null;

    const podeDisparar = () => {
      if (!ativo || disparado) return false;
      if (Date.now() - startT > MAX_DURATION_MS) return false;
      return true;
    };

    /** Gesto começou numa das bordas verticais (onde não há rolagem a roubar). */
    const comecouNaBordaVertical = (direcao: "cima" | "baixo") => {
      const h = window.innerHeight;
      if (direcao === "cima" && startY >= h - EDGE_PX) return true;
      if (direcao === "baixo" && startY <= EDGE_PX) return true;
      return false;
    };

    const tentarNavegar = (clientX: number, clientY: number) => {
      if (!podeDisparar()) return;
      if (Math.abs(clientX - startX) > MAX_DELTA_X) return;
      const dy = clientY - startY;
      if (Math.abs(dy) < MIN_DELTA_Y) return;
      const direcao = dy < 0 ? "cima" : "baixo";
      if (!comecouNaBordaVertical(direcao) && rolagemBloqueiaGesto(scroller, direcao)) return;

      const destino = destinoMenuVertical({
        rotas: ref.current.rotas,
        pathname: ref.current.pathname,
        direcao,
        homeTo: HOME_TO,
      });
      if (!destino || destino === ref.current.pathname) return;
      disparado = true;
      haptic(8);
      navigate(destino);
    };

    const onStart = (e: TouchEvent) => {
      ativo = false;
      disparado = false;
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
      scroller = verticalScrollerDoToque(e.target);
    };

    const onMove = (e: TouchEvent) => {
      if (!ativo || disparado) return;
      const t = e.touches[0];
      if (!t) return;
      tentarNavegar(t.clientX, t.clientY);
    };

    const onEnd = () => {
      ativo = false;
      disparado = false;
      scroller = null;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [navigate]);
}
