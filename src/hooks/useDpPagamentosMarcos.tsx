import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  feriadosQueSuspendemPrazo,
  marcosPagamentoDoMes,
  marcosPorData,
  unirMarcosUnidades,
  type MarcoPagamento,
  type MarcoPagamentoUnidades,
  type SalarioTipo,
} from "@/lib/dp/pagamentos-marcos";

const ultimoDia = (competencia: string) => {
  const [a, m] = competencia.split("-").map(Number);
  return `${competencia}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

async function feriadosDaUnidade(unidadeId: string, competencia: string) {
  const { data, error } = await supabase.rpc("dp_feriados_resolver_v2", {
    _unidade_id: unidadeId,
    _inicio: `${competencia}-01`,
    _fim: ultimoDia(competencia),
  });
  if (error) throw error;
  return (data ?? []) as { data: string; categoria: string | null }[];
}

type UnidadePagamento = {
  id: string;
  nome: string;
  tem_adiantamento: boolean | null;
  dia_adiantamento: number | null;
  pagamento_salario_tipo: string | null;
  pagamento_salario_dia: number | null;
};

/**
 * Visão do gestor: previsões de salário, adiantamento e VA da regra de cada
 * unidade no mês. Com `unidadeId` nulo junta todas as lojas ativas.
 */
export function useDpPagamentosMarcos(competencia: string, unidadeId: string | null | undefined) {
  const { selectedCompanyId } = useCompanyContext();
  const comp = competencia.slice(0, 7);
  const q = useQuery({
    queryKey: ["dp_pagamentos_marcos", selectedCompanyId, comp, unidadeId ?? "todas"],
    enabled: !!selectedCompanyId && /^\d{4}-\d{2}$/.test(comp),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MarcoPagamentoUnidades[]> => {
      let uq = supabase
        .from("dp_unidades")
        .select("id, nome, tem_adiantamento, dia_adiantamento, pagamento_salario_tipo, pagamento_salario_dia")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true);
      if (unidadeId) uq = uq.eq("id", unidadeId);
      const [{ data: unidades, error: uErr }, { data: configs, error: cErr }] = await Promise.all([
        uq,
        supabase.from("dp_config_dp").select("unidade_id, va_ativo, va_dia_pagamento").eq("company_id", selectedCompanyId!),
      ]);
      if (uErr) throw uErr;
      if (cErr) throw cErr;
      const lista = (unidades ?? []) as UnidadePagamento[];
      const cfgs = (configs ?? []) as { unidade_id: string | null; va_ativo: boolean | null; va_dia_pagamento: number | null }[];
      const empresa = cfgs.find((c) => !c.unidade_id);
      const vaAtivo = empresa?.va_ativo !== false;
      const porUnidade = await Promise.all(
        lista.map(async (u) => {
          const precisaFeriados = u.pagamento_salario_tipo === "quinto_dia_util";
          const feriados = precisaFeriados ? await feriadosDaUnidade(u.id, comp) : [];
          const cfg = cfgs.find((c) => c.unidade_id === u.id) ?? empresa;
          const marcos: MarcoPagamento[] = marcosPagamentoDoMes(
            comp,
            {
              salario: u.pagamento_salario_tipo
                ? { tipo: u.pagamento_salario_tipo as SalarioTipo, dia: u.pagamento_salario_dia }
                : null,
              adiantamentoDia: u.tem_adiantamento ? u.dia_adiantamento : null,
              vaDia: vaAtivo ? cfg?.va_dia_pagamento ?? null : null,
            },
            feriadosQueSuspendemPrazo(feriados),
          );
          return { unidade: u.nome, marcos };
        }),
      );
      return unirMarcosUnidades(porUnidade);
    },
  });
  const marcos = q.data ?? [];
  const porData = useMemo(() => marcosPorData(marcos), [marcos]);
  return { marcos, porData, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch, totalUnidades: unidadeId ? 1 : null };
}

/**
 * Visão do colaborador: o servidor devolve só as regras que valem para ele
 * (mensalista, optante do adiantamento, VA ativo) e o navegador calcula as
 * datas com os feriados da própria unidade.
 */
export function useMeusPagamentosMarcos(competencia: string, enabled: boolean) {
  const comp = competencia.slice(0, 7);
  const q = useQuery({
    queryKey: ["dp_meus_pagamentos_marcos", comp],
    enabled: enabled && /^\d{4}-\d{2}$/.test(comp),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MarcoPagamento[]> => {
      const { data, error } = await supabase.rpc("dp_portal_meus_pagamentos", { _competencia: comp });
      if (error) throw error;
      const r = (data ?? [])[0];
      if (!r) return [];
      const feriados = r.salario_tipo === "quinto_dia_util" && r.unidade_id ? await feriadosDaUnidade(r.unidade_id, comp) : [];
      return marcosPagamentoDoMes(
        comp,
        {
          salario: r.salario_tipo ? { tipo: r.salario_tipo as SalarioTipo, dia: r.salario_dia, rotulo: r.salario_rotulo } : null,
          adiantamentoDia: r.adiantamento_dia,
          vaDia: r.va_dia,
        },
        feriadosQueSuspendemPrazo(feriados),
      );
    },
  });
  const marcos = q.data ?? [];
  const porData = useMemo(() => marcosPorData(marcos), [marcos]);
  return { marcos, porData, isLoading: q.isLoading, isError: q.isError };
}
