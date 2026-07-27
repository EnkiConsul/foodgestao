import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { lerDetalhe } from "@/lib/dp/folha";
import {
  resumirFolha,
  resumoMensal,
  resumoPorColaborador,
  resumoPorTipo,
  type LancamentoRelatorio,
} from "@/lib/dp/folha-relatorios";

/**
 * Fase 21 — lançamentos da folha de um ano, já normalizados para os
 * relatórios (com unidade do colaborador para permitir o filtro).
 */
export function useDpFolhaRelatorios(ano: number, unidadeId: string | "todas") {
  const { selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["dp_folha_relatorios", selectedCompanyId, ano],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<LancamentoRelatorio[]> => {
      const { data, error } = await supabase
        .from("dp_folha_lancamentos")
        .select(
          "colaborador_id, tipo, status, valor_bruto, valor_liquido, descontos, " +
            "dp_folha_periodos!inner(competencia), dp_colaboradores!inner(nome, unidade_id)",
        )
        .eq("company_id", selectedCompanyId!)
        .gte("dp_folha_periodos.competencia", `${ano}-01-01`)
        .lte("dp_folha_periodos.competencia", `${ano}-12-01`);
      if (error) throw error;

      return (data ?? []).map((l) => {
        const periodo = (l as { dp_folha_periodos?: { competencia: string } | null }).dp_folha_periodos;
        const colab = (l as { dp_colaboradores?: { nome: string; unidade_id: string | null } | null })
          .dp_colaboradores;
        return {
          colaboradorId: l.colaborador_id,
          nome: colab?.nome ?? "Colaborador",
          unidadeId: colab?.unidade_id ?? null,
          competencia: (periodo?.competencia ?? "").slice(0, 7),
          tipo: String(l.tipo),
          status: String(l.status),
          bruto: Number(l.valor_bruto ?? 0),
          liquido: Number(l.valor_liquido ?? 0),
          detalhe: lerDetalhe(l.descontos),
        };
      });
    },
  });

  const linhas = useMemo(() => {
    const todas = query.data ?? [];
    return unidadeId === "todas" ? todas : todas.filter((l) => l.unidadeId === unidadeId);
  }, [query.data, unidadeId]);

  return {
    linhas,
    total: useMemo(() => resumirFolha(linhas), [linhas]),
    mensal: useMemo(() => resumoMensal(ano, linhas), [ano, linhas]),
    porColaborador: useMemo(() => resumoPorColaborador(linhas), [linhas]),
    porTipo: useMemo(() => resumoPorTipo(linhas), [linhas]),
    isLoading: query.isLoading,
    error: query.error,
  };
}
