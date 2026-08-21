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
/** Ordem de exibição dos dias da semana: segunda-feira a domingo. */
export const ORDEM_DIAS_SEG_DOM = [1, 2, 3, 4, 5, 6, 0];

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
  regra_dsr: RegraDsr;
  exige_validacao_menor: boolean;
  tipo_descanso_domingo: TipoDescansoDomingo;
  /** Dias da semana negociados como descanso (0 = domingo … 6 = sábado). */
  dias_descanso_negociados: number[];
  /** Negociação sindical (ACT/CCT) que embasa o modo acordo coletivo. */
  negociacao_id: string | null;
  /** Folgas de fim de semana garantidas por mês (sábado ou domingo). */
  folgas_fds_por_mes: number;
}

export const DP_CONFIG_DP_DEFAULT: Omit<DpConfigDp, "company_id" | "unidade_id"> = {
  setor_comercio: true,
  modo_frequencia_domingo: "semanas",
  periodicidade_domingo: 3,
  domingos_por_mes: 1,
  modo_frequencia_domingo_mulher: "semanas",
  periodicidade_domingo_mulher: 2,
  domingos_por_mes_mulher: 2,
  regra_dsr: "clt",
  exige_validacao_menor: true,
  tipo_descanso_domingo: "legal",
  dias_descanso_negociados: [0],
  negociacao_id: null,
  folgas_fds_por_mes: 1,
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
 * Dias da semana em que o colaborador pode marcar folga, conforme a regra.
 * No modo legislação: sábado e domingo. No modo acordo: os dias negociados.
 */
export function diasElegiveisDaConfig(
  cfg: Pick<DpConfigDp, "tipo_descanso_domingo" | "dias_descanso_negociados">,
): number[] {
  if (cfg.tipo_descanso_domingo === "acordo_coletivo") {
    const dias = (cfg.dias_descanso_negociados ?? []).filter((d) => d >= 0 && d <= 6);
    if (dias.length > 0) return [...new Set(dias)].sort((a, b) => a - b);
  }
  return [0, 6];
}

type CfgTeto = Pick<DpConfigDp, "modo_frequencia_domingo" | "periodicidade_domingo" | "domingos_por_mes"> &
  Partial<
    Pick<
      DpConfigDp,
      "modo_frequencia_domingo_mulher" | "periodicidade_domingo_mulher" | "domingos_por_mes_mulher"
    >
  >;

/**
 * Teto de folgas que o colaborador pode marcar sozinho no mês.
 * Deriva exclusivamente da frequência de folga dominical configurada.
 * Para colaboradoras, aplica-se a frequência feminina quando mais protetiva.
 */
export function tetoFolgasMes(cfg: CfgTeto, opts?: { sexo?: string | null }): number {
  const derivar = (semanas: number) =>
    semanas <= 0 ? 1 : Math.max(1, Math.ceil(SEMANAS_POR_MES / semanas));

  const geral = derivar(semanasEfetivas(cfg));
  if (opts?.sexo !== "F") return geral;

  const mulher = derivar(
    frequenciaParaSemanas(
      cfg.modo_frequencia_domingo_mulher ?? "semanas",
      cfg.periodicidade_domingo_mulher ?? 0,
      cfg.domingos_por_mes_mulher ?? 0,
    ),
  );
  return Math.max(geral, mulher);
}

/**
 * Quantidade de folgas dominicais previstas em regra dentro de um período,
 * a partir da quantidade de domingos que o período contém.
 *
 * Ex.: 1 domingo a cada 3 semanas em um período com 4 domingos → 1 folga.
 * Ex.: modelo "1 domingo por mês" em um período com 4 domingos → 1 folga.
 */
export function domingosFolgaNoPeriodo(
  cfg: CfgTeto,
  domingosNoPeriodo: number,
  opts?: { sexo?: string | null },
): number {
  const domingos = Math.max(0, Math.floor(Number(domingosNoPeriodo) || 0));
  if (domingos === 0) return 0;

  const calcular = (

    modo: ModoFrequencia,
    semanas: number,
    porMes: number,
  ) => {
    if (modo === "por_mes") {
      const qtd = Number(porMes);
      if (!Number.isFinite(qtd) || qtd <= 0) return 0;
      return Math.min(domingos, Math.max(0, Math.floor(qtd + 1e-9)));
    }
    const intervalo = Number(semanas);
    if (!Number.isFinite(intervalo) || intervalo <= 0) return 0;
    return Math.min(domingos, Math.floor(domingos / intervalo + 1e-9));
  };


  const geral = calcular(
    cfg.modo_frequencia_domingo ?? "semanas",
    cfg.periodicidade_domingo ?? 0,
    cfg.domingos_por_mes ?? 0,
  );
  if (opts?.sexo !== "F") return geral;

  const mulher = calcular(
    cfg.modo_frequencia_domingo_mulher ?? "semanas",
    cfg.periodicidade_domingo_mulher ?? 0,
    cfg.domingos_por_mes_mulher ?? 0,
  );
  return Math.max(geral, mulher);
}


export interface ResumoEscolhaFolgas {
  /** Dias da semana em que o colaborador pode marcar folga (0 = domingo). */
  dias: number[];
  /** Quantidade máxima de folgas que ele pode marcar sozinho no mês. */
  teto: number;
  /** Frase pronta para exibição: dias elegíveis + teto mensal. */
  texto: string;
}

/**
 * Resumo textual para deixar explícito que os dias marcados são OPÇÕES de
 * escolha — não quantidade de folgas. A quantidade vem sempre do teto mensal.
 */
export function resumoEscolhaFolgas(
  cfg: CfgTeto & Pick<DpConfigDp, "tipo_descanso_domingo" | "dias_descanso_negociados">,
  opts?: { sexo?: string | null },
): ResumoEscolhaFolgas {
  const dias = diasElegiveisDaConfig(cfg);
  const teto = tetoFolgasMes(cfg, opts);
  const labels = ORDEM_DIAS_SEG_DOM.filter((d) => dias.includes(d)).map((d) => DIA_SEMANA_CURTO[d]);
  return {
    dias,
    teto,
    texto: `Você pode escolher entre: ${labels.join(", ")} — até ${teto} folga${teto === 1 ? "" : "s"} neste mês.`,
  };
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

/** Valores que a base "CLT" fixa para a frequência de folga dominical. */
export function padroesCltDe(setorComercio: boolean): Pick<
  DpConfigDp,
  | "modo_frequencia_domingo"
  | "periodicidade_domingo"
  | "modo_frequencia_domingo_mulher"
  | "periodicidade_domingo_mulher"
> {
  return {
    modo_frequencia_domingo: "semanas",
    periodicidade_domingo: padraoLegalDomingo(setorComercio),
    modo_frequencia_domingo_mulher: "semanas",
    periodicidade_domingo_mulher: PADRAO_LEGAL_DOMINGO_MULHER,
  };
}

export interface BaseLegal {
  titulo: string;
  texto: string;
  fonte: string;
}

/** Explicação jurídica exibida no popover de "menos protetiva". */
export function baseLegalDe(
  campo: AlertaCiencia["campo"],
  setorComercio: boolean,
): BaseLegal {
  if (campo === "periodicidade_domingo_mulher") {
    return {
      titulo: "Folga dominical — mulheres",
      texto:
        "O Art. 386 da CLT determina que, no trabalho aos domingos, a escala de revezamento das mulheres deve ser quinzenal — ou seja, ao menos 1 domingo de folga a cada 2 semanas. Uma frequência menor é menos protetiva e exige registro de ciência do responsável.",
      fonte: "Art. 386 da CLT",
    };
  }
  if (setorComercio) {
    return {
      titulo: "Folga dominical — comércio / food service",
      texto:
        "Para o comércio em geral (incluindo food service), a lei exige que o repouso semanal coincida com o domingo pelo menos uma vez a cada 3 semanas. Configurar um intervalo maior é menos protetivo e exige registro de ciência do responsável.",
      fonte: "Lei 10.101/2000, art. 6º, parágrafo único (redação da Lei 11.603/2007)",
    };
  }
  return {
    titulo: "Folga dominical — demais setores",
    texto:
      "Fora do comércio, a referência consolidada na jurisprudência é de 1 domingo de folga a cada 7 semanas. Atenção: a Portaria 417/1966, historicamente citada como fonte dessa regra, foi revogada pela Portaria MTP 671/2021 — mantendo-se a exigência de revezamento pela CLT.",
    fonte: "Art. 67 da CLT e jurisprudência consolidada",
  };
}

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
