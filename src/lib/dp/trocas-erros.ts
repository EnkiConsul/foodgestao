import { RegraNegada } from "./regraAviso";

/**
 * Tradução dos códigos de erro das rotinas de troca de folga para o texto que
 * o colaborador e o gestor leem na tela.
 */
export function mensagemErroTroca(raw: string | null | undefined): string {
  const msg = raw ?? "";
  if (msg.includes("TROCA_12X36_GESTOR"))
    return "Na escala 12x36 esta troca deixa plantões em dias seguidos. Peça ao gestor para registrar a troca.";
  if (msg.includes("PLANTAO_12X36_CIENCIA_OBRIGATORIA"))
    return "Confirme que os plantões seguidos foram pedidos pelo colaborador antes de registrar.";
  if (msg.includes("PLANTAO_12X36_MOTIVO_OBRIGATORIO"))
    return "Descreva o pedido do colaborador no motivo (mínimo de 10 caracteres).";
  if (msg.includes("DSR_CIENCIA_OBRIGATORIA")) return "Confira novamente o alerta de descanso e registre sua ciência antes de confirmar.";
  if (msg.includes("TROCA_PROIBIDA")) return "As trocas estão desativadas nas regras desta unidade.";
  if (msg.includes("TROCA_FORA_DO_ESCOPO"))
    return msg.includes("dominical")
      ? "Nesta unidade a troca vale só para a folga dominical (DSR)."
      : "Nesta unidade a troca vale só para a folga semanal.";
  if (msg.includes("TROCA_FORA_ROTINA")) return "Uma das datas está fora do período de trabalho de uma das pessoas.";
  if (msg.includes("TROCA_DATA_BLOQUEADA")) return "Uma das folgas recebidas está bloqueada para essa pessoa.";
  if (msg.includes("troca_sem_assinatura_solicitante"))
    return "Quem pediu a troca ainda não assinou digitalmente. Peça para a pessoa cancelar e enviar o pedido de novo, assinando.";
  if (msg.includes("TROCA_SEM_FOLGA_PROPRIA"))
    return "Uma das pessoas não tem folga na data oferecida. Confira as duas folgas no calendário.";
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
  return FALHA_TROCA;
}

const FALHA_TROCA = "Não foi possível concluir a ação. Tente novamente.";
const TOKENS_TROCA = /\b(TROCA_[A-Z0-9_]+|PLANTAO_12X36_[A-Z_]+|DSR_CIENCIA_OBRIGATORIA|troca_sem_assinatura_solicitante|DUPLICATE_REQUEST|STATUS_INVALIDO|PAST_DATE_NOT_EDITABLE|FORBIDDEN|INVALID_INPUT)\b/;

/**
 * Erro pronto para lançar: recusa identificada por token do servidor vira
 * aviso de regra (não entra na Auditoria de erros); o resto segue como falha.
 */
export function erroTroca(raw: string | null | undefined): Error {
  const texto = mensagemErroTroca(raw);
  if (texto !== FALHA_TROCA && TOKENS_TROCA.test(raw ?? "")) return new RegraNegada(texto);
  return new Error(texto);
}
