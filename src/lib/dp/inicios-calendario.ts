import { dataInicioVinculoAtual, elegivelAniversarioContratacao, type VinculoAniversario } from "./aniversarios-contratacao";

export type InicioCalendario = { id: string; colaboradorId: string | null; preadmissaoId: string | null; nome: string; unidadeId: string | null; data: string; tipo: "formal" | "prevista" | "provisorio" | "operacional" };
export type ColaboradorInicio = VinculoAniversario & { id: string; nome: string; unidade_id: string | null; data_desligamento?: string | null };
export type PreadmissaoInicio = { id: string; candidato_nome: string; status: string; unidade_prevista_id: string | null; colaborador_id: string | null; admin_dados?: Record<string, unknown> | null };

/**
 * Início de trabalho no calendário operacional.
 * "provisorio" vale apenas com a admissão ainda em curso: ao concluir a pré-admissão,
 * o marco passa a ser a admissão oficial do próprio cadastro (mesmo registro), e a
 * previsão deixa de ser exibida.
 */
export function montarIniciosCalendario(colaboradores: ColaboradorInicio[], preadmissoes: PreadmissaoInicio[], competencia: string): InicioCalendario[] {
  const eventos: InicioCalendario[] = [];
  const adicionar = (evento: InicioCalendario) => {
    if (evento.data.startsWith(`${competencia}-`) && /^\d{4}-\d{2}-\d{2}$/.test(evento.data)) eventos.push(evento);
  };
  const provisorios = new Set<string>();
  const efetivadas = new Set<string>();
  for (const p of preadmissoes) {
    if (["cancelado", "expirado"].includes(p.status)) continue;
    const rotina = p.admin_dados?.rotina as { colaborador_id?: string; iniciou_em?: string } | undefined;
    if (p.status === "concluido") {
      if (rotina?.colaborador_id) efetivadas.add(rotina.colaborador_id);
      if (p.colaborador_id) efetivadas.add(p.colaborador_id);
      continue;
    }
    if (rotina?.colaborador_id) provisorios.add(rotina.colaborador_id);
    if (rotina?.iniciou_em) adicionar({ id: `${p.id}-rotina`, colaboradorId: rotina.colaborador_id ?? null, preadmissaoId: p.id, nome: p.candidato_nome, unidadeId: p.unidade_prevista_id, data: rotina.iniciou_em, tipo: "provisorio" });
    const prevista = p.admin_dados?.data_admissao;
    if (typeof prevista === "string") adicionar({ id: `${p.id}-prevista`, colaboradorId: rotina?.colaborador_id ?? null, preadmissaoId: p.id, nome: p.candidato_nome, unidadeId: p.unidade_prevista_id, data: prevista, tipo: "prevista" });
  }
  for (const c of colaboradores) {
    if (c.origem_cadastro === "preadmissao_rotina" && provisorios.has(c.id)) continue;
    const efetivada = efetivadas.has(c.id);
    const formal = efetivada || elegivelAniversarioContratacao(c);
    const data = formal ? dataInicioVinculoAtual(c) : c.data_admissao;
    if (!data || (c.data_desligamento && data > c.data_desligamento)) continue;
    adicionar({ id: `${c.id}-inicio`, colaboradorId: c.id, preadmissaoId: null, nome: c.nome, unidadeId: c.unidade_id, data, tipo: c.origem_cadastro === "preadmissao_rotina" && !efetivada ? "provisorio" : formal ? "formal" : "operacional" });
  }
  return eventos.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, "pt-BR"));
}
