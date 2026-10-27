/**
 * Tradução dos códigos de erro das rotinas de troca de folga para o texto que
 * o colaborador e o gestor leem na tela.
 */
export function mensagemErroTroca(raw: string | null | undefined): string {
  const msg = raw ?? "";
  if (msg.includes("DSR_CIENCIA_OBRIGATORIA")) return "Confira novamente o alerta de descanso e registre sua ciência antes de confirmar.";
  if (msg.includes("TROCA_PROIBIDA")) return "As trocas estão desativadas nas regras desta unidade.";
  if (msg.includes("TROCA_FORA_ROTINA")) return "Uma das datas está fora do período de trabalho de uma das pessoas.";
  if (msg.includes("TROCA_DATA_BLOQUEADA")) return "Uma das folgas recebidas está bloqueada para essa pessoa.";
  if (msg.includes("troca_sem_assinatura_solicitante"))
    return "Quem pediu a troca ainda não assinou digitalmente. Peça para a pessoa cancelar e enviar o pedido de novo, assinando.";
  if (msg.includes("TROCA_SEM_FOLGA_PROPRIA"))
    return "Você não tem folga marcada na data que ofereceu.";
  if (msg.includes("TROCA_SEM_FOLGA_COLEGA"))
    return "O colega não tem mais folga na data pedida.";
  if (msg.includes("TROCA_FOLGA_EM_AFASTAMENTO_COLEGA"))
    return "A folga do colega cai em um período de atestado, licença, suspensão ou férias e não pode ser trocada.";
  if (msg.includes("TROCA_FOLGA_EM_AFASTAMENTO"))
    return "Essa folga cai em um período de atestado, licença, suspensão ou férias e não pode ser trocada.";
  if (msg.includes("TROCA_COLEGA_JA_TEM_FOLGA"))
    return "O colega já está de folga no dia que você ofereceu.";
  if (msg.includes("TROCA_JA_TEM_FOLGA"))
    return "Você já está de folga no dia pedido.";
  if (msg.includes("DUPLICATE_REQUEST"))
    return "Já existe uma troca pendente ou aprovada envolvendo essas pessoas e datas. Confira o histórico.";
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
