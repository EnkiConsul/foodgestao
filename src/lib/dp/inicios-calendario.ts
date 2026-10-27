import { dataInicioVinculoAtual, elegivelAniversarioContratacao, type VinculoAniversario } from "./aniversarios-contratacao";

export type InicioCalendario = { id: string; colaboradorId: string | null; preadmissaoId: string | null; nome: string; unidadeId: string | null; data: string; tipo: "formal" | "prevista" | "provisorio" | "operacional" };
export type ColaboradorInicio = VinculoAniversario & { id: string; nome: string; unidade_id: string | null; data_desligamento?: string | null };
export type PreadmissaoInicio = { id: string; candidato_nome: string; status: string; unidade_prevista_id: string | null; colaborador_id: string | null; admin_dados?: Record<string, unknown> | null };

export function montarIniciosCalendario(colaboradores: ColaboradorInicio[], preadmissoes: PreadmissaoInicio[], competencia: string): InicioCalendario[] {
  const eventos: InicioCalendario[] = [];
  const adicionar = (evento: InicioCalendario) => {
    if (evento.data.startsWith(`${competencia}-`) && /^\d{4}-\d{2}-\d{2}$/.test(evento.data)) eventos.push(evento);
  };
  const provisorios = new Set<string>();
  for (const p of preadmissoes) {
    if (["cancelado", "expirado"].includes(p.status)) continue;
    const rotina = p.admin_dados?.rotina as { colaborador_id?: string; iniciou_em?: string } | undefined;
    if (rotina?.colaborador_id) provisorios.add(rotina.colaborador_id);
    if (rotina?.iniciou_em) adicionar({ id: `${p.id}-rotina`, colaboradorId: rotina.colaborador_id ?? null, preadmissaoId: p.id, nome: p.candidato_nome, unidadeId: p.unidade_prevista_id, data: rotina.iniciou_em, tipo: "provisorio" });
    const prevista = p.admin_dados?.data_admissao;
    if (p.status !== "concluido" && typeof prevista === "string") adicionar({ id: `${p.id}-prevista`, colaboradorId: rotina?.colaborador_id ?? null, preadmissaoId: p.id, nome: p.candidato_nome, unidadeId: p.unidade_prevista_id, data: prevista, tipo: "prevista" });
  }
  for (const c of colaboradores) {
    if (c.origem_cadastro === "preadmissao_rotina" && provisorios.has(c.id)) continue;
    const formal = elegivelAniversarioContratacao(c);
    const data = formal ? dataInicioVinculoAtual(c) : c.data_admissao;
    if (!data || (c.data_desligamento && data > c.data_desligamento)) continue;
    adicionar({ id: `${c.id}-inicio`, colaboradorId: c.id, preadmissaoId: null, nome: c.nome, unidadeId: c.unidade_id, data, tipo: c.origem_cadastro === "preadmissao_rotina" ? "provisorio" : formal ? "formal" : "operacional" });
  }
  return eventos.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, "pt-BR"));
}