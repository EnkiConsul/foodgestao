import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import { turnoViraODia, type HorarioFuncionamentoDia } from "@/lib/dp/turno-utils";

export type DpHorarioFuncionamentoRow =
  Database["public"]["Tables"]["dp_unidade_horarios_funcionamento"]["Row"];

const hhmm = (v: string | null) => (v ? v.slice(0, 5) : null);

export function useDpHorariosFuncionamento(unidadeId: string | null | undefined) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_horarios_funcionamento", selectedCompanyId, unidadeId],
    enabled: !!selectedCompanyId && !!unidadeId,
    queryFn: async (): Promise<HorarioFuncionamentoDia[]> => {
      const { data, error } = await supabase
        .from("dp_unidade_horarios_funcionamento")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("unidade_id", unidadeId!)
        .order("dia_semana");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        dia_semana: r.dia_semana,
        aberto: r.aberto,
        hora_abertura: hhmm(r.hora_abertura),
        hora_fechamento: hhmm(r.hora_fechamento),
        fecha_no_dia_seguinte: r.fecha_no_dia_seguinte,
        observacoes: r.observacoes,
      }));
    },
  });

  const salvar = useMutation({
    mutationFn: async (dias: HorarioFuncionamentoDia[]) => {
      if (!selectedCompanyId || !unidadeId) throw new Error("Selecione uma unidade.");
      const { error } = await supabase.from("dp_unidade_horarios_funcionamento").upsert(
        dias.map((d) => ({
          company_id: selectedCompanyId,
          unidade_id: unidadeId,
          dia_semana: d.dia_semana,
          aberto: d.aberto,
          hora_abertura: d.aberto ? d.hora_abertura : null,
          hora_fechamento: d.aberto ? d.hora_fechamento : null,
          fecha_no_dia_seguinte:
            d.aberto && d.hora_abertura && d.hora_fechamento
              ? turnoViraODia(d.hora_abertura, d.hora_fechamento)
              : false,
          observacoes: d.observacoes ?? null,
        })),
        { onConflict: "unidade_id,dia_semana" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_horarios_funcionamento"] });
    },
  });

  return { ...query, horarios: query.data ?? [], salvar };
}
