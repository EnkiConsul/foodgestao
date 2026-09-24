import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyAccount {
  id: string;
  name: string;
  is_active: boolean;
}

/** Contas financeiras (caixas e bancos) da empresa, para escolher o que o usuário pode ver. */
export function useCompanyAccounts(companyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["company-accounts-picker", companyId],
    enabled: !!companyId && enabled,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("accounts")
        .select("id, name, is_active")
        .eq("company_id", companyId!)
        .is("soft_deleted_at", null)
        .order("name");
      return ((data ?? []) as CompanyAccount[]).sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR"),
      );
    },
  });
}
