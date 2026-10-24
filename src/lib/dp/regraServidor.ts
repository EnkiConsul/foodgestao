import { negarRegra } from "./regraAviso";

const GENERICAS: Record<string, string> = {
  INVALID_INPUT: "Confira os dias e os dados informados antes de enviar o pedido.",
  DUPLICATE_REQUEST: "Você já tem uma solicitação pendente para este dia.",
  PAST_DATE_NOT_EDITABLE: "Não é possível solicitar alterações em datas passadas.",
  STATUS_INVALIDO: "Esse pedido já foi respondido. Atualize a tela.",
  FORBIDDEN: "Seu cadastro não está autorizado para esta ação. Fale com o DP.",
};

/** Somente tokens de domínio; erros de rede/SQL continuam sendo falhas reais. */
export function mensagemRegraServidor(error: unknown): string | null {
  const e = error as { message?: unknown; code?: unknown } | null;
  const texto = typeof error === "string" ? error : String(e?.message ?? "");
  const token = texto.match(/^(TROCA_[A-Z_]+|FOLGA_[A-Z_]+|INVALID_INPUT|DUPLICATE_REQUEST|PAST_DATE_NOT_EDITABLE|STATUS_INVALIDO|FORBIDDEN)(?=[:\s]|$)/)?.[1]
    ?? (typeof e?.code === "string" && /^(TROCA_[A-Z_]+|FOLGA_[A-Z_]+|INVALID_INPUT)$/.test(e.code) ? e.code : null);
  if (!token) return null;
  const detalhe = texto.startsWith(token) ? texto.slice(token.length).replace(/^[:\s-]+/, "").trim() : "";
  if (detalhe && !/\b(select|insert|update|delete|relation|constraint|sql|stack|function)\b|https?:\/\//i.test(detalhe)) return detalhe;
  return GENERICAS[token] ?? "Este pedido não atende às regras de folga ou troca. Confira os dias escolhidos ou fale com o DP.";
}

export function lancarErroSolicitacao(error: unknown): never {
  const mensagem = mensagemRegraServidor(error);
  if (mensagem) negarRegra(mensagem);
  throw error;
}