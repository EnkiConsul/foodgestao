import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";

/**
 * Modo suporte da equipe Aveto: super admin com uma empresa aberta da qual
 * não é titular. Decide só pela titularidade (companies.user_id), sem depender
 * de cadastro de parametrização — a faixa nunca some por falta de registro.
 */
export function useModoSuporte() {
  const { user } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();
  const { selectedCompanyId, companies } = useCompanyContext();

  const { data: proprias } = useQuery({
    queryKey: ["empresas-titular", user?.id],
    enabled: isSuperAdmin && !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies").select("id").eq("user_id", user!.id).eq("is_active", true);
      if (error) throw error;
      return (data ?? []).map((c) => c.id as string);
    },
  });

  return useMemo(() => {
    const ativo = isSuperAdmin && !!proprias && !!selectedCompanyId && !proprias.includes(selectedCompanyId);
    const cliente = ativo ? companies.find((c) => c.id === selectedCompanyId) ?? null : null;
    const minha = ativo ? companies.find((c) => proprias!.includes(c.id)) ?? null : null;
    return { ativo: ativo && !!cliente, cliente, minha };
  }, [isSuperAdmin, proprias, selectedCompanyId, companies]);
}
