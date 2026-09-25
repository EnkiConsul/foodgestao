import { supabase } from "@/integrations/supabase/client";

export type RecursoLimitado =
  | "colaboradores"
  | "unidades"
  | "empresas"
  | "usuarios"
  | "open_finance"
  | "contadores";

export interface LimitesAssinatura {
  subscription_id: string | null;
  module: string;
  exempt: boolean;
  limits: Record<RecursoLimitado, number>;
  used: Record<RecursoLimitado, number>;
  addons: Partial<Record<RecursoLimitado, number>>;
}

export const ROTULOS_RECURSO: Record<RecursoLimitado, string> = {
  colaboradores: "colaboradores",
  unidades: "unidades",
  empresas: "empresas",
  usuarios: "usuários",
  open_finance: "conexões bancárias",
  contadores: "contadores",
};

export async function buscarLimites(
  companyId: string,
  modulo: "pessoas" | "financeiro",
): Promise<LimitesAssinatura | null> {
  const { data, error } = await (supabase as any).rpc("assinatura_limites", {
    _company_id: companyId,
    _modulo: modulo,
  });
  if (error) return null;
  return (data as LimitesAssinatura) ?? null;
}

export function excedeLimite(
  limites: LimitesAssinatura | null,
  recurso: RecursoLimitado,
  adicionais = 1,
) {
  if (!limites || limites.exempt) return false;
  const max = Number(limites.limits?.[recurso] ?? -1);
  if (max < 0) return false;
  return Number(limites.used?.[recurso] ?? 0) + adicionais > max;
}

export function mensagemLimite(limites: LimitesAssinatura, recurso: RecursoLimitado) {
  const max = Number(limites.limits?.[recurso] ?? -1);
  return `Limite do plano atingido: são permitidos até ${max} ${ROTULOS_RECURSO[recurso]}. Para incluir mais, fale com o suporte e contrate um adicional.`;
}

/**
 * Bloqueia a criação quando o plano (somado aos adicionais contratados) já
 * está no limite. Lança um erro com mensagem amigável.
 */
export async function garantirLimite(
  companyId: string | null | undefined,
  modulo: "pessoas" | "financeiro",
  recurso: RecursoLimitado,
  adicionais = 1,
) {
  if (!companyId) return;
  const limites = await buscarLimites(companyId, modulo);
  if (excedeLimite(limites, recurso, adicionais)) {
    throw new Error(mensagemLimite(limites!, recurso));
  }
}
