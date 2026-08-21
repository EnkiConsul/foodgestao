import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  resumoFuncionamentoSemana,
  type HorarioFuncionamentoDia,
} from "@/lib/dp/turno-utils";

/**
 * Resumo curto do funcionamento de cada unidade da empresa, para exibir no
 * card e na ficha sem abrir o formulário.
 */
export function useDpFuncionamentoResumo() {
  const { selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["dp_funcionamento_resumo", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("dp_unidade_horarios_funcionamento")
        .select("unidade_id, dia_semana, aberto, hora_abertura, hora_fechamento, ordem, nome")
        .eq("company_id", selectedCompanyId!)
        .order("dia_semana")
        .order("ordem");
      if (error) throw error;

      const porUnidade = new Map<string, Map<number, HorarioFuncionamentoDia>>();
      (data ?? []).forEach((r) => {
        const dias = porUnidade.get(r.unidade_id) ?? new Map<number, HorarioFuncionamentoDia>();
        const dia = dias.get(r.dia_semana) ?? {
          dia_semana: r.dia_semana,
          aberto: r.aberto,
          periodos: [],
        };
        dia.aberto = dia.aberto || r.aberto;
        if (r.aberto && r.hora_abertura && r.hora_fechamento) {
          dia.periodos!.push({
            nome: r.nome ?? null,
            hora_abertura: r.hora_abertura.slice(0, 5),
            hora_fechamento: r.hora_fechamento.slice(0, 5),
          });
        }
        dias.set(r.dia_semana, dia);
        porUnidade.set(r.unidade_id, dias);
      });

      const out: Record<string, string> = {};
      porUnidade.forEach((dias, unidadeId) => {
        const resumo = resumoFuncionamentoSemana([...dias.values()]);
        if (resumo) out[unidadeId] = resumo;
      });
      return out;
    },
  });

  return { resumos: query.data ?? {}, ...query };
}
