// Regras de Descanso Semanal Remunerado (DSR) e periodicidade de folga dominical.
// Funções puras — sem acesso a banco — para poderem ser testadas isoladamente.

export type RegraDsr = "clt" | "cct" | "propria";
/** `legal` = folga dominical estrita. `acordo_coletivo` = dias negociados podem substituir o domingo. */
export type TipoDescansoDomingo = "legal" | "acordo_coletivo";
/** Modelo de frequência: intervalo em semanas OU quantidade por mês. Mutuamente exclusivos. */
export type ModoFrequencia = "semanas" | "por_mes";

export const MODO_FREQUENCIA_LABEL: Record<ModoFrequencia, string> = {
  semanas: "A cada X semanas",
  por_mes: "X domingos por mês",
};

export const DIA_SEMANA_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIA_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Média de semanas por mês, usada para converter "X por mês" em intervalo de semanas. */
export const SEMANAS_POR_MES = 4.345;

/**
 * Converte o modelo escolhido em um intervalo equivalente em semanas.
 * `0` = nunca exigir folga dominical.
 */
export function frequenciaParaSemanas(
  modo: ModoFrequencia,
  semanas: number,
  porMes: number,
): number {
  if (modo === "por_mes") {
    if (!Number.isFinite(porMes) || porMes <= 0) return 0;
    return SEMANAS_POR_MES / porMes;
  }
  if (!Number.isFinite(semanas) || semanas <= 0) return 0;
  return semanas;
}

export interface DpConfigDp {
  company_id: string;
  /** `null` = regra padrão da empresa; preenchido = exceção daquela unidade. */
  unidade_id: string | null;
  setor_comercio: boolean;
  /** Modelo de frequência da folga dominical (regra geral). */
  modo_frequencia_domingo: ModoFrequencia;
  /** Periodicidade de folga dominical, em semanas. 0 = nunca exigir. */
  periodicidade_domingo: number;
  /** Quantidade de domingos de folga por mês (quando o modelo é `por_mes`). */
  domingos_por_mes: number;
  /** Modelo de frequência específico para mulheres (Art. 386 CLT). */
  modo_frequencia_domingo_mulher: ModoFrequencia;
  /** Periodicidade específica para mulheres (Art. 386 CLT), em semanas. */
  periodicidade_domingo_mulher: number;
  /** Domingos por mês para mulheres (quando o modelo é `por_mes`). */
  domingos_por_mes_mulher: number;
  /** Teto de folgas de fim de semana que o colaborador pode marcar por mês. */
  folgas_fds_por_mes: number;
  regra_dsr: RegraDsr;
  exige_validacao_menor: boolean;
  tipo_descanso_domingo: TipoDescansoDomingo;
  /** Dias da semana negociados como descanso (0 = domingo … 6 = sábado). */
  dias_descanso_negociados: number[];
  /** Negociação sindical (ACT/CCT) que embasa o modo acordo coletivo. */
  negociacao_id: string | null;
}

export const DP_CONFIG_DP_DEFAULT: Omit<DpConfigDp, "company_id" | "unidade_id"> = {
  setor_comercio: true,
  modo_frequencia_domingo: "semanas",
  periodicidade_domingo: 3,
  domingos_por_mes: 1,
  modo_frequencia_domingo_mulher: "semanas",
  periodicidade_domingo_mulher: 2,
  domingos_por_mes_mulher: 2,
  folgas_fds_por_mes: 1,
  regra_dsr: "clt",
  exige_validacao_menor: true,
  tipo_descanso_domingo: "legal",
  dias_descanso_negociados: [0],
  negociacao_id: null,
};

/** Intervalo em semanas efetivamente aplicado (regra geral). */
export function semanasEfetivas(
  cfg: Pick<DpConfigDp, "modo_frequencia_domingo" | "periodicidade_domingo" | "domingos_por_mes">,
): number {
  return frequenciaParaSemanas(cfg.modo_frequencia_domingo, cfg.periodicidade_domingo, cfg.domingos_por_mes);
}

