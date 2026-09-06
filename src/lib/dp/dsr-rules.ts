// Regras de Descanso Semanal Remunerado (DSR) e periodicidade de folga dominical.
// Funções puras — sem acesso a banco — para poderem ser testadas isoladamente.

export type RegraDsr = "clt" | "cct" | "propria";
/** `legal` = folga dominical estrita. `acordo_coletivo` = dias negociados podem substituir o domingo. */
export type TipoDescansoDomingo = "legal" | "acordo_coletivo";
/** Modelo de frequência: intervalo em semanas OU quantidade por mês. Mutuamente exclusivos. */
export type ModoFrequencia = "semanas" | "por_mes";
/** Como a troca de folga entre colaboradores é tratada na unidade. */
export type TrocaFolgaModo = "direta" | "aprovacao_admin" | "proibida";
/** Sobre qual folga a permissão de troca se aplica. */
export type TrocaFolgaEscopo = "semanal" | "dominical" | "ambas";

export const MODO_FREQUENCIA_LABEL: Record<ModoFrequencia, string> = {
  semanas: "A cada X semanas",
  por_mes: "X domingos por mês",
};

/** Perfil dos dias de descanso marcados, para adaptar os textos de frequência. */
export type TipoDiasDescanso = "domingo" | "fim_de_semana" | "outros";

export const MODO_FREQUENCIA_POR_MES_LABEL: Record<TipoDiasDescanso, string> = {
  domingo: "X domingos por mês",
  fim_de_semana: "X folgas de fim de semana por mês",
  outros: "X folgas de descanso por mês",
};

/** Rótulo do modelo de frequência conforme os dias de descanso marcados. */
export function modoFrequenciaLabel(modo: ModoFrequencia, tipoDias: TipoDiasDescanso): string {
  return modo === "semanas" ? MODO_FREQUENCIA_LABEL.semanas : MODO_FREQUENCIA_POR_MES_LABEL[tipoDias];
}

/** Classifica os dias elegíveis: só domingo, sábado+domingo ou qualquer outra combinação. */
export function tipoDiasDescanso(diasElegiveis: number[]): TipoDiasDescanso {
  const extras = diasElegiveis.filter((d) => d !== 0);
  if (extras.length === 0) return "domingo";
  if (extras.length === 1 && extras[0] === 6) return "fim_de_semana";
  return "outros";
}

export const REGRA_DSR_LABEL: Record<RegraDsr, string> = {
  clt: "CLT (padrão legal)",
  cct: "Acordo / convenção coletiva",
  propria: "Política própria da empresa",
};

export const TROCA_FOLGA_MODO_LABEL: Record<TrocaFolgaModo, string> = {
  direta: "Direta (vale no aceite do colega)",
  aprovacao_admin: "Somente com aprovação do administrador",
  proibida: "Não permitida",
};

