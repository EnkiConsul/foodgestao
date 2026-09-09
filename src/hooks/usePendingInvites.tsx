import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PendingInvite {
  id: string;
  token: string;
  company_id: string;
  company_name: string | null;
  role: string;
  expires_at: string;
  created_at: string;
}

/**
 * Convites pendentes enviados para o e-mail do usuário autenticado.
 * A leitura passa por função no banco: o convidado ainda não tem vínculo com a
 * empresa, então não conseguiria ler o nome dela diretamente.
 */
export function usePendingInvites() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["pending-invites", user?.id],
    enabled: !!user,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PendingInvite[]> => {
      const { data, error } = await supabase.rpc("my_pending_invites");
      if (error) throw error;
      return (data ?? []) as PendingInvite[];
    },
  });
}
