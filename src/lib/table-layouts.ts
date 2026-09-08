/**
 * Regras puras do padrão global de tabelas: sanitização de layout
 * (ordem/largura/visibilidade), merge seguro em dp_user_prefs.extras
 * e alternância de visibilidade com colunas essenciais.
 */

export interface TableLayoutPref<K extends string = string> {
  order?: K[];
  widths?: Record<K, number>;
  hidden?: K[];
}

/** Ordem válida: mantém chaves conhecidas e anexa as que faltarem. */
export function sanitizeOrder<K extends string>(raw: unknown, defaultOrder: K[]): K[] {
  if (!Array.isArray(raw)) return defaultOrder;
  const validos = (raw as K[]).filter((k) => defaultOrder.includes(k));
  const faltantes = defaultOrder.filter((k) => !validos.includes(k));
  return validos.length ? [...validos, ...faltantes] : defaultOrder;
}

/** Larguras válidas: ignora chaves desconhecidas e valores abaixo do mínimo. */
export function sanitizeWidths<K extends string>(
  raw: unknown,
  defaultWidths: Record<K, number>,
  minWidth: number,
): Record<K, number> {
  const merged = { ...defaultWidths };
  if (raw && typeof raw === "object") {
    (Object.keys(defaultWidths) as K[]).forEach((k) => {
      const v = Number((raw as Record<string, unknown>)[k]);
      if (Number.isFinite(v) && v >= minWidth) merged[k] = v;
    });
  }
  return merged;
}

/** Ocultas válidas: só chaves conhecidas; essenciais nunca ficam ocultas. */
export function sanitizeHidden<K extends string>(
  raw: unknown,
  defaultOrder: K[],
  essentialKeys: K[],
  hiddenByDefault: K[],
): K[] {
  if (!Array.isArray(raw)) return hiddenByDefault;
  return (raw as K[]).filter((k) => defaultOrder.includes(k) && !essentialKeys.includes(k));
}

type Extras = Record<string, unknown>;

function layoutsOf(extras: Extras): Record<string, unknown> {
  const l = (extras as any).table_layouts;
  return l && typeof l === "object" ? { ...(l as Record<string, unknown>) } : {};
}

/**
 * Merge seguro do layout de UMA tela dentro de extras, preservando todas as
 * outras chaves (favoritos, atalhos, avisos) e layouts de outras telas.
 */
export function mergeTableLayoutExtras(extras: Extras, screenKey: string, layout: unknown): Extras {
  const layouts = layoutsOf(extras);
  layouts[screenKey] = layout;
  return { ...extras, table_layouts: layouts };
}

/** Remove somente o layout da tela informada ("Restaurar Padrão"). */
export function removeTableLayoutExtras(extras: Extras, screenKey: string): Extras {
  const layouts = layoutsOf(extras);
  delete layouts[screenKey];
  return { ...extras, table_layouts: layouts };
}

/**
 * Alterna a visibilidade de uma coluna. Retorna null quando a operação é
 * proibida: coluna essencial ou última coluna visível.
 */
export function toggleHiddenKey<K extends string>(
  hidden: K[],
  colOrder: K[],
  key: K,
  essentialKeys: K[],
): K[] | null {
  if (essentialKeys.includes(key)) return null;
  if (hidden.includes(key)) return hidden.filter((x) => x !== key);
  const visiveis = colOrder.filter((c) => !hidden.includes(c));
  if (visiveis.length <= 1) return null;
  return [...hidden, key];
}
