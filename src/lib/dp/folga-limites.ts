// Regras de folga: limite de pessoas por dia, limite por cargo e pessoas que
// não podem folgar no mesmo dia.
// Funções puras — sem acesso a banco — espelhando as funções do banco
// dp_folga_limite_dia e dp_folga_conflito_colaboradores.

import { DIA_SEMANA_LABEL } from "./dsr-rules";

/** Tipo da regra escolhido pelo gestor no cadastro único de regras de folga. */
export type TipoRegraFolga = "quantidade" | "cargo" | "colaboradores";

export const TIPO_REGRA_LABEL: Record<TipoRegraFolga, string> = {
  quantidade: "Quantidade de pessoas por dia",
  cargo: "Limite por cargo",
  colaboradores: "Não folgam juntos",
};

export type RegraLimiteFolga = {
  id: string;
  tipo: TipoRegraFolga;
  nome: string | null;
  /** Toda regra pertence a uma unidade. */
  unidade_id: string;
  /** null = vale para todos os dias da semana. */
  dia_semana: number | null;
  maximo: number;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  ativo: boolean;
  /** Vazio = qualquer cargo. */
  cargo_ids: string[];
  /** Pessoas que não podem folgar no mesmo dia (tipo `colaboradores`). */
  colaborador_ids: string[];
};

/** Regra sem identificador obrigatório — usada em formulários e rascunho. */
export type RegraLimiteFolgaBase = Omit<RegraLimiteFolga, "id">;




export type LimiteDiaConfig = {
  data: string;
  unidade_id: string | null;
  limite_folgas: number | null;
};

export type OrigemLimite = "excecao_data" | "regra_recorrente" | "sem_limite";

export type LimiteResolvido = {
  limite: number | null;
  origem: OrigemLimite;
  regra?: RegraLimiteFolga;
};

const ORIGEM_LABEL: Record<OrigemLimite, string> = {
  excecao_data: "Exceção cadastrada para esta data",
  regra_recorrente: "Regra fixa de folgas por dia",
  sem_limite: "Sem limite cadastrado",
};

export function origemLimiteLabel(origem: OrigemLimite): string {
  return ORIGEM_LABEL[origem];
}

/** `yyyy-MM-dd` → dia da semana (0 = domingo), sem depender de fuso. */
export function diaSemanaISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function vigente(regra: RegraLimiteFolga, iso: string): boolean {
  if (regra.vigencia_inicio && regra.vigencia_inicio > iso) return false;
  if (regra.vigencia_fim && regra.vigencia_fim < iso) return false;
  return true;
}

/**
 * Limite efetivo do dia: exceção da data vence a regra recorrente e, entre as
 * regras da unidade, a mais específica (cargo > dia da semana) vence.
 * `unidadeId` nulo = visão consolidada (não filtra por unidade).
 */
export function resolverLimiteFolga(params: {
  data: string;
  unidadeId?: string | null;
  cargoId?: string | null;
  regras: RegraLimiteFolga[];
  diaConfig?: LimiteDiaConfig[];
}): LimiteResolvido {
  const { data, unidadeId = null, cargoId = null, regras, diaConfig = [] } = params;

  const excecoes = diaConfig.filter(
    (c) => c.data === data && (c.unidade_id === null || c.unidade_id === unidadeId),
  );
  const excecao =
    excecoes.find((c) => c.unidade_id !== null) ?? excecoes.find((c) => c.unidade_id === null);
  if (excecao && excecao.limite_folgas != null) {
    return { limite: excecao.limite_folgas, origem: "excecao_data" };
  }

  const wd = diaSemanaISO(data);
  const candidatas = regras.filter((r) => {
    if (!r.ativo) return false;
    if (r.tipo === "colaboradores") return false;
    if (unidadeId !== null && r.unidade_id !== unidadeId) return false;
    if (r.dia_semana !== null && r.dia_semana !== wd) return false;
    if (r.cargo_ids.length > 0 && (!cargoId || !r.cargo_ids.includes(cargoId))) return false;
    return vigente(r, data);
  });


  if (candidatas.length === 0) return { limite: null, origem: "sem_limite" };

  const peso = (r: RegraLimiteFolga) =>
    (r.cargo_ids.length > 0 ? 2 : 0) + (r.dia_semana !== null ? 1 : 0);

  const escolhida = [...candidatas].sort((a, b) => {
    const d = peso(b) - peso(a);
    if (d !== 0) return d;
    return (b.vigencia_inicio ?? "").localeCompare(a.vigencia_inicio ?? "");
  })[0];

  return { limite: escolhida.maximo, origem: "regra_recorrente", regra: escolhida };
}


/** Frase curta para exibir a regra na lista de cadastro. */
export function resumoRegraLimite(
  regra: RegraLimiteFolga,
  nomes: { unidade?: string | null; cargos?: string[]; colaboradores?: string[] } = {},
): string {
  const escopo = nomes.unidade ?? "Unidade";
  const dia =
    regra.dia_semana === null
      ? "todos os dias"
      : `${DIA_SEMANA_LABEL[regra.dia_semana]?.toLowerCase() ?? "dia"}s`;

  if (regra.tipo === "colaboradores") {
    const pessoas = (nomes.colaboradores ?? []).filter(Boolean);
    const lista =
      pessoas.length > 1
        ? `${pessoas.slice(0, -1).join(", ")} e ${pessoas[pessoas.length - 1]}`
        : (pessoas[0] ?? "As pessoas selecionadas");
    return `${lista} não folgam no mesmo dia (${escopo.toLowerCase()}, ${dia})`;
  }

  const cargos =
    regra.cargo_ids.length === 0
      ? "qualquer cargo"
      : (nomes.cargos ?? []).filter(Boolean).join(", ") || "cargos selecionados";
  return `${escopo}, ${dia}, ${cargos}: no máximo ${regra.maximo} em folga`;
}

/**
 * Dias da semana que podem ser escolhidos no cadastro de regras: só os dias em
 * que existe folga (dias de descanso negociados, ou sábado/domingo na CLT).
 */
export function diasPermitidosParaLimite(dias: number[]): number[] {
  return [...new Set(dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );
}

/**
 * Pessoa em conflito com `colaboradorId` na data: alguém da mesma regra de
 * "não folgam juntos" que já está de folga no dia.
 */
export function conflitoColaboradores(params: {
  data: string;
  colaboradorId: string;
  unidadeId?: string | null;
  regras: RegraLimiteFolga[];
  /** Ids de quem já está de folga na data (ativos, sem férias/licença). */
  emFolgaNaData: string[];
}): { colaboradorId: string; regra: RegraLimiteFolga } | null {
  const { data, colaboradorId, unidadeId = null, regras, emFolgaNaData } = params;
  const wd = diaSemanaISO(data);
  const emFolga = new Set(emFolgaNaData.filter((id) => id !== colaboradorId));

  for (const r of regras) {
    if (r.tipo !== "colaboradores" || !r.ativo) continue;
    if (unidadeId !== null && r.unidade_id !== unidadeId) continue;
    if (r.dia_semana !== null && r.dia_semana !== wd) continue;
    if (!vigente(r, data)) continue;
    if (!r.colaborador_ids.includes(colaboradorId)) continue;
    const colega = r.colaborador_ids.find((id) => id !== colaboradorId && emFolga.has(id));
    if (colega) return { colaboradorId: colega, regra: r };
  }
  return null;
}

