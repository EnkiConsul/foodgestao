// ------------------------------------------------------------------
// Domínio: DP → Padrão de condições dos colaboradores de um cargo.
//
// Ao escolher um cargo já cadastrado, o sistema sugere as condições que a
// empresa já pratica nesse cargo: tipo de vínculo, setor habitual, jornada,
// forma de pagamento e benefícios. É só um ponto de partida — o gestor pode
// ajustar tudo depois.
//
// Regra de leitura: quando existem colaboradores do cargo na mesma unidade,
// só eles contam (cada unidade tem sua realidade). Sem ninguém na unidade,
// vale o padrão do cargo na empresa. Desligados não entram na conta.
// ------------------------------------------------------------------

import type { DiaConfig } from "./config-trabalho";

export interface PadraoColaboradorFonte {
  id: string;
  cargo_id?: string | null;
  unidade_id?: string | null;
  setor_id?: string | null;
  regime?: string | null;
  forma_pagamento?: string | null;
  data_desligamento?: string | null;
}

export interface PadraoConfigFonte {
  colaborador_id: string;
  turno_padrao_id?: string | null;
  carga_semanal_horas?: number | null;
  folga_variavel?: boolean | null;
  folga_fixa_dow?: number | null;
  vigencia_fim?: string | null;
  dias?: DiaConfig[] | null;
}

export interface PadraoBeneficioFonte {
  colaborador_id: string;
  beneficio_id: string;
  valor?: number | null;
  ativo?: boolean | null;
  data_fim?: string | null;
}

export interface CargoPadrao {
  /** Quantos colaboradores serviram de base para a sugestão. */
  base: number;
  /** A sugestão veio da mesma unidade? (senão, do cargo na empresa) */
  daUnidade: boolean;
  regime: string | null;
  setor_id: string | null;
  forma_pagamento: string | null;
  turno_padrao_id: string | null;
  carga_semanal_horas: number | null;
  folga_variavel: boolean | null;
  folga_fixa_dow: number | null;
  dias: DiaConfig[] | null;
  /** Benefícios concedidos à maioria, com o valor mais praticado. */
  beneficios: { beneficio_id: string; valor: number | null }[];
}

const VAZIO: CargoPadrao = {
  base: 0,
  daUnidade: false,
  regime: null,
  setor_id: null,
  forma_pagamento: null,
  turno_padrao_id: null,
  carga_semanal_horas: null,
  folga_variavel: null,
  folga_fixa_dow: null,
  dias: null,
  beneficios: [],
};

/** Valor mais frequente da lista, ignorando vazios. Empate → o primeiro visto. */
export function maisFrequente<T>(valores: (T | null | undefined)[]): T | null {
  const contagem = new Map<string, { valor: T; n: number; ordem: number }>();
  let ordem = 0;
  for (const v of valores) {
    if (v === null || v === undefined || v === "") continue;
    const chave = JSON.stringify(v);
    const atual = contagem.get(chave);
    if (atual) atual.n += 1;
    else contagem.set(chave, { valor: v, n: 1, ordem: ordem++ });
  }
  const lista = [...contagem.values()].sort((a, b) => (b.n - a.n) || (a.ordem - b.ordem));
  return lista[0]?.valor ?? null;
}

/** Configuração de trabalho em aberto de cada colaborador. */
const configVigente = (
  configs: PadraoConfigFonte[],
  colaboradorId: string,
): PadraoConfigFonte | null =>
  configs.find((c) => c.colaborador_id === colaboradorId && !c.vigencia_fim) ??
  configs.find((c) => c.colaborador_id === colaboradorId) ??
  null;

export interface PadraoDoCargoFontes {
  colaboradores: PadraoColaboradorFonte[];
  configs?: PadraoConfigFonte[];
  beneficios?: PadraoBeneficioFonte[];
}

/**
 * Padrão praticado no cargo. `excluirId` deixa o próprio colaborador fora da
 * conta (a mudança dele não deve influenciar a própria sugestão).
 */
