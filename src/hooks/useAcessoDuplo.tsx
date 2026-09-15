import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Quem é administrador/dono de empresa E também tem ficha ativa de colaborador
 * (caso do sócio administrador) pode transitar entre a área administrativa e o
 * portal do colaborador. O destino padrão continua sendo a área administrativa.
 */
export function useAcessoDuplo() {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["acesso-duplo", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const [ownerRes, memberRes, colabRes] = await Promise.all([
        supabase.from("companies").select("id").eq("user_id", user!.id).limit(1),
        supabase
          .from("company_members")
          .select("role")
          .eq("user_id", user!.id)
          .in("role", ["owner", "admin"])
          .limit(1),
        supabase.rpc("sou_dp_colaborador"),
      ]);
      const isAdminOrOwner = !!ownerRes.data?.length || !!memberRes.data?.length;
      const isColaborador = !!colabRes.data;
      return { isAdminOrOwner, isColaborador };
    },
  });

  return {
    loading: q.isLoading,
    isAdminOrOwner: !!q.data?.isAdminOrOwner,
    isColaborador: !!q.data?.isColaborador,
    temAsDuasAreas: !!q.data?.isAdminOrOwner && !!q.data?.isColaborador,
  };
}
