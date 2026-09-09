/**
 * Resolve, a partir das decisões que o usuário tomou página por página na
 * conferência, quais páginas devem ser aprovadas normalmente, quais devem
 * substituir o documento existente, quais devem ser ignoradas e quais ainda
 * precisam de confirmação (colisão sem decisão).
 *
 * Módulo puro — sem acesso a rede ou banco.
 */
export type DecisaoDup = "skip" | "replace";

export interface ResolucaoDup {
  /** Páginas sem colisão — aprovação normal. */
  aprovar: string[];
  /** Páginas com colisão que o usuário escolheu substituir. */
  substituir: string[];
  /** Páginas com colisão que o usuário escolheu ignorar. */
  ignorar: string[];
  /** Colisões ainda sem decisão — precisam do diálogo de confirmação. */
  pendentes: string[];
}

export function resolverDecisoesDup(params: {
  /** Ids de todas as páginas elegíveis (pendentes e vinculadas). */
  elegiveis: string[];
  /** Ids com duplicata já salva no sistema. */
  duplicados: string[];
  /** Decisão por página, quando existir. */
  decisoes: Record<string, DecisaoDup | undefined>;
}): ResolucaoDup {
  const dup = new Set(params.duplicados);
  const res: ResolucaoDup = { aprovar: [], substituir: [], ignorar: [], pendentes: [] };
  for (const id of params.elegiveis) {
    if (!dup.has(id)) {
      res.aprovar.push(id);
      continue;
    }
    const d = params.decisoes[id];
    if (d === "replace") res.substituir.push(id);
    else if (d === "skip") res.ignorar.push(id);
    else res.pendentes.push(id);
  }
  return res;
}