export const TROCA_FOLGA_ESCOPO_LABEL: Record<TrocaFolgaEscopo, string> = {
  semanal: "Apenas folga semanal",
  dominical: "Apenas folga dominical (DSR)",
  ambas: "Folga semanal e dominical",
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
  /** Regime de troca de folga entre colaboradores. */
  troca_folga_modo: TrocaFolgaModo;
  /** Folgas sobre as quais a troca é permitida. */
  troca_folga_escopo: TrocaFolgaEscopo;
  /** Usa a janela mensal de escolha das folgas? */
  folga_janela_ativa: boolean;
  /** Dia do mês em que a marcação abre (1 a 28). */
  folga_janela_abre_dia: number;
  /** Dia do mês em que a marcação encerra (1 a 28). */
  folga_janela_fecha_dia: number;
  /** Após o encerramento, distribui automaticamente quem não escolheu. */
  folga_autoatribuir: boolean;
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
  troca_folga_modo: "aprovacao_admin",
  troca_folga_escopo: "ambas",
  folga_janela_ativa: false,
  folga_janela_abre_dia: 10,
  folga_janela_fecha_dia: 20,
  folga_autoatribuir: true,
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
 * Opções por colaborador que ajustam a regra de folga dominical.
 *
 * `domingosMes` é o override individual: usado quando o gênero informado não é
 * "F" nem "M" e o cadastro definiu a frequência CLT (1 ou 2 domingos por mês).
 */
export interface OptsColabDsr {
  sexo?: string | null;
  domingosMes?: number | null;
}

/** Override individual válido (1 ou 2 domingos por mês), ou null. */
export function overrideDomingosMes(opts?: OptsColabDsr): number | null {
  const v = Number(opts?.domingosMes);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.max(1, Math.floor(v));
}

/**
 * Teto de folgas que o colaborador pode marcar sozinho no mês.
 * Deriva exclusivamente da frequência de folga dominical configurada.
 * Para colaboradoras, aplica-se a frequência feminina quando mais protetiva.
 */
export function tetoFolgasMes(cfg: CfgTeto, opts?: OptsColabDsr): number {
  const derivar = (semanas: number) =>
    semanas <= 0 ? 1 : Math.max(1, Math.ceil(SEMANAS_POR_MES / semanas));

  const geral = derivar(semanasEfetivas(cfg));

  const override = overrideDomingosMes(opts);
  if (override !== null) return Math.max(geral, override);

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
  opts?: OptsColabDsr,
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

  const override = overrideDomingosMes(opts);
  if (override !== null) return Math.min(domingos, Math.max(geral, override));

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
  opts?: OptsColabDsr,
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

/**
 * Piso legal de domingos de folga no período, independente do que a unidade
 * configurou. Mulheres: 1 domingo a cada 2 semanas (Art. 386 CLT). Demais:
 * padrão do setor (comércio 1/3 semanas, outros 1/7).
 */
export function minimoLegalDomingos(
  domingosNoPeriodo: number,
  opts?: { sexo?: string | null; setorComercio?: boolean },
): number {
  const domingos = Math.max(0, Math.floor(Number(domingosNoPeriodo) || 0));
  if (domingos === 0) return 0;
  const intervalo =
    opts?.sexo === "F"
      ? PADRAO_LEGAL_DOMINGO_MULHER
      : padraoLegalDomingo(opts?.setorComercio !== false);
  return Math.min(domingos, Math.floor(domingos / intervalo));
}


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

/**
 * Aplica ao formulário a base da regra de folgas escolhida.
 * Em `clt`, as frequências (geral e mulheres) voltam ao padrão legal e o descanso
 * dominical passa a ser estritamente legal, sem dias negociados.
 */
export function aplicarBaseRegra<T extends Partial<DpConfigDp> & { setor_comercio?: boolean }>(
  form: T,
  base: RegraDsr,
): T {
  if (base !== "clt") return { ...form, regra_dsr: base };
  return {
    ...form,
    regra_dsr: "clt",
    tipo_descanso_domingo: "legal",
    dias_descanso_negociados: [0],
    ...padroesCltDe(form.setor_comercio !== false),
  };
}

/** A base da regra é o padrão legal (folga dominical gerada automaticamente)? */
export function folgaDominicalAutomatica(cfg: Pick<DpConfigDp, "regra_dsr" | "tipo_descanso_domingo">): boolean {
  return cfg.regra_dsr === "clt" && cfg.tipo_descanso_domingo === "legal";
}

export interface TrocaFolgaCheck {
  permitida: boolean;
  /** Precisa de aprovação do administrador depois do aceite do colega. */
  exigeAprovacao: boolean;
  motivo?: string;
}

/**
 * A troca de folga é permitida pela regra da unidade?
 * `dominical` = a folga trocada cai em domingo (DSR); `semanal` = qualquer outro dia.
 */
export function podeTrocarFolga(
  cfg: Pick<DpConfigDp, "troca_folga_modo" | "troca_folga_escopo">,
  tipo: "semanal" | "dominical",
): TrocaFolgaCheck {
  if (cfg.troca_folga_modo === "proibida") {
    return { permitida: false, exigeAprovacao: false, motivo: "A troca de folgas não é permitida nesta unidade." };
  }
  const escopo = cfg.troca_folga_escopo ?? "ambas";
  if (escopo !== "ambas" && escopo !== tipo) {
    return {
      permitida: false,
      exigeAprovacao: false,
      motivo:
        escopo === "dominical"
          ? "Nesta unidade a troca é permitida apenas para a folga dominical (DSR)."
          : "Nesta unidade a troca é permitida apenas para a folga semanal.",
    };
  }
  return { permitida: true, exigeAprovacao: cfg.troca_folga_modo === "aprovacao_admin" };
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
  /** Folgas em dias que não são domingo nem dia negociado (contam só como marcadas). */
  folgasOutrosDias?: string[];
  /** Dias de descanso semanal fixos do cadastro ocorridos no mês (exibição). */
  descansoSemanalNoMes?: number;
  /** Descansos fixos do cadastro que caem em dia elegível (regra da empresa). */
  descansoSemanalElegivelNoMes?: number;
  /** Total de domingos existentes no período analisado. */
  domingosNoPeriodo: number;
  /** Datas ISO de todos os domingos do período, em ordem. */
  domingosDoPeriodo?: string[];
  /** Último domingo folgado antes do período, para medir o intervalo na virada. */
  ultimoDomingoFolgadoAnterior?: string | null;
  /**
   * Override individual de domingos de folga por mês, cadastrado no colaborador
   * quando o gênero informado não é feminino nem masculino. Quando presente,
   * substitui a frequência da unidade na avaliação.
   */
  domingosMesOverride?: number | null;
}

export interface IntervaloDomingos {
  /** Todos os intervalos respeitaram o máximo de domingos trabalhados seguidos. */
  conforme: boolean;
  /** Domingos trabalhados que romperam o intervalo exigido. */
  domingosComIntervaloRompido: string[];
  /** Maior sequência de domingos trabalhados seguidos no período. */
  maiorSequenciaTrabalhada: number;
}

/**
 * Avalia o espaçamento entre domingos de folga: com intervalo de N semanas,
 * podem existir no máximo N-1 domingos trabalhados seguidos. O último domingo
 * folgado antes do período entra na conta para não punir a virada de mês.
 */
export function avaliarIntervaloDomingos(
  domingosFolgados: string[],
  domingosDoPeriodo: string[],
  intervaloSemanas: number,
  ultimoDomingoFolgadoAnterior?: string | null,
): IntervaloDomingos {
  const maxSeguidos = Math.max(0, Math.floor(intervaloSemanas) - 1);
  if (!intervaloSemanas || domingosDoPeriodo.length === 0) {
    return { conforme: true, domingosComIntervaloRompido: [], maiorSequenciaTrabalhada: 0 };
  }
  const folgados = new Set(domingosFolgados);
  const ordenados = [...domingosDoPeriodo].sort();
  const rompidos: string[] = [];
  // Domingos trabalhados entre a última folga dominical conhecida e o início do
  // período entram na sequência, para a virada de mês não zerar a contagem.
  let seq = 0;
  if (ultimoDomingoFolgadoAnterior) {
    const anterior = new Date(`${ultimoDomingoFolgadoAnterior}T00:00:00Z`);
    const primeiro = new Date(`${ordenados[0]}T00:00:00Z`);
    const dias = Math.round((primeiro.getTime() - anterior.getTime()) / 86_400_000);
    seq = Math.max(0, Math.floor(dias / 7) - 1);
  }
  let maior = seq;
  for (const dia of ordenados) {
    if (folgados.has(dia)) {
      seq = 0;
      continue;
    }
    seq += 1;
    maior = Math.max(maior, seq);
    if (seq > maxSeguidos) rompidos.push(dia);
  }

  return {
    conforme: rompidos.length === 0,
    domingosComIntervaloRompido: rompidos,
    maiorSequenciaTrabalhada: maior,
  };
}


export interface ConformidadeLinha extends ConformidadeInput {
  periodicidadeAplicada: number;
  /** Modelo de frequência aplicado (usado apenas para rotular a regra). */
  modoAplicado: ModoFrequencia;
  /** Texto pronto da regra aplicada ("1 folga de fim de semana por mês"). */
  rotuloFrequencia: string;
  /** Mínimo da regra configurada na unidade (base da leitura da empresa). */
  esperado: number;
  /** Piso legal do período (Art. 386 CLT para mulheres; padrão do setor nos demais). */
  esperadoLegal: number;
  /** Mínimo usado na leitura CLT: o maior entre a regra e o piso legal. */
  esperadoClt: number;


  /** Folgas consideradas na avaliação (domingos, ou dias negociados no modo acordo). */
  folgasConsideradas: number;
  /** Total de folgas registradas em dias de descanso, sem teto. */
  folgasMarcadas: number;
  /** Folgas em dias negociados aproveitadas por acordo coletivo. */
  negociadosAproveitados: number;
  /** Exigência legal (folga em domingo, ou dia negociado no acordo coletivo). */
  conformeClt: boolean;
  /** Regra configurada da unidade, considerando qualquer dia de descanso. */
  conformeEmpresa: boolean;
  /** Descansos considerados na leitura da empresa. */
  folgasEmpresa: number;
  /** Ambas as leituras em ordem. */
  conforme: boolean;
}


/** Quantos domingos de folga são esperados no período, dada a periodicidade. */
export function domingosEsperados(domingosNoPeriodo: number, periodicidadeSemanas: number): number {
  if (periodicidadeSemanas <= 0) return 0;
  return Math.floor(domingosNoPeriodo / periodicidadeSemanas);
}

type CfgConformidade = Pick<DpConfigDp, "periodicidade_domingo" | "periodicidade_domingo_mulher"> &
  Partial<
    Pick<
      DpConfigDp,
      | "tipo_descanso_domingo"
      | "dias_descanso_negociados"
      | "modo_frequencia_domingo"
      | "domingos_por_mes"
      | "modo_frequencia_domingo_mulher"
      | "domingos_por_mes_mulher"
      | "setor_comercio"
    >
  >;


/**
 * Rótulo curto da regra de frequência aplicada a um colaborador.
 * No modelo "por mês" mostra a quantidade; no modelo por semanas, o intervalo.
 */
export function rotuloFrequencia(
  modo: ModoFrequencia,
  valor: number,
  tipoDias: TipoDiasDescanso,
): string {
  if (valor <= 0) return "sem exigência";
  if (modo === "por_mes") {
    const plural = valor === 1 ? "" : "s";
    if (tipoDias === "domingo") return `${valor} domingo${plural} por mês`;
    if (tipoDias === "fim_de_semana") return `${valor} folga${plural} de fim de semana por mês`;
    return `${valor} folga${plural} de descanso por mês`;
  }
  return `${valor.toFixed(1)} sem.`;
}

export function avaliarConformidade(
  linhas: ConformidadeInput[],
  cfg: CfgConformidade,
): ConformidadeLinha[] {
  const porAcordo = cfg.tipo_descanso_domingo === "acordo_coletivo";
  const { geral, mulher } = semanasDaConfig({ setor_comercio: true, ...cfg });
  const modoGeral: ModoFrequencia = cfg.modo_frequencia_domingo ?? "semanas";
  const modoMulher: ModoFrequencia = cfg.modo_frequencia_domingo_mulher ?? "semanas";
  return linhas.map((l) => {
    const usaMulher =
      l.sexo === "F" && (mulher || Infinity) < (geral || Infinity);
    const modoAplicado = usaMulher ? modoMulher : modoGeral;
    const periodicidade = l.sexo === "F" ? Math.min(mulher || Infinity, geral || Infinity) : geral;
    const p = Number.isFinite(periodicidade) ? periodicidade : 0;
    // O override individual é mensal: 1 ou 2 domingos por mês vira uma
    // periodicidade equivalente (4 ou 2 semanas) para o período analisado.
    const pAplicada = l.domingosMesOverride
      ? Math.min(p || Infinity, l.domingosMesOverride >= 2 ? 2 : 4)
      : p;
    const pFinal = Number.isFinite(pAplicada) ? pAplicada : 0;
    // O mínimo esperado usa a regra original (respeita "X por mês" sem
    // converter para semanas, o que arredondava o mínimo para zero).
    const esperado = domingosFolgaNoPeriodo(
      {
        modo_frequencia_domingo: modoGeral,
        periodicidade_domingo: cfg.periodicidade_domingo,
        domingos_por_mes: cfg.domingos_por_mes ?? 0,
        modo_frequencia_domingo_mulher: modoMulher,
        periodicidade_domingo_mulher: cfg.periodicidade_domingo_mulher,
        domingos_por_mes_mulher: cfg.domingos_por_mes_mulher ?? 0,
      },
      l.domingosNoPeriodo,
      { sexo: l.sexo, domingosMes: l.domingosMesOverride },
    );
    // Piso legal do período: quinzenal para mulheres (Art. 386 CLT), padrão do
    // setor para os demais. A regra da unidade não pode ficar abaixo dele.
    const esperadoLegal = minimoLegalDomingos(l.domingosNoPeriodo, {
      sexo: l.sexo,
      setorComercio: cfg.setor_comercio !== false,
    });
    const esperadoClt = Math.max(esperado, esperadoLegal);
    const domingos = l.domingosFolgados.length;
    const negociados = porAcordo ? (l.diasNegociadosFolgados?.length ?? 0) : 0;
    // No modo acordo, os dias negociados só complementam o que faltar de domingo.
    const negociadosAproveitados = porAcordo
      ? Math.max(0, Math.min(negociados, esperadoClt - domingos))
      : 0;
    const folgasConsideradas = domingos + negociadosAproveitados;

    // Regra da empresa: vale qualquer dia de descanso do mês, inclusive o dia
    // fixo do cadastro de trabalho (que não gera registro de folga).
    const domingosEmpresa =
      domingos
      + (l.diasNegociadosFolgados?.length ?? 0)
      + (l.folgasOutrosDias?.length ?? 0)
      + Math.max(0, l.descansoSemanalNoMes ?? 0);

    const override = overrideDomingosMes({ domingosMes: l.domingosMesOverride });
    const modoRotulo: ModoFrequencia = override !== null ? "por_mes" : modoAplicado;
    const rotuloValor = modoRotulo === "por_mes"
      ? (override ?? (usaMulher ? (cfg.domingos_por_mes_mulher ?? 0) : (cfg.domingos_por_mes ?? 0)))
      : pFinal;
    return {
      ...l,
      periodicidadeAplicada: pFinal,
      modoAplicado,
      rotuloFrequencia: rotuloFrequencia(
        modoRotulo,
        rotuloValor,

        tipoDiasDescanso(diasElegiveisDaConfig({
          tipo_descanso_domingo: cfg.tipo_descanso_domingo ?? "legal",
          dias_descanso_negociados: cfg.dias_descanso_negociados ?? [0],
        })),
      ),
      esperado,
      esperadoLegal,
      esperadoClt,
      folgasConsideradas,
      // Total do que foi marcado em dias de descanso, mesmo acima do mínimo
      // ou fora do modo acordo — serve para o gestor ver que existe folga.
      folgasMarcadas:
        domingos
        + (l.diasNegociadosFolgados?.length ?? 0)
        + (l.folgasOutrosDias?.length ?? 0),

      negociadosAproveitados,
      // Leitura legal: só domingo (ou dia negociado, quando há acordo coletivo),
      // com o piso legal do período.
      conformeClt: folgasConsideradas >= esperadoClt,
      // Leitura da empresa: qualquer descanso do mês, incluindo o dia fixo do cadastro.
      folgasEmpresa: domingosEmpresa,
      conformeEmpresa: domingosEmpresa >= esperado,
      conforme: folgasConsideradas >= esperadoClt && domingosEmpresa >= esperado,

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
