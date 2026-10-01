import { useEffect, useRef, type RefObject } from "react";

type Opcoes = {
  zoom: number;
  setZoom: (z: number) => void;
  min?: number;
  max?: number;
};

const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Zoom por pinça (dois dedos) e Ctrl+roda/pinça do trackpad numa área rolável.
 * Durante o gesto aplica só uma escala visual no conteúdo (rápido); ao soltar,
 * grava o novo zoom e reposiciona a rolagem para manter o ponto entre os dedos.
 * `scroll` é a área rolável; `conteudo` é o elemento escalado.
 */
export function usePinchZoom(
  scroll: RefObject<HTMLElement>,
  conteudo: RefObject<HTMLElement>,
  { zoom, setZoom, min = 0.5, max = 4 }: Opcoes,
) {
  const estado = useRef({ zoom, setZoom, min, max });
  estado.current = { zoom, setZoom, min, max };
  const ancora = useRef<{ x: number; y: number; k: number } | null>(null);

  // Após o novo zoom renderizar, ajusta a rolagem para o ponto sob os dedos.
  useEffect(() => {
    const a = ancora.current;
    const el = scroll.current;
    if (!a || !el) return;
    ancora.current = null;
    requestAnimationFrame(() => {
      el.scrollLeft = (el.scrollLeft + a.x) * a.k - a.x;
      el.scrollTop = (el.scrollTop + a.y) * a.k - a.y;
    });
  }, [zoom, scroll]);

  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    let inicio = 0;
    let razao = 1;
    let meio = { x: 0, y: 0 };
    let ativo = false;

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const aplicarVisual = (k: number) => {
      const c = conteudo.current;
      if (!c) return;
      c.style.transformOrigin = `${el.scrollLeft + meio.x}px ${el.scrollTop + meio.y}px`;
      c.style.transform = k === 1 ? "" : `scale(${k})`;
    };

    const confirmar = () => {
      const { zoom: z, setZoom: set, min: mi, max: ma } = estado.current;
      const novo = limitar(+(z * razao).toFixed(3), mi, ma);
      aplicarVisual(1);
      if (novo !== z) {
        ancora.current = { x: meio.x, y: meio.y, k: novo / z };
        set(novo);
      }
      razao = 1;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const r = el.getBoundingClientRect();
      inicio = dist(e.touches);
      meio = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top,
      };
      ativo = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!ativo || e.touches.length !== 2) return;
      e.preventDefault();
      const { zoom: z, min: mi, max: ma } = estado.current;
      razao = limitar(z * (dist(e.touches) / inicio), mi, ma) / z;
      aplicarVisual(razao);
    };
    const onEnd = (e: TouchEvent) => {
      if (!ativo || e.touches.length >= 2) return;
      ativo = false;
      confirmar();
    };

    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      meio = { x: e.clientX - r.left, y: e.clientY - r.top };
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const { zoom: z, min: mi, max: ma } = estado.current;
      razao = limitar(z * razao * Math.exp(-dy * 0.01), mi, ma) / z;
      aplicarVisual(razao);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(confirmar, 150);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      clearTimeout(wheelTimer);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [scroll, conteudo]);
}
