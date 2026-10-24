import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { STATUS_PROCESSOS_VISIVEIS } from "@/lib/dp/desligamento-apresentacao";
import type { ExtratoAvisoDados } from "@/components/dp/ExtratoAviso";

export interface DesligamentoAgenda {
  id: string;
  colaborador_id: string;
  status: string;
  data_comunicacao: string;
  inicio_aviso: string;
  ultimo_comparecimento: string | null;
  data_efetiva: string;
  prazo_10_dias: string;
  pagamento_status: string;
  pagamento_em: string | null;
  extrato_aviso: ExtratoAvisoDados | null;
  colaborador: { nome: string; unidade_id: string | null } | null;
}

/** Leitura corporativa protegida pelas permissões existentes, independente da escala ativa. */
export function useDpDesligamentosAgenda() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_desligamentos_agenda", selectedCompanyId],
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<DesligamentoAgenda[]> => {
      if (!selectedCompanyId) return [];
      const { data, error } = await supabase.from("dp_desligamento_processos")
        .select("id, colaborador_id, status, data_comunicacao, inicio_aviso, ultimo_comparecimento, data_efetiva, prazo_10_dias, pagamento_status, pagamento_em, extrato_aviso, colaborador:dp_colaboradores(nome, unidade_id)")
        .eq("company_id", selectedCompanyId)
        .in("status", STATUS_PROCESSOS_VISIVEIS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DesligamentoAgenda[];
    },
  });
}