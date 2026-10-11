import { useRef } from "react";
import type { TouchEvent } from "react";

const MIN_DX = 50;

/** Decide o sentido do arraste horizontal; null quando é rolagem ou toque curto. */
export function direcaoSwipe(dx: number, dy: number): "esquerda" | "direita" | null {
  if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "esquerda" : "direita";
}

/** Gesto horizontal: esquerda → próximo, direita → anterior. */
export function useSwipeHorizontal(onProximo: () => void, onAnterior: () => void) {
  const inicio = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      inicio.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = inicio.current;
      inicio.current = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      // Não disputa com listas que rolam para o lado.
      let el = e.target instanceof Element ? e.target : null;
      while (el && el !== e.currentTarget) {
        if (el.scrollWidth > el.clientWidth + 8 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return;
        el = el.parentElement;
      }
      const d = direcaoSwipe(t.clientX - s.x, t.clientY - s.y);
      if (d === "esquerda") onProximo();
      else if (d === "direita") onAnterior();
    },
  };
}
