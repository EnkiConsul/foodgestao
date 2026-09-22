/**
 * Filtros compartilhados da tela de Benefícios (cálculo, cadastro e histórico).
 *
 * Mesma leitura das outras telas de Pessoas 360°: busca por nome, unidade,
 * cargo, situação e colaborador. Nenhuma regra por tipo de vínculo — sócio
 * entra ou não conforme o que está cadastrado na ficha dele.
 */

export type SituacaoBeneficios = "ativos" | "desligados" | "todos";

export interface BeneficiosFiltros {
  busca: string;
  unidade: string;
  cargo: string;
  situacao: SituacaoBeneficios;
  colaborador: string;
}

export const FILTROS_BENEFICIOS_PADRAO: BeneficiosFiltros = {
  busca: "",
  unidade: "todas",
  cargo: "todos",
  situacao: "ativos",
  colaborador: "todos",
};

export interface PessoaFiltravel {
  id: string;
  nome?: string | null;
  unidade_id?: string | null;
  cargo_id?: string | null;
  ativo?: boolean | null;
  data_desligamento?: string | null;
}

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

/** Situação: desligado recente continua entrando quando a janela do ciclo o alcança. */
export function pessoaAtendeSituacao(
  pessoa: PessoaFiltravel,
  situacao: SituacaoBeneficios,
  opcoes?: { janelaInicio?: string },
): boolean {
  const desligado = pessoa.ativo === false || !!pessoa.data_desligamento;
  if (situacao === "todos") return true;
  if (situacao === "desligados") return desligado;
  if (pessoa.ativo === false) return false;
  const janela = opcoes?.janelaInicio;
  if (pessoa.data_desligamento && janela) return pessoa.data_desligamento >= janela;
  return true;
}

/** Aplica busca, unidade, cargo, colaborador e situação a uma pessoa. */
export function pessoaAtendeFiltros(
  pessoa: PessoaFiltravel,
  filtros: BeneficiosFiltros,
  opcoes?: { janelaInicio?: string },
): boolean {
  if (filtros.colaborador !== "todos" && pessoa.id !== filtros.colaborador) return false;
  if (filtros.unidade !== "todas" && String(pessoa.unidade_id ?? "") !== filtros.unidade) return false;
  if (filtros.cargo !== "todos" && String(pessoa.cargo_id ?? "") !== filtros.cargo) return false;
  const busca = normalizar(filtros.busca ?? "");
  if (busca && !normalizar(String(pessoa.nome ?? "")).includes(busca)) return false;
  return pessoaAtendeSituacao(pessoa, filtros.situacao, opcoes);
}

/** Quantidade de filtros diferentes do padrão — alimenta o contador da barra. */
export function contarFiltrosBeneficios(filtros: BeneficiosFiltros): number {
  let total = 0;
  if (filtros.unidade !== FILTROS_BENEFICIOS_PADRAO.unidade) total += 1;
  if (filtros.cargo !== FILTROS_BENEFICIOS_PADRAO.cargo) total += 1;
  if (filtros.situacao !== FILTROS_BENEFICIOS_PADRAO.situacao) total += 1;
  if (filtros.colaborador !== FILTROS_BENEFICIOS_PADRAO.colaborador) total += 1;
  return total;
}

export const SITUACAO_BENEFICIOS_LABEL: Record<SituacaoBeneficios, string> = {
  ativos: "Ativos",
  desligados: "Desligados",
  todos: "Todos",
};