export function padraoDoCargo(
  fontes: PadraoDoCargoFontes,
  opts: { cargoId?: string | null; unidadeId?: string | null; excluirId?: string | null } = {},
): CargoPadrao {
  const { cargoId, unidadeId, excluirId } = opts;
  if (!cargoId) return VAZIO;

  const configs = fontes.configs ?? [];
  const beneficios = fontes.beneficios ?? [];

  const doCargo = (fontes.colaboradores ?? []).filter(
    (c) => c.cargo_id === cargoId && !c.data_desligamento && c.id !== excluirId,
  );
  if (doCargo.length === 0) return VAZIO;

  const naUnidade = unidadeId ? doCargo.filter((c) => c.unidade_id === unidadeId) : [];
  const base = naUnidade.length > 0 ? naUnidade : doCargo;

  const cfgs = base.map((c) => configVigente(configs, c.id)).filter(Boolean) as PadraoConfigFonte[];

  const turno = maisFrequente(cfgs.map((c) => c.turno_padrao_id ?? null));
  const carga = maisFrequente(cfgs.map((c) => (c.carga_semanal_horas ?? null)));

  // Os dias vêm de quem já segue o turno e a carga mais praticados.
  const refDias =
    cfgs.find(
      (c) =>
        (c.turno_padrao_id ?? null) === turno &&
        (c.carga_semanal_horas ?? null) === carga &&
        (c.dias?.length ?? 0) > 0,
    ) ?? cfgs.find((c) => (c.dias?.length ?? 0) > 0) ?? null;

  // Benefício entra quando é concedido à maioria da base.
  const ativosPorBeneficio = new Map<string, { colaboradores: Set<string>; valores: (number | null)[] }>();
  const idsBase = new Set(base.map((c) => c.id));
  for (const b of beneficios) {
    if (!idsBase.has(b.colaborador_id)) continue;
    if (b.ativo === false || b.data_fim) continue;
    const item = ativosPorBeneficio.get(b.beneficio_id) ?? { colaboradores: new Set<string>(), valores: [] };
    item.colaboradores.add(b.colaborador_id);
    item.valores.push(b.valor ?? null);
    ativosPorBeneficio.set(b.beneficio_id, item);
  }
  const metade = base.length / 2;
  const beneficiosPadrao = [...ativosPorBeneficio.entries()]
    .filter(([, v]) => v.colaboradores.size > metade)
    .map(([beneficio_id, v]) => ({ beneficio_id, valor: maisFrequente(v.valores) }));

  return {
    base: base.length,
    daUnidade: naUnidade.length > 0,
    regime: maisFrequente(base.map((c) => c.regime ?? null)),
    setor_id: maisFrequente(base.map((c) => c.setor_id ?? null)),
    forma_pagamento: maisFrequente(base.map((c) => c.forma_pagamento ?? null)),
    turno_padrao_id: turno,
    carga_semanal_horas: carga,
    folga_variavel: maisFrequente(cfgs.map((c) => c.folga_variavel ?? null)),
    folga_fixa_dow: maisFrequente(cfgs.map((c) => c.folga_fixa_dow ?? null)),
    dias: refDias?.dias ?? null,
    beneficios: beneficiosPadrao,
  };
}

export type ModoContinuidade = "continuidade" | "novo_contrato";

export const MODO_CONTINUIDADE_LABEL: Record<ModoContinuidade, string> = {
  continuidade: "Continuidade do contrato",
  novo_contrato: "Novo contrato (recomeça a contagem)",
};

/**
 * Mudar o tipo de vínculo encerra o contrato anterior na prática, então a
 * sugestão passa a ser recomeçar a contagem. As demais mudanças (cargo,
 * jornada, setor, unidade, benefícios) mantêm a continuidade.
 */
export function sugerirModoContinuidade(
  regimeAtual: string | null | undefined,
  regimeNovo: string | null | undefined,
): ModoContinuidade {
  if (!regimeAtual || !regimeNovo) return "continuidade";
  return regimeAtual === regimeNovo ? "continuidade" : "novo_contrato";
}
