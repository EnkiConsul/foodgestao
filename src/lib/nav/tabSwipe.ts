import { isMobileLayoutViewport } from "@/lib/responsive";

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
      if (overflowX === "auto" || overflowX === "scroll") return el as HTMLElement;
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

/** Diálogo/janela aberta que contém o alvo do toque, se houver. */
function dialogoDoToque(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target : null;
  const dialog = el?.closest(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
  return dialog instanceof HTMLElement ? dialog : null;
}

/**
 * Pede o fechamento do diálogo como se o usuário tivesse apertado Esc — assim
 * os diálogos que confirmam alterações não salvas continuam perguntando.
 */
function fecharDialogo(dialog: HTMLElement) {
  const init = { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true };
  document.activeElement instanceof HTMLElement && document.activeElement.blur();
  dialog.dispatchEvent(new KeyboardEvent("keydown", init));
  dialog.dispatchEvent(new KeyboardEvent("keyup", init));
}

let instalado = false;

/**
 * Instala (uma única vez) o gesto global de swipe entre abas.
 * Arrastar para a esquerda avança para a próxima aba; para a direita volta.
 * Dentro de um diálogo aberto, o arrasto para a direita na primeira aba (ou em
 * diálogos sem abas) pede o fechamento da janela — os diálogos que controlam
 * alterações não salvas continuam mostrando a confirmação.
 * Não interfere nos gestos de borda (28px de cada lateral) nem em scrollers
 * horizontais.
 */
export function instalarSwipeAbas(onTrocar?: () => void) {
  if (instalado || typeof window === "undefined") return;
  instalado = true;

  let startX = 0;
  let startY = 0;
  let startT = 0;
  let list: HTMLElement | null = null;
  let dialog: HTMLElement | null = null;
  let scroller: HTMLElement | null = null;

  const onStart = (e: TouchEvent) => {
    list = null;
    dialog = null;
    scroller = null;
    if (!isMobileLayoutViewport()) return;
    const t = e.touches[0];
    if (!t || e.touches.length > 1) return;

    const overlay = document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    );
    const dialogAlvo = dialogoDoToque(e.target);
    // Diálogo aberto, mas o toque começou fora dele: gesto ignorado.
    if (overlay && !dialogAlvo) return;

    const w = window.innerWidth;
    if (t.clientX <= EDGE_PX || t.clientX >= w - EDGE_PX) return;

    const found = tablistDoToque(e.target);
    if (!found && !dialogAlvo) return;

    startX = t.clientX;
    startY = t.clientY;
    startT = Date.now();
    list = found;
    dialog = dialogAlvo;
    scroller = horizontalScrollerDoToque(e.target);
  };

  const onEnd = (e: TouchEvent) => {
    const current = list;
    const currentDialog = dialog;
    const currentScroller = scroller;
    list = null;
    dialog = null;
    scroller = null;
    if (!current && !currentDialog) return;
    const t = e.changedTouches[0];
    if (!t) return;
    if (Date.now() - startT > MAX_DURATION_MS) return;
    if (Math.abs(t.clientY - startY) > MAX_DELTA_Y) return;
    const dx = t.clientX - startX;
    if (Math.abs(dx) < MIN_DELTA_X) return;
    if (scrollerBloqueiaSwipe(currentScroller, dx)) return;

    const triggers = current
      ? Array.from(current.querySelectorAll<HTMLElement>('[role="tab"]'))
      : [];
    const activeIndex = triggers.findIndex((el) => el.dataset.state === "active");
    if (triggers.length < 2 || activeIndex < 0) {
      // Sem abas utilizáveis: dentro de um diálogo, o arrasto para a direita fecha.
      if (currentDialog && dx > 0) fecharDialogo(currentDialog);
      return;
    }
    const disabled = triggers.map(
      (el) => el.hasAttribute("disabled") || el.dataset.disabled !== undefined || el.getAttribute("aria-disabled") === "true",
    );
    const next = proximaAbaIndex(disabled, activeIndex, dx < 0 ? "esquerda" : "direita");
    if (next < 0) {
      // Primeira aba de um diálogo: o arrasto para a direita fecha a janela.
      if (currentDialog && dx > 0) fecharDialogo(currentDialog);
      return;
    }
    onTrocar?.();
    // Radix ativa a aba no mousedown (botão esquerdo), não no click.
    const alvo = triggers[next];
    alvo.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    alvo.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
    alvo.click();
  };

  window.addEventListener("touchstart", onStart, { passive: true });
  window.addEventListener("touchend", onEnd, { passive: true });
}
