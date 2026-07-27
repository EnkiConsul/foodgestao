import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  lerDetalhe,
  type FolhaLancamentoStatus,
  type FolhaPeriodoStatus,
  type LinhaFolha,
} from "@/lib/dp/folha";

export interface PeriodoFolha {
  id: string;
  competencia: string;
  tipo: string;
  status: FolhaPeriodoStatus;
  data_pagamento: string | null;
  observacoes: string | null;
  totalLancamentos: number;
}

/** Fase 13 — Períodos da folha da empresa selecionada. */
export function useDpFolhaPeriodos() {
  const { selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["dp_folha_periodos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<PeriodoFolha[]> => {
      const { data, error } = await supabase
        .from("dp_folha_periodos")
        .select("id, competencia, tipo, status, data_pagamento, observacoes, dp_folha_lancamentos(count)")
        .eq("company_id", selectedCompanyId!)
        .order("competencia", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p) => {
        const lanc = (p as { dp_folha_lancamentos?: { count: number }[] }).dp_folha_lancamentos;
        return {
          id: p.id,
          competencia: p.competencia,
          tipo: p.tipo,
          status: p.status as FolhaPeriodoStatus,
          data_pagamento: p.data_pagamento,
          observacoes: p.observacoes,
          totalLancamentos: lanc?.[0]?.count ?? 0,
        };
      });
    },
  });

  return { periodos: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

/** Fase 13 — Lançamentos de um período e transições de status. */
export function useDpFolhaPeriodo(periodoId: string | undefined) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const periodoQuery = useQuery({
    queryKey: ["dp_folha_periodo_detalhe", periodoId],
    enabled: !!periodoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folha_periodos")
        .select("id, competencia, tipo, status, data_pagamento, observacoes")
        .eq("id", periodoId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const linhasQuery = useQuery({
    queryKey: ["dp_folha_lancamentos", periodoId],
    enabled: !!periodoId,
    queryFn: async (): Promise<LinhaFolha[]> => {
      const { data, error } = await supabase
        .from("dp_folha_lancamentos")
        .select("id, colaborador_id, status, valor_bruto, valor_liquido, descontos, transaction_id, dp_colaboradores:colaborador_id(nome)")
        .eq("periodo_id", periodoId!);
      if (error) throw error;
      return (data ?? [])
        .map((l) => ({
          id: l.id,
          colaborador_id: l.colaborador_id,
          nome: (l as { dp_colaboradores?: { nome: string } | null }).dp_colaboradores?.nome ?? "Colaborador",
          status: l.status as FolhaLancamentoStatus,
          valor_bruto: Number(l.valor_bruto ?? 0),
          valor_liquido: Number(l.valor_liquido ?? 0),
          detalhe: lerDetalhe(l.descontos),
          transaction_id: l.transaction_id ?? null,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });


  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_folha_periodo_detalhe", periodoId] });
    qc.invalidateQueries({ queryKey: ["dp_folha_lancamentos", periodoId] });
    qc.invalidateQueries({ queryKey: ["dp_folha_periodos", selectedCompanyId] });
    qc.invalidateQueries({ queryKey: ["dp_folha_periodo"] });
  };

  /** Muda o status do período e propaga aos lançamentos ativos. */
  const alterarStatus = useMutation({
    mutationFn: async (novo: FolhaPeriodoStatus) => {
      if (!periodoId) throw new Error("Período inválido.");
      const { error } = await supabase
        .from("dp_folha_periodos")
        .update({ status: novo })
        .eq("id", periodoId);
      if (error) throw error;

      const statusLancamento: Partial<Record<FolhaPeriodoStatus, FolhaLancamentoStatus>> = {
        aberto: "rascunho",
        aprovado_dp: "aprovado_dp",
        aprovado_financeiro: "aprovado_financeiro",
        pago: "pago",
      };
      const alvo = statusLancamento[novo];
      if (alvo) {
        const { error: errL } = await supabase
          .from("dp_folha_lancamentos")
          .update({ status: alvo })
          .eq("periodo_id", periodoId)
          .neq("status", "cancelado");
        if (errL) throw errL;
      }
      return novo;
    },
    onSuccess: () => {
      toast.success("Status da folha atualizado.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível atualizar o status."),
  });

  const cancelarLancamento = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("dp_folha_lancamentos")
        .update({ status: "cancelado" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento cancelado.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível cancelar o lançamento."),
  });

  return {
    periodo: periodoQuery.data ?? null,
    linhas: linhasQuery.data ?? [],
    isLoading: periodoQuery.isLoading || linhasQuery.isLoading,
    error: periodoQuery.error ?? linhasQuery.error,
    alterarStatus,
    cancelarLancamento,
  };
}

/** Portal — contracheques do próprio colaborador (somente aprovados/pagos por RLS). */
export function useMeusContracheques(colaboradorId: string | null) {
  const query = useQuery({
    queryKey: ["dp_meus_contracheques", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folha_lancamentos")
        .select("id, status, tipo, valor_bruto, valor_liquido, descontos, dp_folha_periodos:periodo_id(competencia, tipo, status, data_pagamento)")
        .eq("colaborador_id", colaboradorId!);
      if (error) throw error;
      return (data ?? [])
        .map((l) => {
          const p = (l as {
            dp_folha_periodos?: { competencia: string; tipo: string; status: string; data_pagamento: string | null } | null;
          }).dp_folha_periodos;
          return {
            id: l.id,
            status: l.status as FolhaLancamentoStatus,
            tipo: (p?.tipo ?? l.tipo) as string,
            competencia: p?.competencia ?? "",
            data_pagamento: p?.data_pagamento ?? null,
            valor_bruto: Number(l.valor_bruto ?? 0),
            valor_liquido: Number(l.valor_liquido ?? 0),
            detalhe: lerDetalhe(l.descontos),
          };
        })
        .sort((a, b) => b.competencia.localeCompare(a.competencia));
    },
  });

  return { itens: query.data ?? [], isLoading: query.isLoading, error: query.error };
}
