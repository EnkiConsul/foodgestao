import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { FechamentoCalculado } from "@/lib/dp/ponto";

export type FechamentoRow = Database["public"]["Tables"]["dp_ponto_fechamentos"]["Row"];

const mesAnterior = (comp: string) => {
  const [ano, mes] = comp.split("-").map(Number);
  const d = new Date(ano, mes - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Fechamento de ponto do colaborador na competência, junto com o saldo
 * acumulado do mês anterior (base do banco de horas).
 */
export function useDpPontoFechamento(colaboradorId: string | null, competencia: string, companyId?: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_ponto_fechamento", colaboradorId, competencia],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_ponto_fechamentos")
        .select("*")
        .eq("colaborador_id", colaboradorId!)
        .in("competencia", [competencia, mesAnterior(competencia)]);
      if (error) throw error;
      const rows = (data ?? []) as FechamentoRow[];
      return {
        atual: rows.find((r) => r.competencia === competencia) ?? null,
        anterior: rows.find((r) => r.competencia === mesAnterior(competencia)) ?? null,
      };
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_ponto_fechamento"] });
    qc.invalidateQueries({ queryKey: ["dp_pontos"] });
  };

  const fechar = useMutation({
    mutationFn: async ({ calculo, observacao }: { calculo: FechamentoCalculado; observacao?: string | null }) => {
      if (!colaboradorId || !companyId) throw new Error("Selecione um colaborador para fechar a competência.");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_ponto_fechamentos").insert({
        company_id: companyId,
        colaborador_id: colaboradorId,
        competencia: calculo.competencia,
        minutos_trabalhados: calculo.minutosTrabalhados,
        minutos_previstos: calculo.minutosPrevistos,
        saldo_minutos: calculo.saldoMinutos,
        saldo_anterior_minutos: calculo.saldoAnteriorMinutos,
        saldo_acumulado_minutos: calculo.saldoAcumuladoMinutos,
        faltas: calculo.faltas,
        atraso_minutos: calculo.atrasoMinutos,
        observacao: observacao ?? null,
        fechado_por: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reabrir = useMutation({
    mutationFn: async () => {
      if (!query.data?.atual) return;
      const { error } = await supabase.from("dp_ponto_fechamentos").delete().eq("id", query.data.atual.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    fechamento: query.data?.atual ?? null,
    saldoAnteriorMinutos: query.data?.anterior?.saldo_acumulado_minutos ?? 0,
    isLoading: query.isLoading,
    fechar,
    reabrir,
  };
}
