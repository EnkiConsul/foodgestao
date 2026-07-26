import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  parseYMD,
  type Regra, type DataBloq, type Unidade,
  type RegraFormState, type DataFormState, type RegraJson,
} from "@/lib/dp/bloqueios";
import { expandRegraNoIntervalo, type RegraRow, type RegraUnidadeLink } from "@/lib/dp/bloqueio-rules";

export type DpBloqueiosFilters = {
  anoFiltro: number;
  mesFiltro: string;
  aplicacaoFiltro: string;
  unidadeFiltro: string;
  showPast: boolean;
};

/**
 * Dados e mutations da tela de Datas Bloqueadas (DP).
 * Faz o merge entre a expansão em runtime das regras e as linhas físicas
 * (overrides/liberações/manuais) de `dp_datas_bloqueadas`.
 */
export function useDpBloqueios(filters: DpBloqueiosFilters) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const { anoFiltro, mesFiltro, aplicacaoFiltro, unidadeFiltro, showPast } = filters;

  const unidadesQ = useQuery({
    queryKey: ["dp_unidades_ativas", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_unidades")
        .select("id, nome").eq("company_id", selectedCompanyId!).eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as Unidade[];
    },
  });

  const regrasQ = useQuery({
    queryKey: ["dp_bloqueio_regras", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data: regrasData, error } = await supabase
        .from("dp_bloqueio_regras")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const { data: vinc } = await supabase
        .from("dp_bloqueio_regra_unidades")
        .select("regra_id, unidade_id");
      const { data: unis } = await supabase
        .from("dp_unidades").select("id, nome").eq("company_id", selectedCompanyId!);

      const uniById = new Map((unis ?? []).map((u: any) => [u.id, u as Unidade]));
      const vincByRegra = new Map<string, Unidade[]>();
      (vinc ?? []).forEach((v: any) => {
        const u = uniById.get(v.unidade_id);
        if (!u) return;
        const arr = vincByRegra.get(v.regra_id) ?? [];
        arr.push(u); vincByRegra.set(v.regra_id, arr);
      });

      return ((regrasData ?? []) as any[]).map((r) => ({
        ...r,
        unidades: vincByRegra.get(r.id) ?? [],
      })) as Regra[];
    },
  });

  const datasQ = useQuery({
    queryKey: ["dp_datas_bloqueadas_admin", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_datas_bloqueadas")
        .select("*, liberada, unidade:dp_unidades(id, nome)")
        .eq("company_id", selectedCompanyId!)
        .order("data", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DataBloq[];
    },
  });

  const today = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t;
  }, []);

  const datasFiltradas = useMemo<DataBloq[]>(() => {
    const physical = datasQ.data ?? [];
    const regras = regrasQ.data ?? [];

    // Intervalo do filtro (ano + mês)
    const mesNum = mesFiltro === "all" ? null : Number(mesFiltro);
    const fromRaw = mesNum
      ? new Date(anoFiltro, mesNum - 1, 1)
      : new Date(anoFiltro, 0, 1);
    const to = mesNum
      ? new Date(anoFiltro, mesNum, 0)
      : new Date(anoFiltro, 11, 31);
    const from = !showPast && fromRaw < today ? today : fromRaw;
    if (from > to) return [];

    const unidadeAlvo: string | null =
      unidadeFiltro === "all" ? null
      : unidadeFiltro === "__global__" ? "__global__"
      : unidadeFiltro;

    const vinculos: RegraUnidadeLink[] = [];
    for (const r of regras) {
      for (const u of r.unidades ?? []) {
        vinculos.push({ regra_id: r.id, unidade_id: u.id });
      }
    }
    const regrasRow: RegraRow[] = regras.map((r) => ({
      id: r.id, company_id: r.company_id, nome: r.nome, tipo: r.tipo,
      mes: r.mes, dia: r.dia, regra_json: (r.regra_json ?? null) as any, ativo: r.ativo,
    }));

    const unidadeNomeById = new Map<string, string>();
    for (const u of unidadesQ.data ?? []) unidadeNomeById.set(u.id, u.nome);

    const autoMap = new Map<string, string>(); // iso -> motivo
    const regraByIso = new Map<string, string>(); // iso -> regra_id
    const globalRuleByIso = new Map<string, boolean>();
    for (const r of regrasRow) {
      const linked = vinculos.filter((v) => v.regra_id === r.id).map((v) => v.unidade_id);
      if (unidadeAlvo === "__global__" && linked.length > 0) continue;
      if (unidadeAlvo && unidadeAlvo !== "__global__" && linked.length > 0 && !linked.includes(unidadeAlvo)) continue;
      const isGlobal = linked.length === 0;
      const set = expandRegraNoIntervalo(r, from, to);
      for (const iso of set) {
        if (!autoMap.has(iso)) {
          autoMap.set(iso, r.nome);
          regraByIso.set(iso, r.id);
        }
        if (isGlobal) globalRuleByIso.set(iso, true);
        else if (!globalRuleByIso.has(iso)) globalRuleByIso.set(iso, false);
      }
    }

    const physicalInScope = physical.filter((d) => {
      const dt = parseYMD(d.data);
      if (dt < from || dt > to) return false;
      if (unidadeFiltro === "__global__" && d.unidade_id) return false;
      if (unidadeFiltro !== "all" && unidadeFiltro !== "__global__" && d.unidade_id && d.unidade_id !== unidadeFiltro) return false;
      return true;
    });

    const physicalByKey = new Map<string, DataBloq>();
    for (const d of physicalInScope) {
      physicalByKey.set(`${d.data}|${d.unidade_id ?? ""}`, d);
    }

    const partialByIso = new Map<string, Array<{ id: string; unidade_id: string; unidade_nome: string }>>();
    if (unidadeFiltro === "all") {
      for (const d of physicalInScope) {
        if (!d.unidade_id) continue;
        const isLib = d.liberada === true || !!d.liberada_por_solicitacao;
        if (!isLib) continue;
        if (!autoMap.has(d.data)) continue;
        const nome = unidadeNomeById.get(d.unidade_id) ?? d.unidade?.nome ?? "Unidade";
        const arr = partialByIso.get(d.data) ?? [];
        arr.push({ id: d.id, unidade_id: d.unidade_id, unidade_nome: nome });
        partialByIso.set(d.data, arr);
      }
    }

    const getOverrideForAuto = (iso: string) => {
      if (unidadeFiltro !== "all" && unidadeFiltro !== "__global__") {
        return physicalByKey.get(`${iso}|${unidadeFiltro}`) ?? physicalByKey.get(`${iso}|`);
      }
      return physicalByKey.get(`${iso}|`);
    };

    const result: DataBloq[] = [];
    const consumedKeys = new Set<string>();
    for (const [iso, motivo] of autoMap.entries()) {
      const regraId = regraByIso.get(iso) ?? null;
      const override = getOverrideForAuto(iso);
      const partials = partialByIso.get(iso) ?? [];
      if (override) {
        consumedKeys.add(`${override.data}|${override.unidade_id ?? ""}`);
        const isLiberada = override.liberada === true || !!override.liberada_por_solicitacao;
        result.push({
          ...override,
          regra_id: regraId,
          motivo: isLiberada ? motivo : override.motivo,
          partialOverrides: partials.filter((p) => p.id !== override.id),
        });
      } else {
        result.push({
          id: `auto:${regraId ?? "x"}:${iso}`,
          company_id: selectedCompanyId ?? "",
          data: iso,
          motivo,
          regra_id: regraId,
          unidade_id: null,
          liberada: false,
          liberada_por_solicitacao: null,
          unidade: null,
          partialOverrides: partials,
        });
      }
      for (const p of partials) consumedKeys.add(`${iso}|${p.unidade_id}`);
    }

    for (const [key, d] of physicalByKey.entries()) {
      if (consumedKeys.has(key)) continue;
      const isLiberada = d.liberada === true || !!d.liberada_por_solicitacao;
      if (isLiberada && autoMap.has(d.data)) {
        const regraId = regraByIso.get(d.data) ?? null;
        result.push({
          ...d,
          regra_id: regraId,
          motivo: autoMap.get(d.data) ?? d.motivo,
        });
        continue;
      }
      if (autoMap.has(d.data)) continue;
      result.push(d);
    }

    result.sort((a, b) => a.data.localeCompare(b.data));
    return result;
  }, [datasQ.data, regrasQ.data, unidadesQ.data, anoFiltro, mesFiltro, unidadeFiltro, showPast, today, selectedCompanyId]);

  const regrasFiltradas = useMemo(() => {
    const rows = regrasQ.data ?? [];
    if (aplicacaoFiltro === "all") return rows;
    return rows.filter((r) => (r.regra_json?.aplicacao ?? "anual") === aplicacaoFiltro);
  }, [regrasQ.data, aplicacaoFiltro]);

  // ---- Mutations ----
  const saveRegra = useMutation({
    mutationFn: async ({ form, editId }: { form: RegraFormState; editId: string | null }) => {
      if (!form.nome.trim()) throw new Error("Descrição é obrigatória");
      if (form.aplicacao === "unica" && !form.ano_referencia) throw new Error("Informe o ano de referência.");
      if (form.meses.length === 0) throw new Error("Selecione pelo menos um mês.");
      if (form.tipo === "fixa_anual" && form.dias.length === 0) throw new Error("Selecione pelo menos um dia.");
      if (form.tipo === "dinamica" && (form.ordinal == null || form.dia_semana == null)) throw new Error("Preencha ordinal e dia da semana.");

      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        company_id: selectedCompanyId!,
        nome: form.nome.trim(),
        tipo: form.tipo,
        mes: form.meses.length === 1 ? form.meses[0] : null,
        dia: form.tipo === "fixa_anual" && form.dias.length === 1 ? form.dias[0] : null,
        regra_json: {
          aplicacao: form.aplicacao,
          ano_referencia: form.aplicacao === "unica" ? form.ano_referencia : null,
          meses: form.meses,
          dias: form.tipo === "fixa_anual" ? form.dias : [],
          ordinal: form.tipo === "dinamica" ? form.ordinal : null,
          dia_semana: form.tipo === "dinamica" ? form.dia_semana : null,
          pos_pagamento_dia: form.tipo === "pos_pagamento" ? (form.pos_pagamento_dia ?? 5) : null,
        } as RegraJson,
        ativo: form.ativo,
        criado_por: userRes.user?.id ?? null,
      };

      let regraId = editId;
      if (editId) {
        const { error } = await supabase.from("dp_bloqueio_regras").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("dp_bloqueio_regras").insert(payload).select("id").single();
        if (error) throw error;
        regraId = data!.id;
      }

      if (regraId) {
        await supabase.from("dp_bloqueio_regra_unidades").delete().eq("regra_id", regraId);
        if (form.unidades.length > 0) {
          const inserts = form.unidades.map((unidade_id) => ({ regra_id: regraId!, unidade_id }));
          const { error } = await supabase.from("dp_bloqueio_regra_unidades").insert(inserts);
          if (error) throw error;
        }
      }
    },
    onSuccess: async (_d, vars) => {
      toast.success(vars.editId ? "Regra atualizada" : "Regra criada");
      await qc.invalidateQueries({ queryKey: ["dp_bloqueio_regras"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const delRegra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_bloqueio_regras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Regra excluída");
      await qc.invalidateQueries({ queryKey: ["dp_bloqueio_regras"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const saveData = useMutation({
    mutationFn: async ({ form, editId }: { form: DataFormState; editId: string | null }) => {
      if (!form.data) throw new Error("Selecione uma data");
      if (!form.motivo.trim()) throw new Error("Informe o motivo");
      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        company_id: selectedCompanyId!,
        data: form.data,
        motivo: form.motivo.trim(),
        unidade_id: form.unidade_id || null,
        regra_id: null,
        criado_por: userRes.user?.id ?? null,
      };
      if (editId) {
        const { error } = await supabase.from("dp_datas_bloqueadas").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_datas_bloqueadas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.editId ? "Bloqueio atualizado" : "Data bloqueada");
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_admin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const delData = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_datas_bloqueadas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bloqueio removido");
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_admin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const rebloquear = useMutation({
    mutationFn: async (d: DataBloq) => {
      if (d.regra_id) {
        const { error } = await supabase.from("dp_datas_bloqueadas").delete().eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("dp_datas_bloqueadas")
          .update({ liberada: false, liberada_por_solicitacao: null })
          .eq("id", d.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Data bloqueada novamente");
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_admin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const liberar = useMutation({
    mutationFn: async (d: DataBloq) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_datas_bloqueadas")
        .upsert(
          {
            company_id: selectedCompanyId!,
            data: d.data,
            unidade_id: d.unidade_id ?? null,
            liberada: true,
            motivo: "Liberado manualmente pelo administrador",
            criado_por: userRes.user?.id ?? null,
          },
          { onConflict: "company_id,unidade_id,data" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Data liberada");
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_admin"] });
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas"] });
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_geral"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao liberar"),
  });

  return {
    unidades: unidadesQ.data ?? [],
    regrasLoading: regrasQ.isLoading,
    datasLoading: datasQ.isLoading,
    regrasFiltradas,
    datasFiltradas,
    saveRegra,
    delRegra,
    saveData,
    delData,
    rebloquear,
    liberar,
  };
}
