/**
 * Disponibilidade multiunidade: quem pode ser escalado como apoio em uma
 * unidade que não é a sua. Regras:
 * - pertencer a uma unidade não dá disponibilidade em outra;
 * - a liberação é explícita e pode ser desativada sem apagar histórico;
 * - cargo e setor podem ser diferentes em cada unidade;
 * - nunca cruza empresas (o filtro recebe apenas dados da empresa atual).
 */

export interface LiberacaoApoio {
  pessoa_apoio_id: string | null;
  colaborador_id: string | null;
  unidade_id: string;
  cargo_id: string | null;
  setor_id: string | null;
  ativo: boolean;
}

export interface ContextoLiberacao {
  cargo_id: string | null;
  setor_id: string | null;
}

export interface LiberacoesDaUnidade {
  apoioIds: Set<string>;
  colaboradorIds: Set<string>;
  porApoio: Map<string, ContextoLiberacao>;
  porColaborador: Map<string, ContextoLiberacao>;
}

/** Índice das liberações ativas para uma unidade. */
export function liberacoesParaUnidade(
  liberacoes: LiberacaoApoio[],
  unidadeId: string | null,
): LiberacoesDaUnidade {
  const apoioIds = new Set<string>();
  const colaboradorIds = new Set<string>();
  const porApoio = new Map<string, ContextoLiberacao>();
  const porColaborador = new Map<string, ContextoLiberacao>();
  if (!unidadeId) return { apoioIds, colaboradorIds, porApoio, porColaborador };
  for (const r of liberacoes) {
    if (r.unidade_id !== unidadeId || !r.ativo) continue;
    const ctx: ContextoLiberacao = { cargo_id: r.cargo_id, setor_id: r.setor_id };
    if (r.pessoa_apoio_id) {
      apoioIds.add(r.pessoa_apoio_id);
      porApoio.set(r.pessoa_apoio_id, ctx);
    }
    if (r.colaborador_id) {
      colaboradorIds.add(r.colaborador_id);
      porColaborador.set(r.colaborador_id, ctx);
    }
  }
  return { apoioIds, colaboradorIds, porApoio, porColaborador };
}

/**
 * Filtra pessoas selecionáveis na rotina de uma unidade: a equipe da própria
 * unidade, quem não tem unidade definida, quem está liberado ali e quem já
 * estava selecionado (para não perder o registro em edição).
 */
export function pessoasSelecionaveisNaUnidade<T extends { id: string; unidade_id?: string | null }>(
  pessoas: T[],
  unidadeId: string | null,
  liberados: Set<string>,
  selecionadoId?: string | null,
): T[] {
  if (!unidadeId) return pessoas;
  return pessoas.filter(
    (p) =>
      p.unidade_id === unidadeId ||
      !p.unidade_id ||
      liberados.has(p.id) ||
      (!!selecionadoId && p.id === selecionadoId),
  );
}
