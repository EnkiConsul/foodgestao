import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type BackofficeUsuario = {
  user_id: string;
  nome: string;
  email: string;
  concedido_em: string;
  ultimo_acesso: string | null;
};

export type BackofficeCandidato = {
  user_id: string;
  nome: string;
  email: string;
  criado_em: string;
};

/** Quem tem acesso ao Backoffice hoje. */
export function useBackofficeUsuarios() {
  return useQuery({
    queryKey: ["backoffice-usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_backoffice_usuarios");
      if (error) throw error;
      return (data ?? []) as BackofficeUsuario[];
    },
  });
}

/** Usuários da plataforma que ainda não têm acesso ao Backoffice. */
export function useBackofficeCandidatos(busca: string, enabled: boolean) {
  const termo = busca.trim();
  return useQuery({
    queryKey: ["backoffice-candidatos", termo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_backoffice_candidatos", {
        _busca: termo || undefined,
      });
      if (error) throw error;
      return (data ?? []) as BackofficeCandidato[];
    },
    enabled,
  });
}

export function useConcederBackoffice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_backoffice_conceder", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso ao Backoffice concedido");
      queryClient.invalidateQueries({ queryKey: ["backoffice-usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-candidatos"] });
      queryClient.invalidateQueries({ queryKey: ["user-role"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível conceder o acesso"),
  });
}

export function useRevogarBackoffice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_backoffice_revogar", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso ao Backoffice revogado");
      queryClient.invalidateQueries({ queryKey: ["backoffice-usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-candidatos"] });
      queryClient.invalidateQueries({ queryKey: ["user-role"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível revogar o acesso"),
  });
}
