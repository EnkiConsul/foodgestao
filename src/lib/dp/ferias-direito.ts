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

export type NivelVencimento =
  | "normal"
  | "planejamento"
  | "a_conceder"
  | "atencao"
  | "vencido";

export const NIVEL_VENCIMENTO_META: Record<
  NivelVencimento,
  { label: string; tone: string }
> = {
  normal: { label: "Normal", tone: "bg-muted text-muted-foreground" },
  planejamento: { label: "Planejar", tone: "bg-sky-500/15 text-sky-600" },
  a_conceder: { label: "A conceder", tone: "bg-amber-500/10 text-amber-700" },
  atencao: { label: "Atenção", tone: "bg-amber-500/15 text-amber-600" },
  vencido: { label: "Vencido", tone: "bg-destructive/15 text-destructive" },
};

/** Como a empresa quer sinalizar ciclos de férias que já se encerraram. */
export type FeriasSinalizacaoCiclo = "legal" | "a_conceder" | "vencido";

export const FERIAS_SINALIZACAO_LABEL: Record<FeriasSinalizacaoCiclo, string> = {
  legal: "Somente pelo prazo legal (12 meses após o fim do ciclo)",
  a_conceder: "Marcar como “A conceder” assim que o ciclo encerra",
  vencido: "Marcar como “Vencido” assim que o ciclo encerra",
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

/**
 * Situação de um período específico, já considerando a política da empresa para
 * ciclos aquisitivos que se encerraram e ainda têm saldo a conceder.
 * O prazo legal continua mandando: vencido e atenção têm prioridade.
 */
export function nivelVencimentoPeriodo(args: {
  fimAquisitivo: string;
  limiteConcessivo: string;
  diasSaldo: number | null | undefined;
  hojeISO: string;
  politica?: FeriasSinalizacaoCiclo;
}): NivelVencimento {
  const { fimAquisitivo, limiteConcessivo, hojeISO } = args;
  const politica = args.politica ?? "a_conceder";
  const saldo = args.diasSaldo ?? 0;
  const diasRestantes = diffDias(limiteConcessivo, hojeISO);
  if (diasRestantes < 0) return "vencido";
  const cicloEncerradoComSaldo = fimAquisitivo <= hojeISO && saldo > 0;
  if (politica === "vencido" && cicloEncerradoComSaldo) return "vencido";
  if (diasRestantes <= 30) return "atencao";
  if (politica === "a_conceder" && cicloEncerradoComSaldo) return "a_conceder";
  if (diasRestantes <= 90) return "planejamento";
  return "normal";
}

/** Diferença em dias entre duas datas ISO (yyyy-MM-dd), sem fuso. */
function diffDias(alvoISO: string, baseISO: string): number {
  const alvo = Date.UTC(
    Number(alvoISO.slice(0, 4)),
    Number(alvoISO.slice(5, 7)) - 1,
    Number(alvoISO.slice(8, 10)),
  );
  const base = Date.UTC(
    Number(baseISO.slice(0, 4)),
    Number(baseISO.slice(5, 7)) - 1,
    Number(baseISO.slice(8, 10)),
  );
  return Math.round((alvo - base) / 86_400_000);
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
  FERIAS_DATAS_INVALIDAS: "Confira as datas: o fim não pode ser antes do início.",
  FERIAS_DATA_PASSADA: "Escolha uma data futura para o início das férias.",
  FERIAS_INICIO_VESPERA:
    "As férias não podem começar nos dois dias que antecedem feriado ou descanso semanal. Escolha outro dia de início.",
  FERIAS_CONTABILIDADE_STATUS_INVALIDO: "Situação da contabilidade inválida.",
  FERIAS_SALDO_INSUFICIENTE: "O saldo deste período não cobre os dias pedidos.",
  FERIAS_SOBREPOSICAO: "Já existem férias marcadas nessas datas para esta pessoa.",
  FERIAS_CONVOCACAO_ACEITA:
    "Há convocação aceita dentro desse período. Cancele a convocação antes de marcar as férias.",
  FERIAS_AVISO_ANTECEDENCIA:
    "O aviso está abaixo da antecedência definida pela empresa. Escreva uma justificativa para seguir.",
  FERIAS_PERIODO_EM_REVISAO: "Este período exige revisão administrativa antes de marcar férias.",
  FERIAS_COLABORADOR_NAO_ENCONTRADO: "Colaborador não encontrado.",
  FERIAS_SOLICITACAO_NAO_ENCONTRADA: "Pedido de férias não encontrado.",
  FERIAS_SOLICITACAO_JA_RESPONDIDA: "Este pedido já foi respondido.",
  FERIAS_SOLICITACAO_SEM_DETALHES: "Este pedido está incompleto e não pode ser aprovado.",
  FERIAS_SOLICITACAO_DUPLICADA: "Você já tem um pedido em análise para essas datas.",
  FERIAS_MOTIVO_OBRIGATORIO: "Escreva o motivo para continuar.",
  FERIAS_NAO_ENCONTRADA: "Estas férias não foram encontradas.",
  FERIAS_JA_CONCLUIDA: "Férias já concluídas não podem ser canceladas.",
  FERIAS_BLOQUEIO: "As datas caem em um período bloqueado para férias.",
  FERIAS_SIMULTANEOS: "O limite de pessoas em férias ao mesmo tempo foi atingido.",
  FERIAS_FRACIONAMENTO_LIMITE:
    "Isso passa do número de períodos que a empresa permite dividir as férias.",
  FERIAS_FRACAO_CURTA: "Este período é menor do que o mínimo permitido pela empresa.",
  FERIAS_FRACAO_MAIOR_AUSENTE:
    "Ao dividir as férias, um dos períodos precisa alcançar o número mínimo de dias definido pela empresa.",
  FERIAS_COLABORADOR_EM_FERIAS:
    "Esta pessoa está de férias nessa data — não é possível escalar, convocar ou marcar folga.",
  FERIAS_SEM_ADMISSAO: "Informe a data de admissão da pessoa antes de controlar as férias.",
  FERIAS_SALDO_INICIAL_INVALIDO: "O saldo trazido precisa ficar entre 0 e 30 dias.",
  FERIAS_SALDO_INICIAL_CONFLITO:
    "Esse saldo é menor do que os dias já marcados neste período. Ajuste as férias primeiro.",
  FERIAS_CONTROLE_EXTERNO:
    "Este período é anterior ao início do controle no sistema e fica apenas como histórico.",
};

/**
 * Corte padrão do controle de férias quando a empresa não informa uma data:
 * início do período aquisitivo que se encerrou no ano civil anterior ao atual.
 * Assim, quem tem mais de um ano de casa sempre tem ao menos um período cobrado.
 * Nunca antes da admissão.
 */
export function corteFeriasPadrao(admissaoISO: string, hojeISO: string): string {
  const [anoAdm, mes, dia] = admissaoISO.split("-");
  const aniversario = `${mes}-${dia}`;
  const anoHoje = Number(hojeISO.slice(0, 4));
  // O período iniciado no ano Y termina no ano Y+1 (exceto quando o aniversário
  // é 1º de janeiro, caso em que termina em 31/12 do próprio ano Y).
  const ano = anoHoje - (aniversario === "01-01" ? 1 : 2);
  if (ano < Number(anoAdm)) return admissaoISO;
  const corte = `${ano}-${aniversario}`;
  return corte < admissaoISO ? admissaoISO : corte;
}






export function textoErroFerias(mensagem?: string | null): string {
  if (!mensagem) return "Não foi possível concluir a operação.";
  for (const [codigo, texto] of Object.entries(FERIAS_ERRO_TEXTO)) {
    if (mensagem.includes(codigo)) return texto;
  }
  return mensagem;
}

/* ------------------------------------------------------------------ *
 * Risco de pagamento em dobro (acúmulo de períodos)
 *
 * A lei manda conceder as férias dentro dos 12 meses seguintes ao fim do
 * ano de trabalho. Quem acumula mais de um período em aberto está a um
 * passo de estourar esse prazo — e aí a empresa paga em dobro.
 * ------------------------------------------------------------------ */

export type PeriodoRisco = {
  id: string;
  inicio_aquisitivo: string;
  fim_aquisitivo: string;
  limite_concessivo: string;
  dias_saldo: number | null | undefined;
  status: string;
  controle_externo?: boolean | null;
};

export type RiscoAcumulo = {
  /** Duas ou mais férias em aberto: risco concreto de pagar em dobro. */
  emRisco: boolean;
  /** Períodos com saldo a conceder, do mais antigo para o mais novo. */
  periodosAbertos: PeriodoRisco[];
  /** Período que vence primeiro (o que deve ser concedido antes). */
  periodoMaisAntigo: PeriodoRisco | null;
  /** Dias até o prazo do período mais antigo (negativo = já vencido). */
  diasParaLimite: number | null;
};

/** Um período conta como "em aberto" quando ainda há dias a conceder. */
export function periodoEmAberto(p: PeriodoRisco): boolean {
  if (p.controle_externo) return false;
  if ((p.dias_saldo ?? 0) <= 0) return false;
  return p.status !== "em_aquisicao" && p.status !== "concluido";
}

/** Situação de acúmulo de férias de uma pessoa. */
export function riscoAcumulo(args: { periodos: PeriodoRisco[]; hojeISO: string }): RiscoAcumulo {
  const abertos = args.periodos
    .filter(periodoEmAberto)
    .slice()
    .sort((a, b) => a.limite_concessivo.localeCompare(b.limite_concessivo));
  const maisAntigo = abertos[0] ?? null;
  return {
    emRisco: abertos.length >= 2,
    periodosAbertos: abertos,
    periodoMaisAntigo: maisAntigo,
    diasParaLimite: maisAntigo ? diffDias(maisAntigo.limite_concessivo, args.hojeISO) : null,
  };
}

/** Risco de acúmulo por colaborador, a partir de uma lista única de períodos. */
export function riscoAcumuloPorColaborador<T extends PeriodoRisco & { colaborador_id: string }>(
  periodos: T[],
  hojeISO: string,
): Map<string, RiscoAcumulo> {
  const porColab = new Map<string, T[]>();
  for (const p of periodos) {
    const lista = porColab.get(p.colaborador_id) ?? [];
    lista.push(p);
    porColab.set(p.colaborador_id, lista);
  }
  const out = new Map<string, RiscoAcumulo>();
  for (const [id, lista] of porColab) out.set(id, riscoAcumulo({ periodos: lista, hojeISO }));
  return out;
}

/** Frase curta para o gestor entender o risco sem ler a lei. */
export function textoRiscoAcumulo(risco: RiscoAcumulo): string | null {
  if (!risco.emRisco) return null;
  const n = risco.periodosAbertos.length;
  return `${n} períodos de férias em aberto — risco de pagar em dobro. Conceda o mais antigo primeiro.`;
}

/** Selo de risco de dobra, no mesmo padrão visual dos demais. */
export const RISCO_DOBRA_META = {
  label: "Risco de dobra",
  tone: "bg-destructive/15 text-destructive",
} as const;

/** Explicação em linguagem simples, usada na aba de regras. */
export const FERIAS_EXPLICACAO_DOBRA = [
  "Cada ano trabalhado gera um período de férias. A empresa tem os 12 meses seguintes para conceder essas férias.",
  "Se esse prazo passar, a lei manda pagar as férias em dobro. Por isso o sistema nunca deve deixar duas férias em aberto ao mesmo tempo.",
  "Como o sistema avisa, em ordem: Planejar (ainda dá tempo) → A conceder (o ano fechou e ninguém tirou) → Atenção (faltam 30 dias ou menos) → Vencido (o prazo passou) → Risco de dobra (a pessoa tem dois períodos em aberto).",
] as const;
