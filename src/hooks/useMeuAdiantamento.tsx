import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MeuAdiantamento =
  | { disponivel: false; motivo: "sem_vinculo" | "vinculo_inativo" | "vinculo_sem_adiantamento" | "unidade_sem_adiantamento" }
  | {
      disponivel: true;
      colaborador_id: string;
      company_id: string;
      nome: string;
      cpf: string | null;
      cargo: string | null;
      empresa: string | null;
      cnpj: string | null;
      unidade: string | null;
      dia: number;
      antecedencia: number;
      hoje: string;
      /** Competência do próximo pagamento e seu estado. */
      competencia_atual: string;
      pagamento_atual: string;
      limite_atual: string;
      ativo_atual: boolean;
      /** Competência em que um pedido feito hoje passa a valer. */
      competencia_pedido: string;
      pagamento_pedido: string;
      limite_pedido: string;
      ativo_pedido: boolean;
      historico: { id: string; tipo: "ativar" | "cancelar"; data_solicitacao: string; competencia_efeito: string; origem: "gestor" | "portal" }[];
    };

export const MEU_ADIANTAMENTO_KEY = ["dp_portal_meu_adiantamento"] as const;

/** Situação do adiantamento do próprio colaborador (portal), decidida no servidor. */
export function useMeuAdiantamento(enabled = true) {
  return useQuery({
    queryKey: MEU_ADIANTAMENTO_KEY,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<MeuAdiantamento> => {
      const { data, error } = await supabase.rpc("dp_portal_meu_adiantamento");
      if (error) throw error;
      return (data ?? { disponivel: false, motivo: "sem_vinculo" }) as unknown as MeuAdiantamento;
    },
  });
}
