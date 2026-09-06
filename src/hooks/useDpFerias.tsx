import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { textoErroFerias } from "@/lib/dp/ferias-direito";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type FeriasPeriodo = Database["public"]["Tables"]["dp_ferias_periodos"]["Row"] & {
  colaborador_nome?: string | null;
  unidade_id?: string | null;
};
export type FeriasGozo = Database["public"]["Tables"]["dp_ferias_gozos"]["Row"];
export type FeriasPeriodoStatus = Database["public"]["Enums"]["dp_ferias_periodo_status"];
export type FeriasGozoStatus = Database["public"]["Enums"]["dp_ferias_gozo_status"];

export type GozoInput = {
  id?: string;
  periodo_id: string;
  colaborador_id: string;
  data_inicio: string;
  data_fim: string;
  dias_abono: number;
  adiantar_13: boolean;
  aviso_em: string | null;
  status: FeriasGozoStatus;
  observacao: string | null;
};

export type FaltasInput = { periodoId: string; faltas: number; motivo?: string | null };

/** Dados e mutations de férias formais (períodos aquisitivos + gozos). */
export function useDpFerias(colaboradorFilter: string) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_ferias_periodos"] });
    qc.invalidateQueries({ queryKey: ["dp_ferias_gozos"] });
  };


  const periodosQ = useQuery({
    queryKey: ["dp_ferias_periodos", selectedCompanyId, colaboradorFilter],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_ferias_periodos")
        .select("*, dp_colaboradores(nome, unidade_id)")
        .eq("company_id", selectedCompanyId!)
        .order("inicio_aquisitivo", { ascending: false });
      if (colaboradorFilter !== "todos") q = q.eq("colaborador_id", colaboradorFilter);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        colaborador_nome: r.dp_colaboradores?.nome ?? null,
        unidade_id: r.dp_colaboradores?.unidade_id ?? null,
      })) as FeriasPeriodo[];
    },
  });

  const gozosQ = useQuery({
    queryKey: ["dp_ferias_gozos", selectedCompanyId, colaboradorFilter],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_ferias_gozos")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("data_inicio", { ascending: true });
      if (colaboradorFilter !== "todos") q = q.eq("colaborador_id", colaboradorFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as FeriasGozo[];
    },
  });

  const gerarPeriodos = useMutation({
    mutationFn: async (colaboradorId: string) => {
      const { data, error } = await supabase.rpc("dp_ferias_gerar_periodos", {
        _colaborador_id: colaboradorId,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: (criados) => {
      toast.success(
        criados > 0
          ? `${criados} período(s) aquisitivo(s) gerado(s)`
          : "Períodos já estavam atualizados",
      );
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao gerar períodos"),
  });

  /**
   * Manutenção automática dos períodos aquisitivos da empresa: idempotente,
   * roda em segundo plano ao abrir a rotina — o gestor não precisa clicar nada.
   */
  const manterPeriodos = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) return 0;
      const { data, error } = await supabase.rpc("dp_ferias_manter_periodos", {
        _company_id: selectedCompanyId,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: (criados) => {
      if (criados > 0) invalidate();
    },
  });

  const manutencaoFeita = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedCompanyId) return;
    if (manutencaoFeita.current === selectedCompanyId) return;
    manutencaoFeita.current = selectedCompanyId;
    manterPeriodos.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  /** Faltas injustificadas computáveis para férias, informadas pelo gestor. */
  const informarFaltas = useMutation({
    mutationFn: async ({ periodoId, faltas, motivo }: FaltasInput) => {
      const { error } = await supabase.rpc("dp_ferias_informar_faltas", {
        _periodo_id: periodoId,
        _faltas: faltas,
        _motivo: motivo?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Faltas registradas e direito recalculado");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  /**
   * Programação de férias pelo gestor: toda a validação (saldo, bloqueios,
   * simultâneos, conflitos e antecedência do aviso) acontece no servidor.
   */
  const programar = useMutation({
    mutationFn: async (input: GozoInput & { justificativa?: string | null }) => {
      if (!input.periodo_id) throw new Error("Selecione o período aquisitivo");
      if (!input.data_inicio || !input.data_fim) throw new Error("Informe as datas de início e fim");
      const { error } = await supabase.rpc("dp_ferias_programar", {
        _periodo_id: input.periodo_id,
        _data_inicio: input.data_inicio,
        _data_fim: input.data_fim,
        _dias_abono: input.dias_abono,
        _adiantar_13: input.adiantar_13,
        _observacao: input.observacao?.trim() || null,
        _justificativa: input.justificativa?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Férias programadas");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  const saveGozo = useMutation({
    mutationFn: async (input: GozoInput) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!input.id) throw new Error("Registro inválido");
      if (!input.data_inicio || !input.data_fim) throw new Error("Informe as datas de início e fim");
      if (input.data_fim < input.data_inicio) throw new Error("A data final não pode ser anterior à inicial");

      const { error } = await supabase
        .from("dp_ferias_gozos")
        .update({
          data_inicio: input.data_inicio,
          data_fim: input.data_fim,
          dias_abono: input.dias_abono,
          adiantar_13: input.adiantar_13,
          aviso_em: input.aviso_em || null,
          observacao: input.observacao?.trim() || null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Férias atualizadas");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  /** Cancelamento com motivo: o registro é preservado como histórico. */
  const cancelarGozo = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("dp_ferias_cancelar", { _gozo_id: id, _motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Férias canceladas");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  /** Atualiza automaticamente "em férias" / "concluída" e gera os avisos do período. */
  const materializarStatus = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) return 0;
      const { data, error } = await supabase.rpc("dp_ferias_materializar_status", {
        _company_id: selectedCompanyId,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: (alterados) => {
      if (alterados > 0) invalidate();
    },
  });

  const statusFeito = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedCompanyId) return;
    if (statusFeito.current === selectedCompanyId) return;
    statusFeito.current = selectedCompanyId;
    materializarStatus.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  /** Fluxo da contabilidade: aprovada → a informar → informada. */
  const marcarInformado = useMutation({
    mutationFn: async ({
      id,
      status,
    }: { id: string; status: "aprovada" | "a_informar" | "informada" }) => {
      const { error } = await supabase.rpc("dp_ferias_marcar_informado", {
        _gozo_id: id,
        _status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Situação da contabilidade atualizada");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  return {
    periodos: periodosQ.data ?? [],
    periodosLoading: periodosQ.isLoading,
    periodosError: periodosQ.isError,
    gozos: gozosQ.data ?? [],
    gozosLoading: gozosQ.isLoading,
    refetchAll: () => {
      periodosQ.refetch();
      gozosQ.refetch();
    },
    gerarPeriodos,
    manterPeriodos,
    informarFaltas,

    programar,
    saveGozo,
    cancelarGozo,
    marcarInformado,
  };
}


