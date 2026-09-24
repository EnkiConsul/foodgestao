import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface AdminCompany {
  id: string;
  name: string;
  role: string;
}

/**
 * Empresas em que o usuário logado é dono ou administrador — ou seja, onde ele
 * pode conceder acesso a outras pessoas (alinhado às policies de company_members).
 */
export function useAdminCompanies(enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["admin-companies", user?.id],
    enabled: !!user && enabled,
    queryFn: async (): Promise<AdminCompany[]> => {
      const { data } = await supabase
        .from("company_members")
        .select("company_id, role, companies(name)")
        .eq("user_id", user!.id)
        .in("role", ["owner", "admin"]);
      return (data ?? [])
        .map((d: any) => ({
          id: d.company_id as string,
          name: (d.companies?.name as string) ?? "Empresa",
          role: d.role as string,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },
  });
}
