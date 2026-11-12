// ------------------------------------------------------------------
// Adiantamento salarial por SOLICITAÇÕES datadas (ativar/cancelar).
//
// Não existe chave liga/desliga: cada solicitação tem data e a última
// solicitação válida decide se a competência está ativa. Uma vez ativado,
// o adiantamento continua nos meses seguintes até um pedido de suspensão.
//
// Gestor: sem antecedência. Antes do dia do pagamento vale no próprio mês;
// no dia ou depois, a partir do mês seguinte (aceita data retroativa).
//
// Colaborador (portal): a unidade define a antecedência mínima em dias. O
// pedido vale no mês quando é feito até (dia do pagamento − antecedência);
// depois disso, vale a partir do mês seguinte.
//
// Espelha `private.dp_adiantamento_competencia_portal` e
// `private.dp_adiantamento_optante_em` — o servidor é quem grava.
// ------------------------------------------------------------------

export type AdiantamentoTipoSolicitacao = "ativar" | "cancelar";

export type AdiantamentoSolicitacao = {
  id: string;
  colaborador_id: string;
  tipo: AdiantamentoTipoSolicitacao;
  data_solicitacao: string; // ISO yyyy-mm-dd
  competencia_efeito: string; // "YYYY-MM"
  origem: "gestor" | "portal";
  observacao?: string | null;
  created_at?: string;
  termo_modo?: "documento" | "papel_existente" | null;
  termo_documento_id?: string | null;
};

/** Antecedência sugerida quando a unidade ainda não definiu a sua. */
export const ANTECEDENCIA_PADRAO_DIAS = 5;
export const ANTECEDENCIA_MIN_DIAS = 1;
export const ANTECEDENCIA_MAX_DIAS = 20;

const pad = (n: number) => String(n).padStart(2, "0");

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function competenciaDeData(iso: string): string {
  return iso.slice(0, 7);
}

