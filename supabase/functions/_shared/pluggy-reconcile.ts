// Regras puras da reconciliação de itens órfãos (pluggy-reconcile-items).

/** Só `ofreq:<connect_request_id>` correlaciona um item a uma empresa. O
 *  `user_id` puro é rejeitado: o mesmo usuário pode estar em várias empresas. */
export function allowedReconcileClientUserIds(requestIds: string[]): Set<string> {
  return new Set(requestIds.filter(Boolean).map((id) => `ofreq:${id}`));
}

export function isReconcileCandidateAllowed(
  clientUserId: string | null | undefined,
  allowed: Set<string>,
): boolean {
  return !!clientUserId && clientUserId.startsWith('ofreq:') && allowed.has(clientUserId);
}
