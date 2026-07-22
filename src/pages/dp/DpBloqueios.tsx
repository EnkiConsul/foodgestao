import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import {
  Plus, Calendar, CalendarX, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import {
  MESES, getMonthName, parseYMD, toYMD,
  emptyRegraForm, regraToFormState,
  type Regra, type DataBloq, type Unidade,
  type RegraFormState, type DataFormState, type RegraJson,
} from "@/lib/dp/bloqueios";
import { expandRegraNoIntervalo, type RegraRow, type RegraUnidadeLink } from "@/lib/dp/bloqueio-rules";
import { RegraDialog } from "@/components/dp/bloqueios/RegraDialog";
import { DataDialog } from "@/components/dp/bloqueios/DataDialog";
import { RegraRow as RegraRowUI } from "@/components/dp/bloqueios/RegraRow";
import { DataRow } from "@/components/dp/bloqueios/DataRow";

export default function DpBloqueios() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  // Filtros
  const [anoFiltro, setAnoFiltro] = useState(new Date().getFullYear());
  const [mesFiltro, setMesFiltro] = useState<string>("all");
  const [aplicacaoFiltro, setAplicacaoFiltro] = useState<string>("all");
  const [unidadeFiltro, setUnidadeFiltro] = useState<string>("all");
  const [showPast, setShowPast] = useState(false);
  // (regeneração manual removida — regras valem em runtime)

  // Dialogs
  const [regraOpen, setRegraOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [editRegraId, setEditRegraId] = useState<string | null>(null);
  const [editDataId, setEditDataId] = useState<string | null>(null);

  const [regraForm, setRegraForm] = useState<RegraFormState>(emptyRegraForm);
  const [dataForm, setDataForm] = useState<DataFormState>({ data: "", motivo: "", unidade_id: "" });

  // ---- Queries ----
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

  // ---- Filtros memo ----
  const today = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t;
  }, []);

  // ---- Merge: expansão em runtime das regras + linhas físicas (overrides/manuais) ----
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

    // Unidade alvo para expansão
    const unidadeAlvo: string | null =
      unidadeFiltro === "all" ? null
      : unidadeFiltro === "__global__" ? "__global__"
      : unidadeFiltro;

    // Vínculos regra→unidades (a partir de regrasQ que já enriquece com unidades)
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

    // Expande cada regra respeitando o filtro de unidade
    const autoMap = new Map<string, string>(); // iso -> motivo
    const regraByIso = new Map<string, string>(); // iso -> regra_id
    for (const r of regrasRow) {
      const linked = vinculos.filter((v) => v.regra_id === r.id).map((v) => v.unidade_id);
      // Filtro por unidade:
      // - "__global__": apenas regras SEM vínculos
      // - unidadeId específico: globais (sem vínculos) OU vinculadas àquela unidade
      // - "all" (null): todas
      if (unidadeAlvo === "__global__" && linked.length > 0) continue;
      if (unidadeAlvo && unidadeAlvo !== "__global__" && linked.length > 0 && !linked.includes(unidadeAlvo)) continue;
      const set = expandRegraNoIntervalo(r, from, to);
      for (const iso of set) {
        if (!autoMap.has(iso)) {
          autoMap.set(iso, r.nome);
          regraByIso.set(iso, r.id);
        }
      }
    }

    // 1) Overrides / manuais em `dp_datas_bloqueadas` no intervalo/unidade
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

    // 2) Monta linhas AUTO (a partir do runtime), aplicando override se existir
    const result: DataBloq[] = [];
    const consumedKeys = new Set<string>();
    for (const [iso, motivo] of autoMap.entries()) {
      const regraId = regraByIso.get(iso) ?? null;
      const key = `${iso}|`;
      const override = physicalByKey.get(key);
      if (override) {
        consumedKeys.add(key);
        const isLiberada = override.liberada === true || !!override.liberada_por_solicitacao;
        result.push({
          ...override,
          regra_id: regraId,
          motivo: isLiberada ? motivo : override.motivo,
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
        });
      }
    }

    // 3) Linhas físicas não cobertas por regra: manuais reais (ou legadas com regra_id null que ainda não foi coberta — respeitar)
    for (const [key, d] of physicalByKey.entries()) {
      if (consumedKeys.has(key)) continue;
      // Descartar linhas legadas cujo motivo bate com nome de regra E a data está coberta pela mesma regra (evita duplicidade)
      // Se a data está em autoMap, já foi tratada acima (override); caso contrário, é bloqueio manual real.
      if (autoMap.has(d.data)) continue;
      result.push(d);
    }

    // 4) Ordenação
    result.sort((a, b) => a.data.localeCompare(b.data));
    return result;
  }, [datasQ.data, regrasQ.data, anoFiltro, mesFiltro, unidadeFiltro, showPast, today, selectedCompanyId]);

  const regrasFiltradas = useMemo(() => {
    const rows = regrasQ.data ?? [];
    if (aplicacaoFiltro === "all") return rows;
    return rows.filter((r) => (r.regra_json?.aplicacao ?? "anual") === aplicacaoFiltro);
  }, [regrasQ.data, aplicacaoFiltro]);

  // Regras dinâmicas passaram a valer em runtime — nenhuma regeneração manual é necessária.


  // ---- Mutations ----
  const saveRegra = useMutation({
    mutationFn: async () => {
      if (!regraForm.nome.trim()) throw new Error("Descrição é obrigatória");
      if (regraForm.aplicacao === "unica" && !regraForm.ano_referencia) throw new Error("Informe o ano de referência.");
      if (regraForm.meses.length === 0) throw new Error("Selecione pelo menos um mês.");
      if (regraForm.tipo === "fixa_anual" && regraForm.dias.length === 0) throw new Error("Selecione pelo menos um dia.");
      if (regraForm.tipo === "dinamica" && (regraForm.ordinal == null || regraForm.dia_semana == null)) throw new Error("Preencha ordinal e dia da semana.");

      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        company_id: selectedCompanyId!,
        nome: regraForm.nome.trim(),
        tipo: regraForm.tipo,
        mes: regraForm.meses.length === 1 ? regraForm.meses[0] : null,
        dia: regraForm.tipo === "fixa_anual" && regraForm.dias.length === 1 ? regraForm.dias[0] : null,
        regra_json: {
          aplicacao: regraForm.aplicacao,
          ano_referencia: regraForm.aplicacao === "unica" ? regraForm.ano_referencia : null,
          meses: regraForm.meses,
          dias: regraForm.tipo === "fixa_anual" ? regraForm.dias : [],
          ordinal: regraForm.tipo === "dinamica" ? regraForm.ordinal : null,
          dia_semana: regraForm.tipo === "dinamica" ? regraForm.dia_semana : null,
          pos_pagamento_dia: regraForm.tipo === "pos_pagamento" ? (regraForm.pos_pagamento_dia ?? 5) : null,
        } as RegraJson,
        ativo: regraForm.ativo,
        criado_por: userRes.user?.id ?? null,
      };

      let regraId = editRegraId;
      if (editRegraId) {
        const { error } = await supabase.from("dp_bloqueio_regras").update(payload).eq("id", editRegraId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("dp_bloqueio_regras").insert(payload).select("id").single();
        if (error) throw error;
        regraId = data!.id;
      }

      if (regraId) {
        await supabase.from("dp_bloqueio_regra_unidades").delete().eq("regra_id", regraId);
        if (regraForm.unidades.length > 0) {
          const inserts = regraForm.unidades.map((unidade_id) => ({ regra_id: regraId!, unidade_id }));
          const { error } = await supabase.from("dp_bloqueio_regra_unidades").insert(inserts);
          if (error) throw error;
        }
      }
    },
    onSuccess: async () => {
      toast.success(editRegraId ? "Regra atualizada" : "Regra criada");
      setRegraOpen(false); setEditRegraId(null);
      await qc.invalidateQueries({ queryKey: ["dp_bloqueio_regras"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
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
  });

  const saveData = useMutation({
    mutationFn: async () => {
      if (!dataForm.data) throw new Error("Selecione uma data");
      if (!dataForm.motivo.trim()) throw new Error("Informe o motivo");
      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        company_id: selectedCompanyId!,
        data: dataForm.data,
        motivo: dataForm.motivo.trim(),
        unidade_id: dataForm.unidade_id || null,
        regra_id: null,
        criado_por: userRes.user?.id ?? null,
      };
      if (editDataId) {
        const { error } = await supabase.from("dp_datas_bloqueadas").update(payload).eq("id", editDataId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_datas_bloqueadas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editDataId ? "Bloqueio atualizado" : "Data bloqueada");
      setDataOpen(false); setEditDataId(null);
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_admin"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
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
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const liberar = useMutation({
    mutationFn: async (d: DataBloq) => {
      const { data: userRes } = await supabase.auth.getUser();
      const unidadeIdParaUpsert = d.unidade_id ?? null;
      const { error } = await supabase
        .from("dp_datas_bloqueadas")
        .upsert(
          {
            company_id: selectedCompanyId!,
            data: d.data,
            unidade_id: unidadeIdParaUpsert,
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
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao liberar"),
  });

  // ---- Handlers de abertura ----
  const openNovaRegra = () => {
    setEditRegraId(null);
    setRegraForm(emptyRegraForm);
    setRegraOpen(true);
  };
  const openEditRegra = (r: Regra) => {
    setEditRegraId(r.id);
    setRegraForm(regraToFormState(r));
    setRegraOpen(true);
  };
  const openNovaData = () => {
    setEditDataId(null);
    setDataForm({ data: "", motivo: "", unidade_id: "" });
    setDataOpen(true);
  };
  const openEditData = (d: DataBloq) => {
    setEditDataId(d.id);
    setDataForm({ data: d.data, motivo: d.motivo, unidade_id: d.unidade_id ?? "" });
    setDataOpen(true);
  };

  return (
    <DpPage>
      <Helmet><title>Datas Bloqueadas — DP 360°</title></Helmet>
      <DpPageHeader
        icon={CalendarX}
        title="Datas Bloqueadas"
        description="Configure regras automáticas e bloqueios manuais. Regras ativas passam a valer imediatamente em todo o sistema."
      />

      {/* Filtros */}
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-4 items-end">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Ano</Label>
          <Input type="number" value={anoFiltro} onChange={(e) => setAnoFiltro(Number(e.target.value))} className="w-[120px]" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Mês</Label>
          <select value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)}
            className="bg-background border border-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary w-[180px]">
            <option value="all">Todos</option>
            {MESES.map((m) => <option key={m} value={m}>{getMonthName(m)}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Aplicação</Label>
          <select value={aplicacaoFiltro} onChange={(e) => setAplicacaoFiltro(e.target.value)}
            className="bg-background border border-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary w-[160px]">
            <option value="all">Todas</option>
            <option value="anual">🔄 Anual</option>
            <option value="unica">🔹 Única vez</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Unidade</Label>
          <select value={unidadeFiltro} onChange={(e) => setUnidadeFiltro(e.target.value)}
            className="bg-background border border-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary w-[180px]">
            <option value="all">Todas</option>
            <option value="__global__">Global</option>
            {(unidadesQ.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowPast(!showPast)} className="flex items-center gap-2">
          {showPast ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          {showPast ? "Ocultar passadas" : "Mostrar passadas"}
        </Button>
      </div>

      {/* Regras de Bloqueio */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="size-5 text-primary" /> Regras de Bloqueio
          </h2>
          <div className="flex gap-2">
            <Button className="rounded-full px-6" onClick={openNovaRegra}>
              <Plus className="size-4 mr-2" /> Nova Regra
            </Button>
            <Button variant="outline" className="rounded-full px-6" onClick={openNovaData}>
              <CalendarX className="size-4 mr-2" /> Bloquear Data
            </Button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {regrasQ.isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando…</div>
          ) : regrasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma regra configurada.</div>
          ) : (
            <div className="divide-y divide-border">
              {regrasFiltradas.map((r) => (
                <RegraRowUI
                  key={r.id}
                  regra={r}
                  onEdit={openEditRegra}
                  onDelete={(id) => delRegra.mutate(id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Próximas Datas Bloqueadas */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CalendarX className="size-5 text-rose-500" /> Próximas Datas Bloqueadas
          <span className="text-sm font-normal text-muted-foreground">({datasFiltradas.length} datas)</span>
        </h2>
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {datasQ.isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando…</div>
          ) : datasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma data bloqueada neste período.</div>
          ) : (
            <div className="divide-y divide-border">
              {datasFiltradas.map((d) => (
                <DataRow
                  key={d.id}
                  data={d}
                  onEdit={openEditData}
                  onDelete={(id) => delData.mutate(id)}
                  onRebloquear={(row) => rebloquear.mutate(row)}
                  onLiberar={(row) => liberar.mutate(row)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <RegraDialog
        open={regraOpen}
        isEditing={!!editRegraId}
        form={regraForm}
        unidades={unidadesQ.data ?? []}
        saving={saveRegra.isPending}
        onChange={(updater) => setRegraForm(updater)}
        onCancel={() => { setRegraOpen(false); setEditRegraId(null); }}
        onSubmit={() => saveRegra.mutate()}
      />

      <DataDialog
        open={dataOpen}
        isEditing={!!editDataId}
        form={dataForm}
        unidades={unidadesQ.data ?? []}
        saving={saveData.isPending}
        onChange={(updater) => setDataForm(updater)}
        onCancel={() => { setDataOpen(false); setEditDataId(null); }}
        onSubmit={() => saveData.mutate()}
      />
    </DpPage>
  );
}
