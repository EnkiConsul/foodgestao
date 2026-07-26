import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

  const saveGozo = useMutation({
    mutationFn: async (input: GozoInput) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!input.periodo_id) throw new Error("Selecione o período aquisitivo");
      if (!input.data_inicio || !input.data_fim) throw new Error("Informe as datas de início e fim");
      if (input.data_fim < input.data_inicio) throw new Error("A data final não pode ser anterior à inicial");

      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        company_id: selectedCompanyId,
        periodo_id: input.periodo_id,
        colaborador_id: input.colaborador_id,
        data_inicio: input.data_inicio,
        data_fim: input.data_fim,
        dias_abono: input.dias_abono,
        adiantar_13: input.adiantar_13,
        aviso_em: input.aviso_em || null,
        status: input.status,
        observacao: input.observacao?.trim() || null,
      };

      if (input.id) {
        const { error } = await supabase.from("dp_ferias_gozos").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("dp_ferias_gozos")
          .insert({ ...payload, criado_por: userRes.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? "Férias atualizadas" : "Férias agendadas");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar férias"),
  });

  const setGozoStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FeriasGozoStatus }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const patch: Record<string, unknown> = { status };
      if (status === "aprovado") {
        patch.aprovado_por = userRes.user?.id ?? null;
        patch.aprovado_em = new Date().toISOString();
      }
      const { error } = await supabase.from("dp_ferias_gozos").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Situação atualizada");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });

  const deleteGozo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_ferias_gozos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento removido");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  return {
    periodos: periodosQ.data ?? [],
    periodosLoading: periodosQ.isLoading,
    gozos: gozosQ.data ?? [],
    gozosLoading: gozosQ.isLoading,
    gerarPeriodos,
    saveGozo,
    setGozoStatus,
    deleteGozo,
  };
}
