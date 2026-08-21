import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { turnoViraODia, type HorarioFuncionamentoDia } from "@/lib/dp/turno-utils";
import type { Database } from "@/integrations/supabase/types";

export type DpHorarioFuncionamentoRow =
  Database["public"]["Tables"]["dp_unidade_horarios_funcionamento"]["Row"];

const hhmm = (v: string | null) => (v ? v.slice(0, 5) : null);

/**
 * Horário de funcionamento da unidade com múltiplos períodos por dia
 * (ex.: almoço 08:30→18:30 e jantar 17:00→00:35 no mesmo dia).
 */
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
        .order("dia_semana")
        .order("ordem");
      if (error) throw error;

      const porDia = new Map<number, HorarioFuncionamentoDia>();
      (data ?? []).forEach((r) => {
        const atual = porDia.get(r.dia_semana) ?? {
          dia_semana: r.dia_semana,
          aberto: r.aberto,
          periodos: [],
          observacoes: r.observacoes,
        };
        atual.aberto = atual.aberto || r.aberto;
        if (r.aberto && (r.hora_abertura || r.hora_fechamento)) {
          atual.periodos!.push({
            nome: (r as { nome?: string | null }).nome ?? null,
            hora_abertura: hhmm(r.hora_abertura),
            hora_fechamento: hhmm(r.hora_fechamento),
          });
        }
        porDia.set(r.dia_semana, atual);
      });
      return [...porDia.values()].sort((a, b) => a.dia_semana - b.dia_semana);
    },
  });

  const salvar = useMutation({
    mutationFn: async (dias: HorarioFuncionamentoDia[]) => {
      if (!selectedCompanyId || !unidadeId) throw new Error("Selecione uma unidade.");

      // Reescreve os períodos da unidade: mais simples e sem sobra de linhas antigas.
      const { error: delErr } = await supabase
        .from("dp_unidade_horarios_funcionamento")
        .delete()
        .eq("company_id", selectedCompanyId)
        .eq("unidade_id", unidadeId);
      if (delErr) throw delErr;

      const rows = dias.flatMap((d) => {
        const periodos = (d.periodos ?? []).filter((p) => p.hora_abertura && p.hora_fechamento);
        if (!d.aberto || periodos.length === 0) {
          return [{
            company_id: selectedCompanyId,
            unidade_id: unidadeId,
            dia_semana: d.dia_semana,
            ordem: 0,
            nome: null as string | null,
            aberto: false,
            hora_abertura: null as string | null,
            hora_fechamento: null as string | null,
            fecha_no_dia_seguinte: false,
            observacoes: d.observacoes ?? null,
          }];
        }
        return periodos.map((p, i) => ({
          company_id: selectedCompanyId,
          unidade_id: unidadeId,
          dia_semana: d.dia_semana,
          ordem: i,
          nome: p.nome?.trim() || null,
          aberto: true,
          hora_abertura: p.hora_abertura,
          hora_fechamento: p.hora_fechamento,
          fecha_no_dia_seguinte: turnoViraODia(p.hora_abertura!, p.hora_fechamento!),
          observacoes: d.observacoes ?? null,
        }));
      });

      if (rows.length > 0) {
        const { error } = await supabase.from("dp_unidade_horarios_funcionamento").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_horarios_funcionamento"] });
    },
  });

  return { ...query, horarios: query.data ?? [], salvar };
}
