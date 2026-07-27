// Regras de Descanso Semanal Remunerado (DSR) e periodicidade de folga dominical.
// Funções puras — sem acesso a banco — para poderem ser testadas isoladamente.

export type PoliticaSabado = "trabalha" | "folga" | "alterna" | "especifica";
export type PoliticaFeriado = "compensa" | "dobro";
export type RegraDsr = "clt" | "cct" | "propria";
/** `legal` = folga dominical estrita. `acordo_coletivo` = domingo pode ser substituído por sábado. */
export type TipoDescansoDomingo = "legal" | "acordo_coletivo";

export interface DpConfigDp {
  company_id: string;
  setor_comercio: boolean;
  /** Periodicidade de folga dominical, em semanas. 0 = nunca exigir. */
  periodicidade_domingo: number;
  /** Periodicidade específica para mulheres (Art. 386 CLT), em semanas. */
  periodicidade_domingo_mulher: number;
  /** Teto de folgas de fim de semana que o colaborador pode marcar por mês. */
  folgas_fds_por_mes: number;
  politica_sabado: PoliticaSabado;
  politica_feriado: PoliticaFeriado;
  regra_dsr: RegraDsr;
  exige_validacao_menor: boolean;
  tipo_descanso_domingo: TipoDescansoDomingo;
  /** Negociação sindical (ACT/CCT) que embasa o modo acordo coletivo. */
  negociacao_id: string | null;
}

export const DP_CONFIG_DP_DEFAULT: Omit<DpConfigDp, "company_id"> = {
  setor_comercio: true,
  periodicidade_domingo: 3,
  periodicidade_domingo_mulher: 2,
  folgas_fds_por_mes: 1,
  politica_sabado: "alterna",
  politica_feriado: "compensa",
  regra_dsr: "clt",
  exige_validacao_menor: true,
  tipo_descanso_domingo: "legal",
  negociacao_id: null,
};


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

function textoAlerta(valor: number, padrao: number, publico: string): string {
  const configurada = valor <= 0 ? "sem exigência de folga dominical" : `${valor} semana(s)`;
  return (
    `A periodicidade configurada (${configurada}) é inferior ao padrão legal de ${padrao} semana(s) ` +
    `${publico}. A legislação (Lei 10.101/2000 e Art. 386 CLT) exige folgas dominicais mais frequentes. ` +
    `Deseja continuar?`
  );
}

/**
 * Retorna os alertas de ciência que devem ser exibidos ao salvar a configuração.
 * Lista vazia = salvar direto, sem modal.
 */
export function alertasDeCiencia(
  cfg: Pick<DpConfigDp, "setor_comercio" | "periodicidade_domingo" | "periodicidade_domingo_mulher">,
  opts: { temMulheres: boolean },
): AlertaCiencia[] {
  const out: AlertaCiencia[] = [];
  const padrao = padraoLegalDomingo(cfg.setor_comercio);

  if (isMenosProtetiva(cfg.periodicidade_domingo, padrao)) {
    out.push({
      campo: "periodicidade_domingo",
      valor: cfg.periodicidade_domingo,
      padrao,
      mensagem: textoAlerta(cfg.periodicidade_domingo, padrao, "para o setor desta empresa"),
    });
  }

  if (opts.temMulheres && isMenosProtetiva(cfg.periodicidade_domingo_mulher, PADRAO_LEGAL_DOMINGO_MULHER)) {
    out.push({
      campo: "periodicidade_domingo_mulher",
      valor: cfg.periodicidade_domingo_mulher,
      padrao: PADRAO_LEGAL_DOMINGO_MULHER,
      mensagem: textoAlerta(
        cfg.periodicidade_domingo_mulher,
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
  /** Total de domingos existentes no período analisado. */
  domingosNoPeriodo: number;
}

export interface ConformidadeLinha extends ConformidadeInput {
  periodicidadeAplicada: number;
  esperado: number;
  conforme: boolean;
}

/** Quantos domingos de folga são esperados no período, dada a periodicidade. */
export function domingosEsperados(domingosNoPeriodo: number, periodicidadeSemanas: number): number {
  if (periodicidadeSemanas <= 0) return 0;
  return Math.floor(domingosNoPeriodo / periodicidadeSemanas);
}

export function avaliarConformidade(
  linhas: ConformidadeInput[],
  cfg: Pick<DpConfigDp, "periodicidade_domingo" | "periodicidade_domingo_mulher">,
): ConformidadeLinha[] {
  return linhas.map((l) => {
    const periodicidade =
      l.sexo === "F"
        ? Math.min(cfg.periodicidade_domingo_mulher || Infinity, cfg.periodicidade_domingo || Infinity)
        : cfg.periodicidade_domingo;
    const p = Number.isFinite(periodicidade) ? periodicidade : 0;
    const esperado = domingosEsperados(l.domingosNoPeriodo, p);
    return {
      ...l,
      periodicidadeAplicada: p,
      esperado,
      conforme: l.domingosFolgados.length >= esperado,
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
