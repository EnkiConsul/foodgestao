/**
 * Lógica pura do gesto de arrastar entre abas (mobile).
 * Regras: abas desabilitadas são puladas e o gesto para nas pontas
 * (sem laço infinito).
 */

export type DirecaoSwipeAba = "esquerda" | "direita";

/** Índice da próxima aba ativável na direção do gesto, ou -1 se não houver. */
export function proximaAbaIndex(
  disabled: boolean[],
  activeIndex: number,
  direcao: DirecaoSwipeAba,
): number {
  if (activeIndex < 0 || activeIndex >= disabled.length) return -1;
  const passo = direcao === "esquerda" ? 1 : -1;
  let i = activeIndex + passo;
  while (i >= 0 && i < disabled.length) {
    if (!disabled[i]) return i;
    i += passo;
  }
  return -1;
}

const EDGE_PX = 28;
const MIN_DELTA_X = 70;
const MAX_DURATION_MS = 500;
const MAX_DELTA_Y = 70;

/** Encontra o container com rolagem horizontal onde o toque começou, se houver. */
function horizontalScrollerDoToque(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target : null;
  while (el) {
    if (el.scrollWidth > el.clientWidth + 8) {
      const overflowX = window.getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * O gesto cede ao scroller horizontal apenas quando ele ainda tem conteúdo
 * para rolar na direção do arrasto; no fim da rolagem, o swipe troca de aba.
 */
function scrollerBloqueiaSwipe(scroller: HTMLElement | null, dx: number): boolean {
  if (!scroller) return false;
  const max = scroller.scrollWidth - scroller.clientWidth;
  if (dx < 0) return scroller.scrollLeft < max - 4; // esquerda: ainda há conteúdo à direita
  return scroller.scrollLeft > 4; // direita: ainda há conteúdo à esquerda
}

/** Sobe do alvo do toque até o primeiro ancestral que contém uma lista de abas. */
function tablistDoToque(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    const list = el.querySelector?.('[role="tablist"]');
    if (list instanceof HTMLElement) return list;
    el = el.parentElement;
  }
  return null;
}

let instalado = false;

/**
 * Instala (uma única vez) o gesto global de swipe entre abas.
 * Arrastar para a esquerda avança para a próxima aba; para a direita volta.
 * Não interfere nos gestos de borda (28px de cada lateral), em scrollers
 * horizontais nem quando há diálogo aberto.
 */
export function instalarSwipeAbas(onTrocar?: () => void) {
  if (instalado || typeof window === "undefined") return;
  instalado = true;

  let startX = 0;
  let startY = 0;
  let startT = 0;
  let list: HTMLElement | null = null;
  let scroller: HTMLElement | null = null;

  const onStart = (e: TouchEvent) => {
    list = null;
    scroller = null;
    if (window.innerWidth >= 768) return;
    const t = e.touches[0];
    if (!t || e.touches.length > 1) return;
    const overlay = document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    );
    if (overlay) return;

    const w = window.innerWidth;
    if (t.clientX <= EDGE_PX || t.clientX >= w - EDGE_PX) return;

    const found = tablistDoToque(e.target);
    if (!found) return;

    startX = t.clientX;
    startY = t.clientY;
    startT = Date.now();
    list = found;
    scroller = horizontalScrollerDoToque(e.target);
  };

  const onEnd = (e: TouchEvent) => {
    const current = list;
    const currentScroller = scroller;
    list = null;
    scroller = null;
    if (!current) return;
    const t = e.changedTouches[0];
    if (!t) return;
    if (Date.now() - startT > MAX_DURATION_MS) return;
    if (Math.abs(t.clientY - startY) > MAX_DELTA_Y) return;
    const dx = t.clientX - startX;
    if (Math.abs(dx) < MIN_DELTA_X) return;
    if (scrollerBloqueiaSwipe(currentScroller, dx)) return;

    const triggers = Array.from(current.querySelectorAll<HTMLElement>('[role="tab"]'));
    if (triggers.length < 2) return;
    const activeIndex = triggers.findIndex((el) => el.dataset.state === "active");
    if (activeIndex < 0) return;
    const disabled = triggers.map(
      (el) => el.hasAttribute("disabled") || el.dataset.disabled !== undefined || el.getAttribute("aria-disabled") === "true",
    );
    const next = proximaAbaIndex(disabled, activeIndex, dx < 0 ? "esquerda" : "direita");
    if (next < 0) return;
    onTrocar?.();
    triggers[next].click();
  };

  window.addEventListener("touchstart", onStart, { passive: true });
  window.addEventListener("touchend", onEnd, { passive: true });
}
