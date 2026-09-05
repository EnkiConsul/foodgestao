// Limite de quantidade de pessoas em folga por dia.
// Funções puras — sem acesso a banco — espelhando a função dp_folga_limite_dia do banco.

import { DIA_SEMANA_LABEL } from "./dsr-rules";

export type RegraLimiteFolga = {
  id: string;
  unidade_id: string | null;
  /** null = vale para todos os dias da semana. */
  dia_semana: number | null;
  maximo: number;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  ativo: boolean;
  /** Vazio = qualquer cargo. */
  cargo_ids: string[];
};

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
 * Limite efetivo do dia: exceção da data vence a regra recorrente e,
 * entre as regras, a mais específica (unidade > cargo > dia da semana) vence.
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
    if (r.unidade_id !== null && r.unidade_id !== unidadeId) return false;
    if (r.dia_semana !== null && r.dia_semana !== wd) return false;
    if (r.cargo_ids.length > 0 && (!cargoId || !r.cargo_ids.includes(cargoId))) return false;
    return vigente(r, data);
  });

  if (candidatas.length === 0) return { limite: null, origem: "sem_limite" };

  const peso = (r: RegraLimiteFolga) =>
    (r.unidade_id !== null ? 4 : 0) + (r.cargo_ids.length > 0 ? 2 : 0) + (r.dia_semana !== null ? 1 : 0);

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
  nomes: { unidade?: string | null; cargos?: string[] } = {},
): string {
  const escopo = regra.unidade_id ? (nomes.unidade ?? "Unidade") : "Toda a empresa";
  const dia =
    regra.dia_semana === null
      ? "todos os dias"
      : `${DIA_SEMANA_LABEL[regra.dia_semana]?.toLowerCase() ?? "dia"}s`;
  const cargos =
    regra.cargo_ids.length === 0
      ? "qualquer cargo"
      : (nomes.cargos ?? []).filter(Boolean).join(", ") || "cargos selecionados";
  return `${escopo}, ${dia}, ${cargos}: no máximo ${regra.maximo} em folga`;
}
