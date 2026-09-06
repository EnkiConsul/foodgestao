/**
 * Regras de divisão das férias em períodos (fracionamento).
 * Espelha a validação feita no banco em `dp_ferias_validar_programacao`.
 */

export type FracionamentoRegra = {
  /** Quantos períodos, no máximo, o colaborador pode dividir as férias. */
  maxFracoes: number;
  /** Tamanho mínimo de cada período. */
  minDias: number;
  /** Tamanho mínimo que ao menos um dos períodos precisa ter. */
  maiorDias: number;
};

export const FRACIONAMENTO_PADRAO: FracionamentoRegra = {
  maxFracoes: 3,
  minDias: 5,
  maiorDias: 14,
};

export type FracaoExistente = { dias: number };

export type FracionamentoAvaliacao = {
  ok: boolean;
  /** Código de erro compatível com FERIAS_ERRO_TEXTO, quando houver problema. */
  codigo:
    | null
    | "FERIAS_FRACIONAMENTO_LIMITE"
    | "FERIAS_FRACAO_CURTA"
    | "FERIAS_FRACAO_MAIOR_AUSENTE";
  /** Quantidade de períodos depois de incluir o novo. */
  totalFracoes: number;
};

/**
 * Avalia se um novo período de férias respeita a regra de fracionamento.
 *
 * @param novosDias dias de gozo do período que está sendo marcado
 * @param existentes períodos já marcados (não cancelados) do mesmo período aquisitivo
 * @param saldoRestanteApos dias de direito que sobram depois de marcar este período
 */
export function avaliarFracionamento(
  novosDias: number,
  existentes: FracaoExistente[],
  saldoRestanteApos: number,
  regra: FracionamentoRegra = FRACIONAMENTO_PADRAO,
): FracionamentoAvaliacao {
  const total = existentes.length + 1;
  const ok = (codigo: FracionamentoAvaliacao["codigo"] = null): FracionamentoAvaliacao => ({
    ok: codigo === null,
    codigo,
    totalFracoes: total,
  });

  if (novosDias <= 0) return ok();

  // Período único que consome tudo: não há fracionamento a validar.
  if (existentes.length === 0 && saldoRestanteApos <= 0) return ok();

  if (total > regra.maxFracoes) return ok("FERIAS_FRACIONAMENTO_LIMITE");

  if (novosDias < regra.minDias) return ok("FERIAS_FRACAO_CURTA");

  if (saldoRestanteApos <= 0) {
    const maior = Math.max(novosDias, ...existentes.map((f) => f.dias), 0);
    if (maior < regra.maiorDias) return ok("FERIAS_FRACAO_MAIOR_AUSENTE");
  }

  return ok();
}

/** Texto curto para mostrar a regra vigente na tela. */
export function descreverFracionamento(regra: FracionamentoRegra): string {
  if (regra.maxFracoes <= 1) return "As férias precisam ser tiradas de uma vez só.";
  return `Até ${regra.maxFracoes} períodos, nenhum com menos de ${regra.minDias} dias e ao menos um com ${regra.maiorDias} dias ou mais.`;
}
