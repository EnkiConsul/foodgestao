import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSidebar } from "@/components/ui/sidebar";

const EDGE_PX = 28;
const MIN_DELTA_X = 70;
const MAX_DURATION_MS = 500;
const MAX_DELTA_Y = 70;

/**
 * Gestos de borda (mobile):
 * - Arrastar da borda esquerda para a direita → abre o menu completo (sidebar).
 * - Arrastar da borda direita para a esquerda → abre o Hub de módulos.
 *
 * Ignorado quando há dialog/sheet aberto.
 */
export function useEdgeGestures() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let mode: "left" | "right" | null = null;

    const onStart = (e: TouchEvent) => {
      mode = null;
      const t = e.touches[0];
      if (!t || e.touches.length > 1) return;
      const overlay = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
      if (overlay) return;

      const w = window.innerWidth;
      if (t.clientX <= EDGE_PX) mode = "left";
      else if (t.clientX >= w - EDGE_PX) mode = "right";
      else return;

      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
    };

    const onEnd = (e: TouchEvent) => {
      const current = mode;
      mode = null;
      if (!current) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (Date.now() - startT > MAX_DURATION_MS) return;
      if (dy > MAX_DELTA_Y) return;

      if (current === "left" && dx >= MIN_DELTA_X) {
        setOpenMobile(true);
      } else if (current === "right" && dx <= -MIN_DELTA_X) {
        if (pathname !== "/hub") navigate("/hub");
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [pathname, navigate, setOpenMobile, isMobile]);
}
