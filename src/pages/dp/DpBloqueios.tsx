import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import {
  Plus, Trash2, Calendar, CalendarX, CalendarCheck, Filter, Building2, Check,
  Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------
// Tipagens locais
// ------------------------------------------------------------------
type Unidade = { id: string; nome: string };

type RegraJson = {
  aplicacao?: "anual" | "unica";
  ano_referencia?: number | null;
  meses?: number[];
  dias?: number[];
  ordinal?: number | null;
  dia_semana?: number | null;
  pos_pagamento_dia?: number | null;
};

type Regra = {
  id: string;
  company_id: string;
  nome: string;
  tipo: "fixa_anual" | "dinamica" | "pos_pagamento";
  mes: number | null;
  dia: number | null;
  regra_json: RegraJson | null;
  ativo: boolean;
  unidades?: Unidade[];
};

type DataBloq = {
  id: string;
  company_id: string;
  data: string;
  motivo: string;
  regra_id: string | null;
  unidade_id: string | null;
  liberada_por_solicitacao: string | null;
  unidade?: Unidade | null;
};

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);
const NOMES_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const NOMES_ORDINAIS = ["Primeiro", "Segundo", "Terceiro", "Quarto", "Quinto"];
const NOMES_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const getMonthName = (m: number) => NOMES_MESES[m - 1] ?? String(m);
const formatBR = (iso: string) => {
  const [y, mo, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`;
};
const parseYMD = (iso: string) => {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d);
};
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ------------------------------------------------------------------
// Geração de datas a partir das regras (próximos 12 meses)
// ------------------------------------------------------------------
function gerarDatasParaRegra(r: Regra, hoje: Date): string[] {
  const cfg = r.regra_json ?? {};
  const mesesConfig = cfg.meses && cfg.meses.length > 0 ? cfg.meses : r.mes ? [r.mes] : MESES;
  const diasConfig = cfg.dias && cfg.dias.length > 0 ? cfg.dias : r.dia ? [r.dia] : [];

  const start = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const out = new Set<string>();

  for (let i = 0; i < 13; i++) {
    const cursor = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const ano = cursor.getFullYear();
    const mes = cursor.getMonth() + 1;

    if (cfg.aplicacao === "unica" && cfg.ano_referencia && cfg.ano_referencia !== ano) continue;
    if (!mesesConfig.includes(mes)) continue;

    if (r.tipo === "fixa_anual") {
      const diasAlvo = diasConfig.length ? diasConfig : Array.from({ length: 31 }, (_, k) => k + 1);
      for (const dia of diasAlvo) {
        const d = new Date(ano, mes - 1, dia);
        if (d.getMonth() !== mes - 1) continue; // dia inválido no mês
        if (d < hoje) continue;
        out.add(toYMD(d));
      }
    } else if (r.tipo === "dinamica") {
      const ordinal = cfg.ordinal ?? 1;
      const diaSemana = cfg.dia_semana ?? 0;
      // encontrar o "n-ésimo" diaSemana do mês
      const first = new Date(ano, mes - 1, 1);
      const shift = (diaSemana - first.getDay() + 7) % 7;
      const diaAlvo = 1 + shift + (ordinal - 1) * 7;
      const d = new Date(ano, mes - 1, diaAlvo);
      if (d.getMonth() === mes - 1 && d >= hoje) out.add(toYMD(d));
    } else if (r.tipo === "pos_pagamento") {
      const diaBase = cfg.pos_pagamento_dia ?? 5;
      const cursor2 = new Date(ano, mes - 1, diaBase + 1);
      // primeiro sábado
      while (cursor2.getDay() !== 6) cursor2.setDate(cursor2.getDate() + 1);
      if (cursor2.getMonth() === mes - 1 && cursor2 >= hoje) out.add(toYMD(cursor2));
      // domingo seguinte
      const dom = new Date(cursor2);
      dom.setDate(dom.getDate() + 1);
      if (dom.getMonth() === mes - 1 && dom >= hoje) out.add(toYMD(dom));
    }
  }

  return Array.from(out);
}

// ------------------------------------------------------------------
// Página
// ------------------------------------------------------------------
export default function DpBloqueios() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  // Filtros
  const [anoFiltro, setAnoFiltro] = useState(new Date().getFullYear());
  const [mesFiltro, setMesFiltro] = useState<string>("all");
  const [aplicacaoFiltro, setAplicacaoFiltro] = useState<string>("all");
  const [unidadeFiltro, setUnidadeFiltro] = useState<string>("all");
  const [showPast, setShowPast] = useState(false);
  const [reprocessando, setReprocessando] = useState(false);

  // Dialogs
  const [regraOpen, setRegraOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [editRegraId, setEditRegraId] = useState<string | null>(null);
  const [editDataId, setEditDataId] = useState<string | null>(null);

  // Form: Regra
  const [regraForm, setRegraForm] = useState<{
    nome: string;
    tipo: "fixa_anual" | "dinamica" | "pos_pagamento";
    aplicacao: "anual" | "unica";
    ano_referencia: number | null;
    meses: number[];
    dias: number[];
    ordinal: number | null;
    dia_semana: number | null;
    pos_pagamento_dia: number | null;
    ativo: boolean;
    unidades: string[];
  }>({
    nome: "", tipo: "fixa_anual", aplicacao: "anual", ano_referencia: null,
    meses: [], dias: [], ordinal: null, dia_semana: null, pos_pagamento_dia: 5,
    ativo: true, unidades: [],
  });

  // Form: Data manual
  const [dataForm, setDataForm] = useState<{ data: string; motivo: string; unidade_id: string }>({
    data: "", motivo: "", unidade_id: "",
  });

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
        .select("*, unidade:dp_unidades(id, nome)")
        .eq("company_id", selectedCompanyId!)
        .order("data", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DataBloq[];
    },
  });

  // ---- Filtros ----
  const today = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t;
  }, []);

  const datasFiltradas = useMemo(() => {
    const rows = datasQ.data ?? [];
    return rows.filter((d) => {
      const dt = parseYMD(d.data);
      if (dt.getFullYear() !== anoFiltro) return false;
      if (mesFiltro !== "all" && dt.getMonth() + 1 !== Number(mesFiltro)) return false;
      if (!showPast && dt < today) return false;
      if (unidadeFiltro !== "all") {
        if (unidadeFiltro === "__global__") { if (d.unidade_id) return false; }
        else if (d.unidade_id !== unidadeFiltro) return false;
      }
      return true;
    });
  }, [datasQ.data, anoFiltro, mesFiltro, unidadeFiltro, showPast, today]);

  const regrasFiltradas = useMemo(() => {
    const rows = regrasQ.data ?? [];
    if (aplicacaoFiltro === "all") return rows;
    return rows.filter((r) => (r.regra_json?.aplicacao ?? "anual") === aplicacaoFiltro);
  }, [regrasQ.data, aplicacaoFiltro]);

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
      regenerar12();
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
      regenerar12();
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

  // ---- Regenerar próximos 12 meses (client-side) ----
  const regenerar12 = async () => {
    if (!selectedCompanyId || reprocessando) return;
    setReprocessando(true);
    try {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const limite = new Date(hoje.getFullYear(), hoje.getMonth() + 13, 0);

      // 1) apagar futuros auto (regra_id IS NOT NULL) no intervalo
      const { error: delErr } = await supabase
        .from("dp_datas_bloqueadas")
        .delete()
        .eq("company_id", selectedCompanyId)
        .not("regra_id", "is", null)
        .gte("data", toYMD(hoje))
        .lte("data", toYMD(limite));
      if (delErr) throw delErr;

      // 2) para cada regra ativa gerar datas
      const { data: regras, error: rErr } = await supabase
        .from("dp_bloqueio_regras")
        .select("*")
        .eq("company_id", selectedCompanyId)
        .eq("ativo", true);
      if (rErr) throw rErr;

      const { data: vinc } = await supabase.from("dp_bloqueio_regra_unidades").select("regra_id, unidade_id");
      const vincByRegra = new Map<string, string[]>();
      (vinc ?? []).forEach((v: any) => {
        const arr = vincByRegra.get(v.regra_id) ?? [];
        arr.push(v.unidade_id); vincByRegra.set(v.regra_id, arr);
      });

      const inserts: any[] = [];
      for (const r of (regras ?? []) as Regra[]) {
        const datas = gerarDatasParaRegra(r, hoje);
        const unidades = vincByRegra.get(r.id) ?? [];
        if (unidades.length === 0) {
          for (const d of datas) inserts.push({
            company_id: selectedCompanyId, data: d, motivo: r.nome,
            regra_id: r.id, unidade_id: null,
          });
        } else {
          for (const d of datas) for (const u of unidades) inserts.push({
            company_id: selectedCompanyId, data: d, motivo: r.nome,
            regra_id: r.id, unidade_id: u,
          });
        }
      }

      if (inserts.length > 0) {
        const { error } = await supabase.from("dp_datas_bloqueadas").insert(inserts);
        if (error) throw error;
      }
      toast.success(`${inserts.length} datas bloqueadas geradas`);
      await qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_admin"] });
    } catch (e: any) {
      toast.error("Erro ao gerar bloqueios", { description: e?.message });
    } finally {
      setReprocessando(false);
    }
  };

  // ---- Helpers UI ----
  const toggleArr = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const openNovaRegra = () => {
    setEditRegraId(null);
    setRegraForm({
      nome: "", tipo: "fixa_anual", aplicacao: "anual", ano_referencia: null,
      meses: [], dias: [], ordinal: null, dia_semana: null, pos_pagamento_dia: 5,
      ativo: true, unidades: [],
    });
    setRegraOpen(true);
  };

  const openEditRegra = async (r: Regra) => {
    setEditRegraId(r.id);
    const cfg = r.regra_json ?? {};
    setRegraForm({
      nome: r.nome,
      tipo: r.tipo,
      aplicacao: (cfg.aplicacao as any) ?? "anual",
      ano_referencia: cfg.ano_referencia ?? null,
      meses: cfg.meses && cfg.meses.length ? cfg.meses : (r.mes ? [r.mes] : []),
      dias: cfg.dias && cfg.dias.length ? cfg.dias : (r.dia ? [r.dia] : []),
      ordinal: cfg.ordinal ?? null,
      dia_semana: cfg.dia_semana ?? null,
      pos_pagamento_dia: cfg.pos_pagamento_dia ?? 5,
      ativo: r.ativo,
      unidades: (r.unidades ?? []).map((u) => u.id),
    });
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

  const getTipoLabel = (t: string) =>
    t === "fixa_anual" ? "Fixa (dia/mês fixo)"
    : t === "dinamica" ? "Dinâmica (ex: 2º sábado)"
    : t === "pos_pagamento" ? "Pós-Pagamento (1º sáb e dom após dia 5)"
    : t;

  // ------------------------------------------------------------------
  return (
    <DpPage>
      <Helmet><title>Datas Bloqueadas — DP 360°</title></Helmet>
      <DpPageHeader
        icon={CalendarX}
        title="Datas Bloqueadas"
        description="Configure regras automáticas e bloqueios manuais. As alterações geram automaticamente os próximos 12 meses."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={regenerar12} disabled={reprocessando} variant="outline">
              <Calendar className="size-4 mr-2" />
              {reprocessando ? "Regenerando…" : "Regenerar 12 meses"}
            </Button>
          </div>
        }
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
              {regrasFiltradas.map((r) => {
                const cfg = r.regra_json ?? {};
                return (
                  <div key={r.id} className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-muted/20">
                    <div className="flex items-center gap-4 flex-1 min-w-[300px]">
                      <div className={cn("size-10 rounded-xl flex items-center justify-center",
                        r.ativo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                        <CalendarCheck className="size-5" />
                      </div>
                      <div>
                        <div className="font-semibold">{r.nome}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-4 flex-wrap">
                          <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                            {getTipoLabel(r.tipo)}
                          </span>
                          {r.tipo === "fixa_anual" && (
                            <>
                              <span>Meses: {(cfg.meses ?? []).map(getMonthName).join(", ") || "Todos"}</span>
                              <span>Dias: {(cfg.dias ?? []).join(", ") || "Todos"}</span>
                            </>
                          )}
                          {r.tipo === "dinamica" && (
                            <>
                              <span>Mês: {cfg.meses?.[0] ? getMonthName(cfg.meses[0]) : "?"}</span>
                              <span>{NOMES_ORDINAIS[(cfg.ordinal ?? 1) - 1]} {NOMES_SEMANA[cfg.dia_semana ?? 0]}</span>
                            </>
                          )}
                          {r.tipo === "pos_pagamento" && (
                            <span>Mês: {cfg.meses?.[0] ? getMonthName(cfg.meses[0]) : "Todos"} — após dia {cfg.pos_pagamento_dia ?? 5}</span>
                          )}
                          {cfg.aplicacao === "unica" && cfg.ano_referencia && (
                            <span className="text-amber-600 font-medium">🔹 Única vez — {cfg.ano_referencia}</span>
                          )}
                          {(cfg.aplicacao ?? "anual") === "anual" && (
                            <span className="text-emerald-600 font-medium">🔄 Anual</span>
                          )}
                          {!r.ativo && <span className="text-destructive font-medium">Inativa</span>}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1 items-center">
                          {r.unidades && r.unidades.length > 0 ? (
                            <>
                              <Building2 className="size-3 text-muted-foreground" />
                              {r.unidades.map((u) => (
                                <Badge key={u.id} variant="outline" className="text-xs">{u.nome}</Badge>
                              ))}
                            </>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Global (todas as unidades)</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditRegra(r)}>
                        <Filter className="size-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10">
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir esta regra?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. A regra será removida permanentemente e as datas automáticas geradas por ela serão recalculadas.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => delRegra.mutate(r.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
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
              {datasFiltradas.map((d) => {
                const auto = !!d.regra_id;
                const liberada = !!d.liberada_por_solicitacao;
                return (
                  <div key={d.id} className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-muted/20">
                    <div className="flex items-center gap-4 flex-1 min-w-[300px]">
                      <div className={cn("size-10 rounded-xl flex items-center justify-center",
                        liberada ? "bg-emerald-500/15 text-emerald-600"
                        : auto ? "bg-amber-500/15 text-amber-600"
                        : "bg-rose-500/15 text-rose-600")}>
                        {liberada ? <CalendarCheck className="size-5" /> : <CalendarX className="size-5" />}
                      </div>
                      <div>
                        <div className="font-semibold">{formatBR(d.data)}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-4 flex-wrap">
                          <span>{d.motivo}</span>
                          {d.unidade ? <Badge variant="outline">{d.unidade.nome}</Badge> : <Badge variant="outline">Global</Badge>}
                          <Badge variant="outline" className={auto
                            ? "bg-amber-500/10 text-amber-700 border-amber-500/40"
                            : "bg-rose-500/10 text-rose-700 border-rose-500/40"}>
                            {auto ? "Automático" : "Manual"}
                          </Badge>
                          <Badge variant="outline" className={liberada
                            ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/40"
                            : "bg-rose-500/10 text-rose-700 border-rose-500/40"}>
                            {liberada ? "Liberada" : "Bloqueada"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!auto && (
                        <>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditData(d)}>
                            <Filter className="size-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10">
                                <Trash2 className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover este bloqueio?</AlertDialogTitle>
                                <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => delData.mutate(d.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Dialog: Regra */}
      <Dialog open={regraOpen} onOpenChange={(o) => { if (!o) { setRegraOpen(false); setEditRegraId(null); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editRegraId ? "Editar Regra" : "Nova Regra"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input value={regraForm.nome} onChange={(e) => setRegraForm({ ...regraForm, nome: e.target.value })}
                placeholder="Ex: Natal, Black Friday..." />
            </div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <select value={regraForm.tipo}
                onChange={(e) => {
                  const tipo = e.target.value as any;
                  setRegraForm((p) => ({
                    ...p, tipo,
                    dias: tipo === "fixa_anual" ? p.dias : [],
                    ordinal: tipo === "dinamica" ? p.ordinal : null,
                    dia_semana: tipo === "dinamica" ? p.dia_semana : null,
                  }));
                }}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="fixa_anual">Fixa (dia/mês fixo)</option>
                <option value="dinamica">Dinâmica (ex: 2º sábado)</option>
                <option value="pos_pagamento">Pós-Pagamento (1º sábado e domingo após o dia)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Aplicação *</Label>
              <select value={regraForm.aplicacao}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setRegraForm({ ...regraForm, aplicacao: val, ano_referencia: val === "unica" ? new Date().getFullYear() : null });
                }}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="anual">🔄 Anual (repetir todo ano)</option>
                <option value="unica">🔹 Única vez (aplicar apenas em um ano)</option>
              </select>
            </div>
            {regraForm.aplicacao === "unica" && (
              <div className="space-y-2">
                <Label>Ano de Referência *</Label>
                <Input type="number" min={2000} max={2100} placeholder="Ex: 2026"
                  value={regraForm.ano_referencia ?? ""}
                  onChange={(e) => setRegraForm({ ...regraForm, ano_referencia: parseInt(e.target.value) || null })} />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Meses *</Label>
                <Button variant="ghost" size="sm"
                  onClick={() => setRegraForm((p) => ({ ...p, meses: p.meses.length === MESES.length ? [] : [...MESES] }))}>
                  {regraForm.meses.length === MESES.length ? "Desmarcar todos" : "Marcar todos"}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3">
                {MESES.map((m) => (
                  <button key={m} type="button"
                    onClick={() => setRegraForm((p) => ({ ...p, meses: toggleArr(p.meses, m) }))}
                    className={cn("flex items-center gap-2 text-sm text-left px-1.5 py-0.5 rounded")}>
                    <span className={cn("size-5 rounded border-2 flex items-center justify-center",
                      regraForm.meses.includes(m) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30")}>
                      {regraForm.meses.includes(m) && <Check className="size-3" />}
                    </span>
                    {getMonthName(m)}
                  </button>
                ))}
              </div>
            </div>

            {regraForm.tipo === "fixa_anual" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Dias *</Label>
                  <Button variant="ghost" size="sm"
                    onClick={() => setRegraForm((p) => ({ ...p, dias: p.dias.length === DIAS.length ? [] : [...DIAS] }))}>
                    {regraForm.dias.length === DIAS.length ? "Desmarcar todos" : "Marcar todos"}
                  </Button>
                </div>
                <div className="grid grid-cols-7 gap-1 max-h-40 overflow-y-auto border border-border rounded-lg p-3">
                  {DIAS.map((d) => (
                    <button key={d} type="button"
                      onClick={() => setRegraForm((p) => ({ ...p, dias: toggleArr(p.dias, d) }))}
                      className={cn("size-7 rounded border-2 flex items-center justify-center text-xs",
                        regraForm.dias.includes(d) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30")}>
                      {regraForm.dias.includes(d) ? <Check className="size-3" /> : d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {regraForm.tipo === "dinamica" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Ordinal *</Label>
                  <select value={regraForm.ordinal ?? ""}
                    onChange={(e) => setRegraForm({ ...regraForm, ordinal: parseInt(e.target.value) })}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">Selecione</option>
                    {[1, 2, 3, 4, 5].map((o) => <option key={o} value={o}>{NOMES_ORDINAIS[o - 1]}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Dia da Semana *</Label>
                  <select value={regraForm.dia_semana ?? ""}
                    onChange={(e) => setRegraForm({ ...regraForm, dia_semana: parseInt(e.target.value) })}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">Selecione</option>
                    {NOMES_SEMANA.map((n, i) => <option key={i} value={i}>{n}</option>)}
                  </select>
                </div>
              </div>
            )}

            {regraForm.tipo === "pos_pagamento" && (
              <div className="space-y-2">
                <Label>Dia base do pagamento *</Label>
                <Input type="number" min={1} max={31} value={regraForm.pos_pagamento_dia ?? 5}
                  onChange={(e) => setRegraForm({ ...regraForm, pos_pagamento_dia: parseInt(e.target.value) || null })} />
                <p className="text-xs text-muted-foreground">Bloqueia o 1º sábado e domingo posteriores a esse dia.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-base font-semibold">Unidades (opcional)</Label>
              <p className="text-sm text-muted-foreground">
                Se nenhuma unidade for selecionada, a regra é aplicada a <strong>todas</strong>.
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3">
                {(unidadesQ.data ?? []).map((u) => (
                  <button key={u.id} type="button"
                    onClick={() => setRegraForm((p) => ({ ...p, unidades: toggleArr(p.unidades, u.id) }))}
                    className="flex items-center gap-2 text-sm text-left">
                    <span className={cn("size-5 rounded border-2 flex items-center justify-center",
                      regraForm.unidades.includes(u.id) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30")}>
                      {regraForm.unidades.includes(u.id) && <Check className="size-3" />}
                    </span>
                    {u.nome}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={regraForm.ativo}
                onChange={(e) => setRegraForm({ ...regraForm, ativo: e.target.checked })} />
              Regra ativa
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRegraOpen(false); setEditRegraId(null); }}>Cancelar</Button>
            <Button disabled={saveRegra.isPending} onClick={() => saveRegra.mutate()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Data manual */}
      <Dialog open={dataOpen} onOpenChange={(o) => { if (!o) { setDataOpen(false); setEditDataId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editDataId ? "Editar Bloqueio" : "Bloquear Data"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" value={dataForm.data}
                onChange={(e) => setDataForm({ ...dataForm, data: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Input value={dataForm.motivo}
                onChange={(e) => setDataForm({ ...dataForm, motivo: e.target.value })}
                placeholder="Ex: Evento interno" />
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <select value={dataForm.unidade_id}
                onChange={(e) => setDataForm({ ...dataForm, unidade_id: e.target.value })}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Global (todas)</option>
                {(unidadesQ.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDataOpen(false); setEditDataId(null); }}>Cancelar</Button>
            <Button disabled={saveData.isPending} onClick={() => saveData.mutate()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}