/** Intervalo em semanas efetivamente aplicado às mulheres (Art. 386 CLT). */
export function semanasEfetivasMulher(
  cfg: Pick<
    DpConfigDp,
    "modo_frequencia_domingo_mulher" | "periodicidade_domingo_mulher" | "domingos_por_mes_mulher"
  >,
): number {
  return frequenciaParaSemanas(
    cfg.modo_frequencia_domingo_mulher,
    cfg.periodicidade_domingo_mulher,
    cfg.domingos_por_mes_mulher,
  );
}



/**
 * Padrão legal de referência, em semanas, para a folga dominical.
 *
 * - Comércio em geral (inclui food service): 1 domingo a cada 3 semanas
 *   (Lei 10.101/2000, art. 6º § único, com a redação da Lei 11.603/2007).
 * - Demais setores: 1 domingo a cada 7 semanas — prática consolidada na
 *   jurisprudência. Atenção: a Portaria 417/1966, historicamente citada como
 *   fonte dessa regra, foi REVOGADA pela Portaria MTP 671/2021.
 */
export function padraoLegalDomingo(setorComercio: boolean): number {
  return setorComercio ? 3 : 7;
}

/** Padrão legal para colaboradoras mulheres: domingo quinzenal (Art. 386 CLT). */
export const PADRAO_LEGAL_DOMINGO_MULHER = 2;

/**
 * Uma periodicidade é MENOS protetiva quando o intervalo entre domingos de
 * folga é maior que o padrão legal. `0` significa "nunca exigir domingo" e é,
 * por definição, a configuração menos protetiva possível.
 */
export function isMenosProtetiva(valor: number, padrao: number): boolean {
  if (!Number.isFinite(valor)) return false;
  if (valor <= 0) return true;
  return valor > padrao;
}

export interface AlertaCiencia {
  campo: "periodicidade_domingo" | "periodicidade_domingo_mulher";
  valor: number;
  padrao: number;
  mensagem: string;
}

function fmtSemanas(valor: number): string {
  if (valor <= 0) return "sem exigência de folga dominical";
  return `${Number.isInteger(valor) ? valor : valor.toFixed(1)} semana(s)`;
}

function textoAlerta(valor: number, padrao: number, publico: string): string {
  return (
    `A periodicidade configurada (${fmtSemanas(valor)}) é inferior ao padrão legal de ${padrao} semana(s) ` +
    `${publico}. A legislação (Lei 10.101/2000 e Art. 386 CLT) exige folgas dominicais mais frequentes. ` +
    `Deseja continuar?`
  );
}

type CfgFrequencia = Pick<
  DpConfigDp,
  "setor_comercio" | "periodicidade_domingo" | "periodicidade_domingo_mulher"
> &
  Partial<
    Pick<
      DpConfigDp,
      | "modo_frequencia_domingo"
      | "domingos_por_mes"
      | "modo_frequencia_domingo_mulher"
      | "domingos_por_mes_mulher"
    >
  >;

/** Normaliza a configuração (qualquer modelo) para intervalos em semanas. */
export function semanasDaConfig(cfg: CfgFrequencia): { geral: number; mulher: number } {
  return {
    geral: frequenciaParaSemanas(
      cfg.modo_frequencia_domingo ?? "semanas",
      cfg.periodicidade_domingo,
      cfg.domingos_por_mes ?? 0,
    ),
    mulher: frequenciaParaSemanas(
      cfg.modo_frequencia_domingo_mulher ?? "semanas",
      cfg.periodicidade_domingo_mulher,
      cfg.domingos_por_mes_mulher ?? 0,
    ),
  };
}

/**
 * Retorna os alertas de ciência que devem ser exibidos ao salvar a configuração.
 * Lista vazia = salvar direto, sem modal.
 */
