import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Estados devolvidos pela decisão central de acesso ao portal (backend). */
export type PortalEstado =
  | "ativo"
  | "desligado_no_prazo"
  | "desligado_expirado"
  | "bloqueado"
  | "empresa_inativa"
  | "sem_plano"
  | "sem_modulo"
  | "sem_vinculo";

export type PortalAcesso = {
  estado: PortalEstado;
  colaboradorId: string | null;
  companyId: string | null;
  acessoAte: string | null;
  somenteDocumentos: boolean;
  permitido: boolean;
};

const NEGADO: PortalAcesso = {
  estado: "sem_vinculo",
  colaboradorId: null,
  companyId: null,
  acessoAte: null,
  somenteDocumentos: false,
  permitido: false,
};

/**
 * Fonte única do direito de acesso ao Portal do Colaborador.
 *
 * O servidor decide: bloqueio, empresa inativa, assinatura, módulo Pessoas,
 * vínculo ativo e o prazo de 30 dias após o desligamento (no fuso da empresa).
 * A tela apenas reflete a decisão; nada é calculado no navegador.
 */
export function usePortalAcesso() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["dp_meu_acesso_portal", user?.id],
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PortalAcesso> => {
      const { data, error } = await supabase.rpc("dp_meu_acesso_portal");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return NEGADO;
      return {
        estado: (row.estado ?? "sem_vinculo") as PortalEstado,
        colaboradorId: row.colaborador_id ?? null,
        companyId: row.company_id ?? null,
        acessoAte: row.acesso_ate ?? null,
        somenteDocumentos: !!row.somente_documentos,
        permitido: !!row.permitido,
      };
    },
  });

  return {
    acesso: q.data ?? null,
    estado: q.data?.estado ?? null,
    permitido: q.data?.permitido ?? false,
    somenteDocumentos: q.data?.somenteDocumentos ?? false,
    acessoAte: q.data?.acessoAte ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    recarregar: q.refetch,
  };
}
