import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EnterpriseElegibilidade = {
  plano: string | null;
  minimo: number;
  colaboradores: number;
  liberado: boolean;
  mensagem: string | null;
};

/**
 * O servidor decide se o Enterprise (por colaborador ativo) pode ser contratado
 * direto pela empresa: a partir do mínimo de colaboradores ativos da conta de
 * cobrança, ou quando já há assinatura em vigor nesse plano. Abaixo: sob consulta.
 */
export function useEnterpriseElegibilidade(companyId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["enterprise-elegibilidade", companyId],
    enabled: !!companyId && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("billing_v2_enterprise_elegibilidade", { _company_id: companyId });
      if (error) throw error;
      const d = (data ?? {}) as Partial<EnterpriseElegibilidade>;
      return {
        plano: d.plano ?? null,
        minimo: Number(d.minimo ?? 1),
        colaboradores: Number(d.colaboradores ?? 0),
        liberado: d.liberado === true,
        mensagem: d.mensagem ?? null,
      } as EnterpriseElegibilidade;
    },
  });
}
