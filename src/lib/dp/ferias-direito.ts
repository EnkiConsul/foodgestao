/**
 * Regras puras de direito a férias e de acompanhamento do prazo de concessão.
 *
 * O cálculo autoritativo é do banco (`dp_ferias_dias_direito`); estas funções
 * espelham a mesma tabela legal apenas para explicar a situação na tela.
 */

export type FaixaFaltas = {
  /** Menor número de faltas da faixa. */
  de: number;
  /** Maior número de faltas da faixa (null = acima da tabela legal). */
  ate: number | null;
  /** Dias de férias correspondentes (0 quando exige revisão administrativa). */
  dias: number;
};

/** Tabela legal de faltas injustificadas computáveis para férias. */
export const FAIXAS_FALTAS: FaixaFaltas[] = [
  { de: 0, ate: 5, dias: 30 },
  { de: 6, ate: 14, dias: 24 },
  { de: 15, ate: 23, dias: 18 },
  { de: 24, ate: 32, dias: 12 },
  { de: 33, ate: null, dias: 0 },
];

/** Dias de direito conforme as faltas informadas. Acima de 32 → 0 (revisão). */
export function diasDireitoPorFaltas(faltas: number | null | undefined): number {
  if (faltas === null || faltas === undefined) return 30;
  if (faltas < 0) return 30;
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

/** Acima de 32 faltas a lei não resolve sozinha: exige revisão administrativa. */
export function exigeRevisaoAdministrativa(faltas: number | null | undefined): boolean {
  return typeof faltas === "number" && faltas > 32;
}

export type NivelVencimento = "normal" | "planejamento" | "atencao" | "vencido";

export const NIVEL_VENCIMENTO_META: Record<
  NivelVencimento,
  { label: string; tone: string }
> = {
  normal: { label: "Normal", tone: "bg-muted text-muted-foreground" },
  planejamento: { label: "Planejar", tone: "bg-sky-500/15 text-sky-600" },
  atencao: { label: "Atenção", tone: "bg-amber-500/15 text-amber-600" },
  vencido: { label: "Vencido", tone: "bg-destructive/15 text-destructive" },
};

/**
 * Situação do prazo de concessão:
 *  - vencido → o limite já passou;
 *  - atencao → faltam 30 dias ou menos (situação prioritária);
 *  - planejamento → faltam 90 dias ou menos (aviso interno de planejamento);
 *  - normal → sem urgência.
 */
export function nivelVencimento(diasRestantes: number): NivelVencimento {
  if (diasRestantes < 0) return "vencido";
  if (diasRestantes <= 30) return "atencao";
  if (diasRestantes <= 90) return "planejamento";
  return "normal";
}

/** Texto do prazo, em linguagem de gestor. */
export function textoPrazo(diasRestantes: number): string {
  if (diasRestantes < 0) return `Prazo vencido há ${Math.abs(diasRestantes)} dia(s)`;
  if (diasRestantes === 0) return "O prazo termina hoje";
  return `Faltam ${diasRestantes} dia(s) para o prazo`;
}

/** Traduz os erros das rotinas de férias para uma frase simples. */
export const FERIAS_ERRO_TEXTO: Record<string, string> = {
  FERIAS_FALTAS_INVALIDAS: "Informe um número de faltas válido.",
  FERIAS_PERIODO_NAO_ENCONTRADO: "Este período de férias não foi encontrado.",
  FERIAS_SEM_PERMISSAO: "Você não tem acesso às férias desta empresa.",
  FERIAS_FALTAS_MOTIVO_OBRIGATORIO: "Explique o motivo da alteração das faltas.",
  FERIAS_FALTAS_CONFLITO_SALDO:
    "Com essas faltas o direito fica menor do que os dias de férias já marcados. Ajuste as férias primeiro.",
};

export function textoErroFerias(mensagem?: string | null): string {
  if (!mensagem) return "Não foi possível concluir a operação.";
  for (const [codigo, texto] of Object.entries(FERIAS_ERRO_TEXTO)) {
    if (mensagem.includes(codigo)) return texto;
  }
  return mensagem;
}
