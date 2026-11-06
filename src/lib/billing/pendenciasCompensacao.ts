/**
 * Casamento de pendências de compensação/desfazimento com as suas resoluções
 * (Backoffice). Uma resolução só encerra a pendência a que pertence:
 * - pelo id (`payload.evento_pendente_id`), quando informado; ou
 * - sem id: mesma assinatura e resolução registrada no mesmo instante ou depois.
 * Assim uma resolução antiga nunca esconde um alerta novo da mesma assinatura.
 */
export type EventoConta = {
  id: string;
  created_at: string;
  billing_account_id: string;
  payload: any;
  tipo_evento: string;
};

const RESOLVE: Record<string, string> = {
  contratacao_falhou_compensacao_pendente: "compensacao_resolvida",
  compensacao_pendente: "compensacao_resolvida",
  desfazimento_incompleto: "desfazimento_resolvido",
};

export function pendenciaResolvida(p: EventoConta, eventos: EventoConta[]): boolean {
  const tipoRes = RESOLVE[p.tipo_evento];
  if (!tipoRes) return false;
  const tP = new Date(p.created_at).getTime();
  return eventos.some((r) => {
    if (r.tipo_evento !== tipoRes) return false;
    const alvo = r.payload?.evento_pendente_id;
    if (alvo) return alvo === p.id;
    const sub = p.payload?.subscription_id;
    if (!sub || r.payload?.subscription_id !== sub) return false;
    return new Date(r.created_at).getTime() >= tP;
  });
}

export function pendenciasAbertas(eventos: EventoConta[]) {
  const abertas = (tipo: string) => eventos.filter((e) => e.tipo_evento === tipo && !pendenciaResolvida(e, eventos));
  return {
    compensacoes: abertas("contratacao_falhou_compensacao_pendente"),
    desfazUpgrade: abertas("compensacao_pendente"),
    incompletos: abertas("desfazimento_incompleto"),
  };
}
