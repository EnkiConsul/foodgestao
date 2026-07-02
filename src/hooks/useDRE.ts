import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { DREGenerated, DRERegime } from "@/lib/dre";

/**
 * Assina alterações em mapeamento e ajustes manuais da DRE e invalida
 * automaticamente o relatório (`dre-generate`) e as inconsistências
 * (`dre-consistency`) — dispensa clicar em "Gerar" novamente.
 */
export function useDRERealtime() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  useEffect(() => {
    if (!selectedCompanyId) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["dre-generate"] });
      qc.invalidateQueries({ queryKey: ["dre-consistency"] });
      qc.invalidateQueries({ queryKey: ["dre-mapeamento", selectedCompanyId] });
    };
    const channel = supabase
      .channel(`dre-rt-${selectedCompanyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dre_categoria_mapeamento", filter: `company_id=eq.${selectedCompanyId}` },
        invalidate
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dre_ajustes_manuais", filter: `company_id=eq.${selectedCompanyId}` },
        invalidate
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedCompanyId, qc]);
}


export function useDRERubricas() {
  return useQuery({
    queryKey: ["dre-rubricas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dre_rubricas").select("*").eq("visivel", true).order("ordem");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useDREMapeamento() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dre-mapeamento", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_categoria_mapeamento")
        .select("*")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: { categoria_id: string; rubrica_id: string; percentual_alocacao?: number; id?: string }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const payload = {
        company_id: selectedCompanyId,
        categoria_id: input.categoria_id,
        rubrica_id: input.rubrica_id,
        percentual_alocacao: input.percentual_alocacao ?? 100,
      };

      // Remove qualquer duplicata existente (mesma categoria + rubrica) que não seja o próprio registro em edição
      const delQ = supabase
        .from("dre_categoria_mapeamento")
        .delete()
        .eq("company_id", selectedCompanyId)
        .eq("categoria_id", input.categoria_id)
        .eq("rubrica_id", input.rubrica_id);
      if (input.id) delQ.neq("id", input.id);
      const { error: delErr } = await delQ;
      if (delErr) throw delErr;

      if (input.id) {
        const { error } = await supabase.from("dre_categoria_mapeamento").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dre_categoria_mapeamento").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dre-mapeamento", selectedCompanyId] });
      qc.invalidateQueries({ queryKey: ["dre-generate"] });
      qc.invalidateQueries({ queryKey: ["dre-consistency"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dre_categoria_mapeamento").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dre-mapeamento", selectedCompanyId] });
      qc.invalidateQueries({ queryKey: ["dre-generate"] });
      qc.invalidateQueries({ queryKey: ["dre-consistency"] });
    },
  });

  const applyDefault = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { data, error } = await supabase.rpc("dre_apply_default_mapping", { _company_id: selectedCompanyId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dre-mapeamento", selectedCompanyId] });
      qc.invalidateQueries({ queryKey: ["dre-generate"] });
      qc.invalidateQueries({ queryKey: ["dre-consistency"] });
    },
  });

  return { ...query, upsert, remove, applyDefault };
}

export function useDREGeneration(params: { from: string; to: string; regime: DRERegime }) {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dre-generate", selectedCompanyId, params.from, params.to, params.regime],
    enabled: !!selectedCompanyId && !!params.from && !!params.to,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dre_generate", {
        _company_id: selectedCompanyId!,
        _from: params.from,
        _to: params.to,
        _regime: params.regime,
      });
      if (error) throw error;
      return data as unknown as DREGenerated;
    },
  });
}


export function useDREConsistency(params: { from: string; to: string }) {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dre-consistency", selectedCompanyId, params.from, params.to],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dre_check_consistency", {
        _company_id: selectedCompanyId!,
        _from: params.from,
        _to: params.to,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDRESnapshots() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["dre-snapshots", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_snapshots")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("periodo_fim", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const publish = useMutation({
    mutationFn: async (p: { titulo: string; from: string; to: string; tipo_periodo: string; regime: DRERegime; observacoes?: string; publicar?: boolean }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { data, error } = await supabase.rpc("dre_publish_snapshot", {
        _company_id: selectedCompanyId,
        _from: p.from,
        _to: p.to,
        _titulo: p.titulo,
        _tipo_periodo: p.tipo_periodo,
        _regime: p.regime,
        _observacoes: p.observacoes ?? null,
        _publicar: p.publicar ?? true,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dre-snapshots", selectedCompanyId] }),
  });

  return { ...list, publish };
}

export function useDREAjustes(rubricaId?: string, from?: string, to?: string) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["dre-ajustes", selectedCompanyId, rubricaId, from, to],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase.from("dre_ajustes_manuais").select("*").eq("company_id", selectedCompanyId!);
      if (rubricaId) q = q.eq("rubrica_id", rubricaId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (p: {
      rubrica_id: string; periodo_inicio: string; periodo_fim: string;
      valor: number; descricao: string; tipo_ajuste: "adicionar" | "subtrair" | "substituir";
      justificativa?: string;
    }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { error } = await supabase.from("dre_ajustes_manuais").insert({ ...p, company_id: selectedCompanyId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dre-ajustes", selectedCompanyId] });
      qc.invalidateQueries({ queryKey: ["dre-generate"] });
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("dre_ajustes_manuais")
        .update({ aprovado_por: user.user?.id, aprovado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dre-ajustes", selectedCompanyId] });
      qc.invalidateQueries({ queryKey: ["dre-generate"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dre_ajustes_manuais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dre-ajustes", selectedCompanyId] }),
  });

  return { ...list, create, approve, remove };
}
