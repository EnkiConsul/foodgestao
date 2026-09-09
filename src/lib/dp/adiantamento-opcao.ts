// ------------------------------------------------------------------
// Adiantamento salarial por SOLICITAÇÕES datadas (ativar/cancelar).
//
// Não existe mais chave liga/desliga: cada solicitação tem data e a
// última solicitação válida decide se a competência está ativa.
//
// Regra de efeito:
// - Se a data da solicitação for ANTERIOR ao dia do pagamento do
//   adiantamento naquele mês, já vale na competência da própria data.
// - Se for no dia do pagamento ou depois, vale a partir da competência
//   seguinte (o adiantamento do mês já foi processado).
//
// Portal do colaborador: data de hoje ou futura e pelo menos 5 dias de
// antecedência ao pagamento (o gestor pode demorar a ver). Dentro dessa
// janela o portal bloqueia e orienta a próxima competência.
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
};

const pad = (n: number) => String(n).padStart(2, "0");

export function competenciaDeData(iso: string): string {
  return iso.slice(0, 7);
}

export function proximaCompetencia(comp: string): string {
  const ano = Number(comp.slice(0, 4));
  const mes = Number(comp.slice(5, 7));
  const d = new Date(ano, mes, 1); // mês seguinte (mes já é 1-12 aqui → Date usa 0-11)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Dia do pagamento dentro do mês da data (limitado ao último dia do mês). */
export function dataPagamentoNoMes(iso: string, diaPagamento: number): string {
  const ano = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return `${iso.slice(0, 7)}-${pad(Math.min(Math.max(diaPagamento, 1), ultimoDia))}`;
}

/** Carência do pedido feito pelo próprio colaborador (portal). */
export const CARENCIA_PORTAL_DIAS = 30;

/** Soma dias a uma data ISO (yyyy-mm-dd). */
export function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Competência em que a solicitação passa a valer.
 * Solicitada no dia do pagamento ou depois → próxima competência.
 *
 * Origem "portal": o pedido do colaborador tem carência de 30 dias (evita
 * ativar/cancelar em sequência) — a regra do dia de pagamento é aplicada
 * sobre a data do pedido + 30 dias.
 */
export function competenciaEfeito(
  dataSolicitacao: string,
  diaPagamento: number | null | undefined,
  origem: "gestor" | "portal" = "gestor",
): string {
  const base = origem === "portal" ? somaDias(dataSolicitacao, CARENCIA_PORTAL_DIAS) : dataSolicitacao;
  const comp = competenciaDeData(base);
  const dia = diaPagamento && diaPagamento > 0 ? diaPagamento : 15;
  const pagamento = dataPagamentoNoMes(base, dia);
  return base >= pagamento ? proximaCompetencia(comp) : comp;
}

/**
 * O adiantamento estava ativo na competência? Lê a última solicitação cuja
 * competência de efeito é <= a competência consultada. Sem solicitações,
 * cai no flag legado do cadastro (`fallbackOptante`).
 */
export function optanteNaCompetencia(
  solicitacoes: Pick<AdiantamentoSolicitacao, "tipo" | "competencia_efeito" | "created_at">[] | null | undefined,
  competencia: string,
  fallbackOptante?: boolean | null,
): boolean {
  const validas = (solicitacoes ?? [])
    .filter((s) => s.competencia_efeito <= competencia)
    .sort((a, b) =>
      a.competencia_efeito === b.competencia_efeito
        ? String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
        : a.competencia_efeito.localeCompare(b.competencia_efeito),
    );
  const ultima = validas[validas.length - 1];
  if (!ultima) return fallbackOptante === true;
  return ultima.tipo === "ativar";
}

/** Situação atual: última solicitação registrada (qualquer competência). */
export function situacaoAtual(
  solicitacoes: Pick<AdiantamentoSolicitacao, "tipo" | "competencia_efeito" | "created_at">[] | null | undefined,
  hojeISO: string,
  fallbackOptante?: boolean | null,
): boolean {
  return optanteNaCompetencia(solicitacoes, competenciaDeData(hojeISO), fallbackOptante);
}

/**
 * Valida uma solicitação feita pelo PORTAL do colaborador.
 * Retorna a mensagem de erro ou null quando está ok.
 */
export function validarSolicitacaoPortal(
  dataISO: string,
  diaPagamento: number | null | undefined,
  hojeISO: string,
): string | null {
  if (!dataISO) return "Informe a data da solicitação.";
  if (dataISO < hojeISO) {
    return "No portal, a data da solicitação não pode ser retroativa. Fale com o gestor para datas passadas.";
  }
  const dia = diaPagamento && diaPagamento > 0 ? diaPagamento : 15;
  const pagamento = dataPagamentoNoMes(dataISO, dia);
  // Janela de corte: 5 dias antes do pagamento até o dia do pagamento.
  const limite = new Date(`${pagamento}T12:00:00`);
  limite.setDate(limite.getDate() - 4);
  const limiteISO = `${limite.getFullYear()}-${pad(limite.getMonth() + 1)}-${pad(limite.getDate())}`;
  if (dataISO >= limiteISO && dataISO <= pagamento) {
    return "Faltam menos de 5 dias para o pagamento. A solicitação valerá a partir da próxima competência — fale com o gestor se for urgente.";
  }
  return null;
}

/** Texto de ajuda: em qual competência a solicitação de hoje passa a valer. */
export function efeitoHint(dataISO: string, diaPagamento: number | null | undefined): string {
  const comp = competenciaEfeito(dataISO, diaPagamento);
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const label = `${meses[Number(comp.slice(5, 7)) - 1]}/${comp.slice(0, 4)}`;
  return `Vale a partir de ${label}.`;
}
