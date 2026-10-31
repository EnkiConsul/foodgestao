/** O banco ainda não confirmou o cancelamento da autorização (fila de remoção remota). */
export function revogacaoPendente(providerDeleteStatus: string | null | undefined): boolean {
  if (!providerDeleteStatus) return false;
  return providerDeleteStatus.startsWith("failed") || providerDeleteStatus === "pending";
}

/** Resposta do pluggy-disconnect-item (HTTP 202 quando a revogação ficou pendente). */
export function respostaRevogacaoPendente(data: unknown): boolean {
  return !!data && typeof data === "object" && (data as { revocation_pending?: unknown }).revocation_pending === true;
}
