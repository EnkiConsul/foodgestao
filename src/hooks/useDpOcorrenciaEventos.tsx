import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export interface OcorrenciaEvento {
  id: string;
  ocorrencia_id: string;
  tipo_evento: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  created_at: string;
}

/** Histórico de mudanças de uma ocorrência (auditoria). */
export function useDpOcorrenciaEventos(ocorrenciaId: string | null) {
  const { selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["dp_ocorrencia_eventos", selectedCompanyId, ocorrenciaId],
    enabled: !!selectedCompanyId && !!ocorrenciaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_ocorrencia_eventos")
        .select("id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, created_at")
        .eq("company_id", selectedCompanyId!)
        .eq("ocorrencia_id", ocorrenciaId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OcorrenciaEvento[];
    },
  });

  return { eventos: query.data ?? [], loading: query.isLoading };
}

export const EVENTO_LABEL: Record<string, string> = {
  ocorrencia_criada: "Ocorrência registrada",
  ocorrencia_confirmada: "Confirmada pelo gestor",
  ocorrencia_nao_aconteceu: "Gestor marcou que não aconteceu",
  ocorrencia_complementada: "Complemento de justificativa",
  ocorrencia_classificada: "Impactos revisados",
  ocorrencia_analisada: "Análise registrada",
  ocorrencia_tratada: "Tratativa de ponto",
  ocorrencia_cancelada: "Ocorrência cancelada",
  cobertura_criada: "Cobertura proposta",
  cobertura_decidida: "Cobertura aprovada ou recusada",
  cobertura_confirmada: "Cobertura confirmada",
  atestado_vinculado: "Atestado vinculado",
  atestado_recusado: "Atestado recusado",
  atestado_aplicado: "Gerada a partir do atestado",
};

export function textoEvento(e: OcorrenciaEvento): string {
  return EVENTO_LABEL[e.tipo_evento] ?? e.tipo_evento.replace(/_/g, " ");
}
