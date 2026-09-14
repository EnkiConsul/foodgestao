/**
 * Tradução dos códigos de erro das rotinas de troca de folga para o texto que
 * o colaborador e o gestor leem na tela.
 */
export function mensagemErroTroca(raw: string | null | undefined): string {
  const msg = raw ?? "";
  if (msg.includes("TROCA_SEM_FOLGA_PROPRIA"))
    return "Você não tem folga marcada na data que ofereceu.";
  if (msg.includes("TROCA_SEM_FOLGA_COLEGA"))
    return "O colega não tem mais folga na data pedida.";
  if (msg.includes("DUPLICATE_REQUEST"))
    return "Você já enviou uma troca pendente igual a esta.";
  if (msg.includes("STATUS_INVALIDO"))
    return "Esta troca já foi respondida ou não está mais pendente.";
  if (msg.includes("PAST_DATE_NOT_EDITABLE"))
    return "Não é possível trocar folgas em datas passadas.";
  if (msg.includes("FORBIDDEN")) return "Você não tem permissão para esta ação.";
  if (msg.includes("INVALID_INPUT")) return "Revise os dados da troca.";
  if (msg.includes("Limite") || msg.includes("bloquead"))
    return "A troca não pode ser efetivada pelas regras de folga deste dia.";
  return "Não foi possível concluir a ação. Tente novamente.";
}
