import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  lerDetalhe,
  lerExtras,
  valoresDoLancamento,
  type RubricaExtra,
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
        .select("id, colaborador_id, status, valor_bruto, valor_liquido, descontos, transaction_id, assiduidade_atestado_abonado, assiduidade_abono_motivo, dp_colaboradores:colaborador_id(nome)")
        .eq("periodo_id", periodoId!);
      if (error) throw error;
      return (data ?? [])
        .map((l) => {
          const detalhe = lerDetalhe(l.descontos);
          const valores = valoresDoLancamento(detalhe);
          return {
            id: l.id,
            colaborador_id: l.colaborador_id,
            nome: (l as { dp_colaboradores?: { nome: string } | null }).dp_colaboradores?.nome ?? "Colaborador",
            status: l.status as FolhaLancamentoStatus,
            valor_bruto: valores.bruto,
            valor_liquido: valores.liquido,
            detalhe,
            transaction_id: l.transaction_id ?? null,
            atestado_abonado: !!(l as { assiduidade_atestado_abonado?: boolean | null }).assiduidade_atestado_abonado,
            atestado_abono_motivo:
              (l as { assiduidade_abono_motivo?: string | null }).assiduidade_abono_motivo ?? null,
          };
        })
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

  /** Fase 16 — salva as rubricas avulsas de um lançamento e recalcula bruto/líquido. */
  const salvarRubricas = useMutation({
    mutationFn: async ({ id, extras }: { id: string; extras: RubricaExtra[] }) => {
      const { data, error } = await supabase
        .from("dp_folha_lancamentos")
        .select("descontos, status")
        .eq("id", id)
        .single();
      if (error) throw error;
      if (data.status !== "rascunho") {
        throw new Error("Só é possível editar rubricas em lançamentos em rascunho.");
      }
      const detalhe = { ...lerDetalhe(data.descontos), extras: lerExtras(extras) };
      const valores = valoresDoLancamento(detalhe);
      const { error: errUpd } = await supabase
        .from("dp_folha_lancamentos")
        .update({
          descontos: JSON.parse(JSON.stringify(detalhe)),
          valor_bruto: valores.bruto,
          valor_liquido: valores.liquido,
        })
        .eq("id", id);
      if (errUpd) throw errUpd;
    },
    onSuccess: () => {
      toast.success("Rubricas atualizadas.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar as rubricas."),
  });

  /**
   * Abono de atestado: a empresa pode, por liberalidade e caso a caso, manter o
   * prêmio de assiduidade mesmo com atestado apresentado no mês.
   */
  const abonarAtestado = useMutation({
    mutationFn: async ({ id, abonado, motivo }: { id: string; abonado: boolean; motivo?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_folha_lancamentos")
        .update({
          assiduidade_atestado_abonado: abonado,
          assiduidade_abono_motivo: abonado ? (motivo?.trim() || null) : null,
          assiduidade_abono_por: abonado ? auth.user?.id ?? null : null,
          assiduidade_abono_em: abonado ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
      return abonado;
    },
    onSuccess: (abonado) => {
      toast.success(abonado ? "Atestado abonado — prêmio mantido." : "Abono removido.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível registrar o abono."),
  });

  /** Fase 14 — gera a despesa consolidada da folha no financeiro (conta a pagar). */
  const gerarDespesa = useMutation({
    mutationFn: async (params: { accountId?: string | null; categoryId?: string | null; dataPagamento?: string | null }) => {
      if (!periodoId) throw new Error("Período inválido.");
      const { data, error } = await supabase.rpc("dp_folha_gerar_despesa", {
        p_periodo_id: periodoId,
        p_account_id: params.accountId ?? undefined,
        p_category_id: params.categoryId ?? undefined,
        p_data_pagamento: params.dataPagamento ?? undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Despesa da folha gerada no financeiro.");
      invalidate();
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível gerar a despesa."),
  });

  /** Fase 14 — remove a despesa gerada, desde que ainda não confirmada. */
  const desfazerDespesa = useMutation({
    mutationFn: async () => {
      if (!periodoId) throw new Error("Período inválido.");
      const { error } = await supabase.rpc("dp_folha_desfazer_despesa", { p_periodo_id: periodoId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Despesa removida do financeiro.");
      invalidate();
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível desfazer a despesa."),
  });

  const transactionId = (linhasQuery.data ?? []).find((l) => l.transaction_id)?.transaction_id ?? null;

  return {
    periodo: periodoQuery.data ?? null,
    linhas: linhasQuery.data ?? [],
    transactionId,
    isLoading: periodoQuery.isLoading || linhasQuery.isLoading,
    error: periodoQuery.error ?? linhasQuery.error,
    alterarStatus,
    abonarAtestado,
    cancelarLancamento,
    salvarRubricas,
    gerarDespesa,
    desfazerDespesa,
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
          const detalhe = lerDetalhe(l.descontos);
          const valores = valoresDoLancamento(detalhe);
          return {
            id: l.id,
            status: l.status as FolhaLancamentoStatus,
            tipo: (p?.tipo ?? l.tipo) as string,
            competencia: p?.competencia ?? "",
            data_pagamento: p?.data_pagamento ?? null,
            valor_bruto: valores.bruto,
            valor_liquido: valores.liquido,
            detalhe,
          };
        })
        .sort((a, b) => b.competencia.localeCompare(a.competencia));
    },
  });

  return { itens: query.data ?? [], isLoading: query.isLoading, error: query.error };
}
