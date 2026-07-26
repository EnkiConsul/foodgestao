import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { RegraRow } from "@/lib/dp/bloqueio-rules";
import type { Database } from "@/integrations/supabase/types";

type Tipo = Database["public"]["Enums"]["dp_solicitacao_tipo"];
export type SolicitacaoRow = Database["public"]["Tables"]["dp_solicitacoes"]["Row"] & {
  dp_colaboradores: { nome: string; unidade_id: string | null } | null;
};
export type FolgaEfetivadaRow = {
  id: string;
  colaborador_id: string;
  data: string;
  tipo: string;
  status: string;
  observacao: string | null;
  dp_colaboradores: { nome: string; unidade_id: string | null } | null;
};

export type DpFolgasQueriesParams = {
  cursor: Date;
  rangeStart: Date;
  rangeEnd: Date;
  unidadeFilter: string;
  colabFilter: string;
  tipoFilter: Tipo | "todos";
};

/** Camada de dados do calendário de folgas (DP). */
export function useDpFolgasQueries({
  cursor, rangeStart, rangeEnd, unidadeFilter, colabFilter, tipoFilter,
}: DpFolgasQueriesParams) {
  const { selectedCompanyId } = useCompanyContext();
  const mesKey = format(cursor, "yyyy-MM");
  const fromISO = format(rangeStart, "yyyy-MM-dd");
  const toISO = format(rangeEnd, "yyyy-MM-dd");

  const unidadesQuery = useQuery({
    queryKey: ["dp_unidades", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_unidades")
        .select("id, nome")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const diaConfigQuery = useQuery({
    queryKey: ["dp_dia_config", selectedCompanyId, mesKey],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_dia_config")
        .select("data, limite_folgas, unidade_id")
        .eq("company_id", selectedCompanyId!)
        .gte("data", fromISO)
        .lte("data", toISO);
      if (error) throw error;
      return data ?? [];
    },
  });

  const regrasBloqueioQuery = useQuery({
    queryKey: ["dp_bloq_regras_geral", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const [{ data: regras }, { data: vinc }] = await Promise.all([
        supabase
          .from("dp_bloqueio_regras")
          .select("id, company_id, nome, tipo, mes, dia, regra_json, ativo")
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true),
        supabase.from("dp_bloqueio_regra_unidades").select("regra_id, unidade_id"),
      ]);
      return {
        regras: (regras ?? []) as RegraRow[],
        vinculos: (vinc ?? []) as { regra_id: string; unidade_id: string }[],
      };
    },
  });

  const datasBloqueadasQuery = useQuery({
    queryKey: ["dp_datas_bloqueadas_geral", selectedCompanyId, mesKey],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_datas_bloqueadas")
        .select("id, data, motivo, liberada, liberada_por_solicitacao, unidade_id, regra_id")
        .eq("company_id", selectedCompanyId!)
        .gte("data", fromISO)
        .lte("data", toISO);
      if (error) throw error;
      return data ?? [];
    },
  });

  const query = useQuery({
    queryKey: ["dp_folgas", selectedCompanyId, mesKey, unidadeFilter, colabFilter, tipoFilter],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_solicitacoes")
        .select("*, dp_colaboradores(nome, unidade_id)")
        .eq("company_id", selectedCompanyId!)
        .not("data_alvo", "is", null)
        .lte("data_alvo", toISO)
        .or(`data_fim.gte.${fromISO},and(data_fim.is.null,data_alvo.gte.${fromISO})`);
      if (tipoFilter !== "todos") q = q.eq("tipo", tipoFilter);
      if (colabFilter !== "todos") q = q.eq("colaborador_id", colabFilter);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as SolicitacaoRow[];
      if (unidadeFilter !== "todas") {
        rows = rows.filter((r) => r.dp_colaboradores?.unidade_id === unidadeFilter);
      }
      return rows;
    },
  });

  // Folgas efetivadas em dp_folgas (sorteio, admin manual, trocas)
  const folgasQuery = useQuery({
    queryKey: ["dp_folgas_efetivadas", selectedCompanyId, mesKey, unidadeFilter, colabFilter, tipoFilter],
    enabled: !!selectedCompanyId && (tipoFilter === "todos" || tipoFilter === "folga"),
    queryFn: async () => {
      let q = supabase
        .from("dp_folgas")
        .select("id, colaborador_id, data, tipo, status, observacao, dp_colaboradores!inner(nome, unidade_id)")
        .eq("company_id", selectedCompanyId!)
        .neq("status", "cancelada")
        .gte("data", fromISO)
        .lte("data", toISO);
      if (colabFilter !== "todos") q = q.eq("colaborador_id", colabFilter);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as FolgaEfetivadaRow[];
      if (unidadeFilter !== "todas") {
        rows = rows.filter((r) => r.dp_colaboradores?.unidade_id === unidadeFilter);
      }
      return rows;
    },
  });

  return { unidadesQuery, diaConfigQuery, regrasBloqueioQuery, datasBloqueadasQuery, query, folgasQuery };
}
