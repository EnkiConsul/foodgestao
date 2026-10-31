// Prova de posse do item Pluggy no primeiro vínculo feito por usuário (regra pura).

export interface ConnectRequestRow {
  id: string;
  user_id: string;
  company_id: string;
  created_at: string;
}

export type OwnershipResult =
  | { ok: true; via: 'ofreq' | 'legacy'; requestId: string }
  | { ok: false; reason: 'missing_client_user_id' | 'request_not_found' | 'no_recent_request' };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Aceita clientUserId `ofreq:<id>` de solicitação da MESMA empresa e MESMO
 * usuário nas últimas 24h, ou o legado clientUserId === userId com solicitação
 * recente do mesmo usuário e empresa.
 */
export function checkItemOwnership(
  clientUserId: string | null | undefined,
  userId: string,
  companyId: string,
  requests: ConnectRequestRow[],
  now = Date.now(),
): OwnershipResult {
  if (!clientUserId) return { ok: false, reason: 'missing_client_user_id' };
  const recentes = requests.filter((r) =>
    r.user_id === userId && r.company_id === companyId
    && now - Date.parse(r.created_at) <= DAY_MS);
  if (clientUserId.startsWith('ofreq:')) {
    const id = clientUserId.slice(6);
    const r = recentes.find((x) => x.id === id);
    return r ? { ok: true, via: 'ofreq', requestId: r.id } : { ok: false, reason: 'request_not_found' };
  }
  if (clientUserId === userId) {
    return recentes.length
      ? { ok: true, via: 'legacy', requestId: recentes[0].id }
      : { ok: false, reason: 'no_recent_request' };
  }
  return { ok: false, reason: 'request_not_found' };
}
