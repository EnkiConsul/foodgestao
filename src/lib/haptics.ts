// Feedback háptico compartilhado para toda a UI mobile.
// Silencioso em desktops e em dispositivos sem Vibration API.

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try { navigator.vibrate(pattern); } catch { /* noop */ }
}

export const haptics = {
  /** Toque leve — botões primários, links, tiles. */
  tap: () => vibrate(8),
  /** Seleção — chips, toggles, checkbox, itens de menu. */
  select: () => vibrate(12),
  /** Sucesso — save/submit ok, favorito adicionado. */
  success: () => vibrate(20),
  /** Aviso/erro — validação, ação destrutiva. */
  warn: () => vibrate([10, 40, 10]),
};

/** Compat: chamada legada `haptic(ms)`. */
export function haptic(ms = 8) {
  vibrate(ms);
}