export function somarCompetencia(comp: string, meses: number): string {
  const ano = Number(comp.slice(0, 4));
  const mes = Number(comp.slice(5, 7));
  const d = new Date(ano, mes - 1 + meses, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function proximaCompetencia(comp: string): string {
  return somarCompetencia(comp, 1);
}

/** "novembro/2026" */
export function rotuloCompetencia(comp: string): string {
  return `${MESES[Number(comp.slice(5, 7)) - 1]}/${comp.slice(0, 4)}`;
}

/** "15/11" */
export function rotuloDiaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Dia do pagamento na competência (limitado ao último dia do mês). */
export function pagamentoNaCompetencia(comp: string, diaPagamento: number | null | undefined): string {
  const ano = Number(comp.slice(0, 4));
  const mes = Number(comp.slice(5, 7));
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dia = diaPagamento && diaPagamento > 0 ? diaPagamento : 15;
  return `${comp}-${pad(Math.min(dia, ultimoDia))}`;
}

/** Dia do pagamento dentro do mês da data (limitado ao último dia do mês). */
export function dataPagamentoNoMes(iso: string, diaPagamento: number): string {
  return pagamentoNaCompetencia(competenciaDeData(iso), diaPagamento);
}

/** Soma dias a uma data ISO (yyyy-mm-dd). */
export function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function antecedenciaValida(antecedencia: number | null | undefined): number {
  return antecedencia == null || !Number.isFinite(antecedencia) ? ANTECEDENCIA_PADRAO_DIAS : Math.max(0, antecedencia);
}

/** Último dia em que o colaborador ainda pede para a competência. */
export function limitePedidoPortal(
  comp: string,
  diaPagamento: number | null | undefined,
  antecedencia: number | null | undefined,
): string {
  return somaDias(pagamentoNaCompetencia(comp, diaPagamento), -antecedenciaValida(antecedencia));
}

/** Competência em que o pedido do colaborador (portal) passa a valer. */
export function competenciaPortal(
  dataSolicitacao: string,
  diaPagamento: number | null | undefined,
  antecedencia: number | null | undefined,
): string {
  let comp = competenciaDeData(dataSolicitacao);
  for (let i = 0; i < 3; i++) {
    if (dataSolicitacao <= limitePedidoPortal(comp, diaPagamento, antecedencia)) return comp;
    comp = proximaCompetencia(comp);
  }
  return comp;
}

/** Competência em que o registro do GESTOR passa a valer (sem antecedência). */
export function competenciaGestor(dataSolicitacao: string, diaPagamento: number | null | undefined): string {
  const comp = competenciaDeData(dataSolicitacao);
  return dataSolicitacao >= pagamentoNaCompetencia(comp, diaPagamento) ? proximaCompetencia(comp) : comp;
}

/**
 * Competência em que a solicitação passa a valer, conforme a origem.
 * Portal usa a antecedência da unidade; gestor não tem antecedência.
 */
export function competenciaEfeito(
  dataSolicitacao: string,
  diaPagamento: number | null | undefined,
  origem: "gestor" | "portal" = "gestor",
  antecedencia?: number | null,
): string {
  return origem === "portal"
    ? competenciaPortal(dataSolicitacao, diaPagamento, antecedencia)
    : competenciaGestor(dataSolicitacao, diaPagamento);
}

/** Competência do próximo pagamento (o deste mês, até o próprio dia). */
export function competenciaDoProximoPagamento(hojeISO: string, diaPagamento: number | null | undefined): string {
  const comp = competenciaDeData(hojeISO);
  return hojeISO > pagamentoNaCompetencia(comp, diaPagamento) ? proximaCompetencia(comp) : comp;
}

type SolicitacaoEstado = Pick<AdiantamentoSolicitacao, "tipo" | "competencia_efeito" | "created_at">;

const ordenar = (a: SolicitacaoEstado, b: SolicitacaoEstado) =>
  a.competencia_efeito === b.competencia_efeito
    ? String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
    : a.competencia_efeito.localeCompare(b.competencia_efeito);

/**
 * O adiantamento estava ativo na competência? Lê a última solicitação cuja
 * competência de efeito é <= a consultada. Antes da primeira solicitação, o
 * estado é o oposto do que ela pediu (quem pede suspensão estava ativo).
 * Sem nenhuma solicitação, vale o cadastro (`fallbackOptante`).
 */
export function optanteNaCompetencia(
  solicitacoes: SolicitacaoEstado[] | null | undefined,
  competencia: string,
  fallbackOptante?: boolean | null,
): boolean {
  const todas = [...(solicitacoes ?? [])].sort(ordenar);
  const validas = todas.filter((s) => s.competencia_efeito <= competencia);
  const ultima = validas[validas.length - 1];
  if (ultima) return ultima.tipo === "ativar";
  if (todas[0]) return todas[0].tipo === "cancelar";
  return fallbackOptante === true;
}

/** Situação atual: estado na competência do próximo pagamento. */
export function situacaoAtual(
  solicitacoes: SolicitacaoEstado[] | null | undefined,
  hojeISO: string,
  fallbackOptante?: boolean | null,
  diaPagamento?: number | null,
): boolean {
  const comp = diaPagamento ? competenciaDoProximoPagamento(hojeISO, diaPagamento) : competenciaDeData(hojeISO);
  return optanteNaCompetencia(solicitacoes, comp, fallbackOptante);
}

/** Pedido do portal: só hoje ou futuro. */
export function validarSolicitacaoPortal(
  dataISO: string,
  _diaPagamento: number | null | undefined,
  hojeISO: string,
): string | null {
  if (!dataISO) return "Informe a data da solicitação.";
  if (dataISO < hojeISO) {
    return "No portal, a data da solicitação não pode ser retroativa. Fale com o gestor para datas passadas.";
  }
  return null;
}

/** Texto de ajuda: em qual competência a solicitação passa a valer. */
export function efeitoHint(
  dataISO: string,
  diaPagamento: number | null | undefined,
  origem: "gestor" | "portal" = "gestor",
  antecedencia?: number | null,
): string {
  const comp = competenciaEfeito(dataISO, diaPagamento, origem, antecedencia);
  return `Vale a partir de ${rotuloCompetencia(comp)}.`;
}

/** Prazo do pedido pelo portal feito hoje. */
export type PrazoPortal = {
  /** Competência em que um pedido feito hoje passa a valer. */
  competencia: string;
  /** Data do pagamento dessa competência. */
  pagamento: string;
  /** Último dia para pedir para essa competência. */
  limite: string;
  /** true quando ainda dá tempo para o próximo pagamento. */
  noProximoPagamento: boolean;
  /** Competência do próximo pagamento e seu prazo (pode já ter passado). */
  competenciaProxima: string;
  limiteProxima: string;
};

export function prazoPortal(
  hojeISO: string,
  diaPagamento: number | null | undefined,
  antecedencia: number | null | undefined,
): PrazoPortal {
  const competencia = competenciaPortal(hojeISO, diaPagamento, antecedencia);
  const competenciaProxima = competenciaDoProximoPagamento(hojeISO, diaPagamento);
  return {
    competencia,
    pagamento: pagamentoNaCompetencia(competencia, diaPagamento),
    limite: limitePedidoPortal(competencia, diaPagamento, antecedencia),
    noProximoPagamento: competencia === competenciaProxima,
    competenciaProxima,
    limiteProxima: limitePedidoPortal(competenciaProxima, diaPagamento, antecedencia),
  };
}