export function alertasDeCiencia(
  cfg: CfgFrequencia,
  opts: { temMulheres: boolean },
): AlertaCiencia[] {
  const out: AlertaCiencia[] = [];
  const padrao = padraoLegalDomingo(cfg.setor_comercio);
  const { geral, mulher } = semanasDaConfig(cfg);

  if (isMenosProtetiva(geral, padrao)) {
    out.push({
      campo: "periodicidade_domingo",
      valor: geral,
      padrao,
      mensagem: textoAlerta(geral, padrao, "para o setor desta empresa"),
    });
  }

  if (opts.temMulheres && isMenosProtetiva(mulher, PADRAO_LEGAL_DOMINGO_MULHER)) {
    out.push({
      campo: "periodicidade_domingo_mulher",
      valor: mulher,
      padrao: PADRAO_LEGAL_DOMINGO_MULHER,
      mensagem: textoAlerta(
        mulher,
        PADRAO_LEGAL_DOMINGO_MULHER,
        "para colaboradoras mulheres (Art. 386 CLT)",
      ),
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Relatório de conformidade
// ---------------------------------------------------------------------------

export interface ConformidadeInput {
  colaboradorId: string;
  nome: string;
  sexo?: string | null;
  /** Datas ISO (yyyy-mm-dd) de domingos em que o colaborador folgou no período. */
  domingosFolgados: string[];
  /** Folgas em dias negociados (exceto domingo) — só contam no modo acordo coletivo. */
  diasNegociadosFolgados?: string[];
  /** Total de domingos existentes no período analisado. */
  domingosNoPeriodo: number;
}

export interface ConformidadeLinha extends ConformidadeInput {
  periodicidadeAplicada: number;
  esperado: number;
  /** Folgas consideradas na avaliação (domingos, ou dias negociados no modo acordo). */
  folgasConsideradas: number;
  /** Folgas em dias negociados aproveitadas por acordo coletivo. */
  negociadosAproveitados: number;
  conforme: boolean;
}

/** Quantos domingos de folga são esperados no período, dada a periodicidade. */
export function domingosEsperados(domingosNoPeriodo: number, periodicidadeSemanas: number): number {
  if (periodicidadeSemanas <= 0) return 0;
  return Math.floor(domingosNoPeriodo / periodicidadeSemanas);
}

export function avaliarConformidade(
  linhas: ConformidadeInput[],
  cfg: Pick<DpConfigDp, "periodicidade_domingo" | "periodicidade_domingo_mulher"> &
    Partial<
      Pick<
        DpConfigDp,
        | "tipo_descanso_domingo"
        | "modo_frequencia_domingo"
        | "domingos_por_mes"
        | "modo_frequencia_domingo_mulher"
        | "domingos_por_mes_mulher"
      >
    >,
): ConformidadeLinha[] {
  const porAcordo = cfg.tipo_descanso_domingo === "acordo_coletivo";
  const { geral, mulher } = semanasDaConfig({ setor_comercio: true, ...cfg });
  return linhas.map((l) => {
    const periodicidade =
      l.sexo === "F" ? Math.min(mulher || Infinity, geral || Infinity) : geral;
    const p = Number.isFinite(periodicidade) ? periodicidade : 0;
    const esperado = domingosEsperados(l.domingosNoPeriodo, p);
    const domingos = l.domingosFolgados.length;
    const negociados = porAcordo ? (l.diasNegociadosFolgados?.length ?? 0) : 0;
    // No modo acordo, os dias negociados só complementam o que faltar de domingo.
    const negociadosAproveitados = porAcordo
      ? Math.max(0, Math.min(negociados, esperado - domingos))
      : 0;
    const folgasConsideradas = domingos + negociadosAproveitados;
    return {
      ...l,
      periodicidadeAplicada: p,
      esperado,
      folgasConsideradas,
      negociadosAproveitados,
      conforme: folgasConsideradas >= esperado,
    };
  });
}



export const TIPO_ESCALA_LABEL: Record<string, string> = {
  "6x1": "6x1 — seis dias de trabalho, um de folga",
  "5x2": "5x2 — cinco dias de trabalho, dois de folga",
  "5x1": "5x1 — cinco dias de trabalho, um de folga",
  "4x2": "4x2 — quatro dias de trabalho, dois de folga",
  "12x36": "12x36 — plantão de 12h com 36h de descanso",
  intermitente: "Intermitente — convocação por período",
  personalizada: "Personalizada",
};

export const TURNO_LABEL: Record<string, string> = {
  matutino: "Matutino",
  vespertino: "Vespertino",
  noturno: "Noturno",
  misto: "Misto",
};
