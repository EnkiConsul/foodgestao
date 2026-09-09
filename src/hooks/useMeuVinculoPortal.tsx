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
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, company_id, nome, unidade_id, regime, unidade:dp_unidades(nome, possui_relogio_ponto)")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const unidade = (data as { unidade?: { nome: string | null; possui_relogio_ponto: boolean } | null })
        .unidade;
      const regime = (data.regime as string | null) ?? null;
      return {
        colaboradorId: data.id,
        companyId: data.company_id,
        nome: data.nome,
        unidadeId: data.unidade_id ?? null,
        unidadeNome: unidade?.nome ?? null,
        regime,
        unidadeUsaPonto: unidade?.possui_relogio_ponto ?? false,
        podeSerConvocado: !!regime && REGIMES_CONVOCAVEIS.includes(regime),
      };
    },
  });
}
