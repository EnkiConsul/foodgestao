import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { textoErroFerias } from "@/lib/dp/ferias-direito";
import type { Database } from "@/integrations/supabase/types";

type SolicitacaoStatus = Database["public"]["Enums"]["dp_solicitacao_status"];

export type FeriasSolicitacao = {
  id: string;
  colaborador_id: string;
  colaborador_nome: string | null;
  status: string;
  created_at: string;
  respondido_em: string | null;
  resposta_admin: string | null;
  motivo: string | null;
  periodo_id: string;
  data_inicio: string;
  data_fim: string;
  dias: number;
  dias_abono: number;
  adiantar_13: boolean;
  observacao: string | null;
};

/** Solicitações de férias do colaborador, para aprovação do gestor. */
export function useDpFeriasSolicitacoes(status: SolicitacaoStatus[] = ["pendente"]) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["dp_ferias_solicitacoes"] });
    void qc.invalidateQueries({ queryKey: ["dp_ferias_periodos"] });
    void qc.invalidateQueries({ queryKey: ["dp_ferias_gozos"] });
  };

  const query = useQuery({
    queryKey: ["dp_ferias_solicitacoes", selectedCompanyId, status.join(",")],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<FeriasSolicitacao[]> => {
      const { data, error } = await supabase
        .from("dp_solicitacoes")
        .select(
          "id, colaborador_id, status, created_at, respondido_em, resposta_admin, motivo, " +
            "dp_colaboradores(nome), " +
            "dp_ferias_solicitacao_detalhes(periodo_id, data_inicio, data_fim, dias, dias_abono, adiantar_13, observacao)",
        )
        .eq("company_id", selectedCompanyId!)
        .eq("tipo", "ferias")
        .in("status", status)
        .order("created_at", { ascending: false });
      if (error) throw error;

      return ((data ?? []) as any[])
        .map((r) => {
          const det = Array.isArray(r.dp_ferias_solicitacao_detalhes)
            ? r.dp_ferias_solicitacao_detalhes[0]
            : r.dp_ferias_solicitacao_detalhes;
          if (!det) return null;
          return {
            id: r.id,
            colaborador_id: r.colaborador_id,
            colaborador_nome: r.dp_colaboradores?.nome ?? null,
            status: r.status,
            created_at: r.created_at,
            respondido_em: r.respondido_em,
            resposta_admin: r.resposta_admin,
            motivo: r.motivo,
            periodo_id: det.periodo_id,
            data_inicio: det.data_inicio,
            data_fim: det.data_fim,
            dias: det.dias,
            dias_abono: det.dias_abono ?? 0,
            adiantar_13: !!det.adiantar_13,
            observacao: det.observacao ?? null,
          } as FeriasSolicitacao;
        })
        .filter((r): r is FeriasSolicitacao => r !== null);
    },
  });

  const aprovar = useMutation({
    mutationFn: async (input: { id: string; justificativa?: string | null; resposta?: string | null }) => {
      const { error } = await supabase.rpc("dp_ferias_aprovar", {
        _solicitacao_id: input.id,
        _justificativa: input.justificativa?.trim() || null,
        _resposta: input.resposta?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Férias aprovadas e programadas");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  const recusar = useMutation({
    mutationFn: async (input: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("dp_ferias_recusar", {
        _solicitacao_id: input.id,
        _motivo: input.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação recusada");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  return {
    solicitacoes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    aprovar,
    recusar,
  };
}
