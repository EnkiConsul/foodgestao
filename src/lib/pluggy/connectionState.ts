export type PluggyConnectionState = "ativo" | "pausado" | "desconectado";

/**
 * Estado de uma conexão Open Finance na visão do usuário:
 * - desconectado: consentimento revogado (ou conexão legada apagada)
 * - pausado: consentimento válido, mas todas as contas com sincronização pausada
 * - ativo: sincronizando normalmente
 */
export function connectionState(
  status: string,
  accounts: { count: number; paused: number },
): PluggyConnectionState {
  if (status === "revoked" || status === "deleted") return "desconectado";
  if (accounts.count > 0 && accounts.paused >= accounts.count) return "pausado";
  return "ativo";
}
