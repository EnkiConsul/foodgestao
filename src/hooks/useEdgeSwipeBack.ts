import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const EDGE_PX = 24;
const MIN_DELTA_X = 60;
const MAX_DURATION_MS = 300;
const MAX_DELTA_Y = 60;

const HUB_HOMES = new Set([
  "/",
  "/hub",
  "/dashboard",
  "/dp/home",
  "/dp/meu",
  "/admin/home",
  "/auth",
]);

/**
 * Swipe da borda esquerda para navegar de volta, padrão iOS.
 * Ignora quando há dialog aberto ou a rota atual é uma home de hub.
 */
export function useEdgeSwipeBack() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    // Não instalamos em rotas raiz de módulo — não há para onde voltar.
    if (HUB_HOMES.has(pathname)) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let armed = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX > EDGE_PX) return;
      // Ignora se há dialog/sheet aberto (Radix).
      const openOverlay = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
      if (openOverlay) return;
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      armed = true;
    };

    const onEnd = (e: TouchEvent) => {
      if (!armed) return;
      armed = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      const dt = Date.now() - startT;
      if (dt > MAX_DURATION_MS) return;
      if (dy > MAX_DELTA_Y) return;
      if (dx < MIN_DELTA_X) return;
      navigate(-1);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [pathname, navigate]);
}
