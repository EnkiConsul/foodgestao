import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

const ROTULOS: Record<RecursoLimitado, string> = {
  colaboradores: "colaboradores",
  unidades: "unidades",
  empresas: "empresas",
  usuarios: "usuários",
  open_finance: "conexões bancárias",
  contadores: "contadores",
};

/** Limites efetivos do plano somados às contratações adicionais ativas. */
export function useLimitesAssinatura(companyId?: string | null, modulo: "pessoas" | "financeiro" = "financeiro") {
  return useQuery({
    queryKey: ["limites-assinatura", companyId, modulo],
    enabled: !!companyId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<LimitesAssinatura | null> => {
      const { data, error } = await (supabase as any).rpc("assinatura_limites", {
        _company_id: companyId,
        _modulo: modulo,
      });
      if (error) throw error;
      return (data as LimitesAssinatura) ?? null;
    },
  });
}

export function limiteExcedido(
  limites: LimitesAssinatura | null | undefined,
  recurso: RecursoLimitado,
  adicionais = 1,
) {
  if (!limites || limites.exempt) return false;
  const max = Number(limites.limits?.[recurso] ?? -1);
  if (max < 0) return false;
  const usado = Number(limites.used?.[recurso] ?? 0);
  return usado + adicionais > max;
}

export function mensagemLimite(limites: LimitesAssinatura, recurso: RecursoLimitado) {
  const max = Number(limites.limits?.[recurso] ?? -1);
  return `Seu plano permite até ${max} ${ROTULOS[recurso]}. Para incluir mais, fale com o suporte para contratar um adicional.`;
}

/**
 * Verifica o limite antes de criar um registro. Retorna true quando pode seguir.
 * Quando o limite foi atingido, avisa o usuário e retorna false.
 */
export function useChecarLimite(companyId?: string | null, modulo: "pessoas" | "financeiro" = "financeiro") {
  const qc = useQueryClient();
  const { data: limites } = useLimitesAssinatura(companyId, modulo);

  return async (recurso: RecursoLimitado, adicionais = 1) => {
    if (!companyId) return true;
    let atual = limites ?? null;
    if (!atual) {
      const { data } = await (supabase as any).rpc("assinatura_limites", {
        _company_id: companyId,
        _modulo: modulo,
      });
      atual = (data as LimitesAssinatura) ?? null;
    }
    if (!atual) return true;
    if (limiteExcedido(atual, recurso, adicionais)) {
      toast.error("Limite do plano atingido", { description: mensagemLimite(atual, recurso) });
      qc.invalidateQueries({ queryKey: ["limites-assinatura", companyId, modulo] });
      return false;
    }
    return true;
  };
}
