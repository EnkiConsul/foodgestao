import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type MeuVinculoPortal = {
  colaboradorId: string;
  companyId: string;
  nome: string;
  unidadeId: string | null;
  unidadeNome: string | null;
  regime: string | null;
  /** A unidade registra ponto (relógio/marcação)? */
  unidadeUsaPonto: boolean;
  /** Pode ser convocado (intermitente / folguista). */
  podeSerConvocado: boolean;
};

const REGIMES_CONVOCAVEIS = ["intermitente", "freelancer"];

/**
 * Dados do vínculo do próprio colaborador usados pelo portal para decidir
 * o que faz sentido exibir (ponto, convocações, colegas da mesma unidade).
 */
export function useMeuVinculoPortal() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["dp_meu_vinculo_portal", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<MeuVinculoPortal | null> => {
      // Identidade vem do servidor a partir da sessão: nenhum id é enviado
      // pelo navegador. Vínculo inexistente, bloqueado ou em conflito
      // devolve vazio (nega o acesso ao contexto).
      const { data, error } = await supabase.rpc("dp_meu_vinculo");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.colaborador_id) return null;
      const regime = row.regime ?? null;
      return {
        colaboradorId: row.colaborador_id,
        companyId: row.company_id,
        nome: row.nome ?? "",
        unidadeId: row.unidade_id ?? null,
        unidadeNome: row.unidade_nome ?? null,
        regime,
        unidadeUsaPonto: row.unidade_usa_ponto ?? false,
        podeSerConvocado: !!regime && REGIMES_CONVOCAVEIS.includes(regime),
      };
    },
  });
}
