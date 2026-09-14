/**
 * Decisão de acesso ao portal do colaborador — nega por padrão.
 *
 * Só existe liberação com resposta explícita de acesso permitido. Falha de
 * consulta, resposta vazia ou inesperada resultam em negação: erro de
 * autorização nunca vira permissão.
 */
export type SituacaoAcessoPortal = "liberado" | "bloqueado" | "falha";

export function decidirAcessoPortal(resposta: {
  data: unknown;
  error: unknown;
}): SituacaoAcessoPortal {
  if (resposta.error) return "falha";
  if (resposta.data === true) return "liberado";
  if (resposta.data === false) return "bloqueado";
  return "falha";
}
