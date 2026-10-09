import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { C360Conta } from "@/lib/admin/cliente360";

export function useCliente360Lista() {
  return useQuery({
    queryKey: ["admin-cliente360"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_cliente360_lista" as any);
      if (error) throw error;
      return (data ?? []) as unknown as C360Conta[];
    },
    retry: false,
  });
}

export function useCliente360Detalhe(id: string | null) {
  return useQuery({
    queryKey: ["admin-cliente360-detalhe", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_cliente360_detalhe" as any, { _account: id });
      if (error) throw error;
      return data as unknown as { concessoes: any[]; faturas: any[]; eventos: any[] };
    },
  });
}

export type AdminUserTipo = "dono" | "membro" | "colaborador_portal" | "sem_empresa";

export function useAdminUsuariosAuth() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) throw new Error("Sessão expirada. Entre novamente.");
      const { data, error } = await supabase.functions.invoke("admin-list-users-auth");
      if (error) throw error;
      return (data as { users: any[] }).users as Array<{
        id: string; user_id: string; full_name: string | null; document: string | null; phone: string | null;
        is_active: boolean; created_at: string; tipo: AdminUserTipo; trial_usado: boolean;
        companies: { id: string; name: string; role: string }[];
        auth: { email: string | null; last_sign_in_at: string | null; created_at: string | null } | null;
      }>;
    },
    retry: false,
  });
}
