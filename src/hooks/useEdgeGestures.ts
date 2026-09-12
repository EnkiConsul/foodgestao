import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSidebar } from "@/components/ui/sidebar";
import { useActiveModule } from "@/hooks/useActiveModule";
import { MODULE_NAV } from "@/config/mobileNav";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import { isModuleUsable } from "@/lib/modules";
import { destinoGestoEsquerda } from "@/lib/nav/edgeGestureTargets";
import { haptic } from "@/lib/haptics";

const EDGE_PX = 28;
const MIN_DELTA_X = 56;
const MAX_DURATION_MS = 800;
const MAX_DELTA_Y = 70;


/** Detecta se o toque começou dentro de um container com rolagem horizontal. */
function startedInHorizontalScroller(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el) {
    if (el.scrollWidth > el.clientWidth + 8) {
      const overflowX = window.getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Gestos de borda (mobile), alinhados aos padrões iOS/Android:
 * - Arrastar da borda esquerda para a direita → Voltar (na tela inicial de
 *   Pessoas 360°, abre o Hub de módulos ou o Analytics de Pessoas).
 * - Arrastar da borda direita para a esquerda → abre o menu "Mais" do módulo.
 *
 * Ignorado quando há dialog/sheet aberto ou o toque inicia em scroller horizontal.
 */
export function useEdgeGestures() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isMobile } = useSidebar();
  const activeModule = useActiveModule();
  const { modules } = useCompanyModules();
  const modulosAtivos = Object.values(modules).filter(isModuleUsable).length;

  const config = MODULE_NAV[activeModule] ?? MODULE_NAV.financeiro;
  const moreTo = config.moreTo;
  const homeTo = config.home.to;

  // Contador de navegações feitas dentro do app nesta sessão de montagem.
  const depthRef = useRef(0);
  useEffect(() => {
    depthRef.current += 1;
  }, [pathname]);




  useEffect(() => {
    if (!isMobile) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let mode: "left" | "right" | null = null;
    let disparado = false;

    const podeDisparar = () => {
      if (!mode || disparado) return false;
      if (Date.now() - startT > MAX_DURATION_MS) return false;
      return true;
    };

    const executarEsquerda = () => {
      haptic(8);
      const destino = destinoGestoEsquerda({ activeModule, pathname, homeTo, moreTo, modulosAtivos });
      if (destino.tipo === "navegar") {
        navigate(destino.to);
        return;
      }
      // Sem histórico interno (entrada direta) → volta para a home do módulo.
      if (depthRef.current > 1 && window.history.length > 1) navigate(-1);
      else if (pathname !== homeTo) navigate(homeTo);
    };

    const executarDireita = () => {
      haptic(8);
      if (pathname === moreTo) {
        if (depthRef.current > 1 && window.history.length > 1) navigate(-1);
        else navigate(homeTo);
      } else {
        navigate(moreTo);
      }
    };

    const tentarNavegar = (clientX: number, clientY: number) => {
      if (!podeDisparar()) return;
      const dx = clientX - startX;
      const dy = Math.abs(clientY - startY);
      if (dy > MAX_DELTA_Y) return;

      if (mode === "left" && dx >= MIN_DELTA_X) {
        disparado = true;
        executarEsquerda();
      } else if (mode === "right" && dx <= -MIN_DELTA_X) {
        disparado = true;
        executarDireita();
      }
    };

    const onStart = (e: TouchEvent) => {
      mode = null;
      disparado = false;
      const t = e.touches[0];
      if (!t || e.touches.length > 1) return;
      const overlay = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
      if (overlay) return;
      if (startedInHorizontalScroller(e.target)) return;

      const w = window.innerWidth;
      if (t.clientX <= EDGE_PX) mode = "left";
      else if (t.clientX >= w - EDGE_PX) mode = "right";
      else return;

      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
    };

    const onMove = (e: TouchEvent) => {
      if (!mode || disparado) return;
      const t = e.touches[0];
      if (!t) return;
      tentarNavegar(t.clientX, t.clientY);
    };

    const onEnd = () => {
      mode = null;
      disparado = false;
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
  }, [pathname, navigate, isMobile, moreTo, homeTo, activeModule, modulosAtivos]);
}
