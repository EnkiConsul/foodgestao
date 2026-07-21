import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  CheckCircle2,
  Users,
  AlertTriangle,
  Calendar as CalendarIcon,
  Building2,
  User as UserIcon,
  Filter,
} from "lucide-react";
import { CalendarSkeleton } from "@/components/dp/DpSkeletons";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpCalendarDayDialog, type DpDayScheduleEntry } from "@/components/dp/DpCalendarDayDialog";
import { DpStatusBadge, statusToneFor } from "@/components/dp/DpStatusBadge";
import { normalizeWeekday } from "@/lib/dp/folga-rules";
import type { Database } from "@/integrations/supabase/types";

type Row = Database["public"]["Tables"]["dp_solicitacoes"]["Row"] & {
  dp_colaboradores: { nome: string; unidade_id: string | null } | null;
};
type Tipo = Database["public"]["Enums"]["dp_solicitacao_tipo"];
type Status = Database["public"]["Enums"]["dp_solicitacao_status"];

const TIPO_LABEL: Record<Tipo, string> = {
  folga: "Folga",
  ferias: "Férias",
  atestado: "Atestado",
  adiantamento: "Adiantamento",
  outros: "Outros",
};

const STATUS_LABEL: Record<Status, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

const LEGEND = [
  { label: "Disponível", color: "bg-emerald-500" },
  { label: "Folga Semanal", color: "bg-blue-500" },
  { label: "Folga Mensal", color: "bg-amber-500" },
  { label: "Pendente", color: "bg-violet-500" },
  { label: "Bloqueado", color: "bg-red-500" },
];

const PREFS_KEY = (companyId: string | null) => `dp:folgas:filters:${companyId ?? "none"}`;
const WEEKLY_FOLGA_ID_PREFIX = "folga-semanal:";

type SavedPrefs = {
  unidade?: string;
  colaborador?: string;
  tipo?: Tipo | "todos";
};

function loadPrefs(companyId: string | null): SavedPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY(companyId));
    return raw ? (JSON.parse(raw) as SavedPrefs) : {};
  } catch {
    return {};
  }
}

export default function DpFolgas() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const initialPrefs = loadPrefs(selectedCompanyId);
  const [unidadeFilter, setUnidadeFilter] = useState<string>(initialPrefs.unidade ?? "todas");
  const [colabFilter, setColabFilter] = useState<string>(initialPrefs.colaborador ?? "todos");
  const [tipoFilter, setTipoFilter] = useState<Tipo | "todos">(initialPrefs.tipo ?? "todos");

  // Reaplica preferências ao trocar de empresa
  useEffect(() => {
    const p = loadPrefs(selectedCompanyId);
    setUnidadeFilter(p.unidade ?? "todas");
    setColabFilter(p.colaborador ?? "todos");
    setTipoFilter(p.tipo ?? "todos");
     
  }, [selectedCompanyId]);

  // Persiste alterações
  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY(selectedCompanyId),
        JSON.stringify({ unidade: unidadeFilter, colaborador: colabFilter, tipo: tipoFilter }),
      );
    } catch {
      /* ignore */
    }
  }, [selectedCompanyId, unidadeFilter, colabFilter, tipoFilter]);

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [quickColabId, setQuickColabId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    colaborador_id: "",
    tipo: "folga" as Tipo,
    data_alvo: "",
    data_fim: "",
    motivo: "",
  });

  const openNew = (preset?: { data_alvo?: string; data_fim?: string; tipo?: Tipo }) => {
    setForm({
      colaborador_id: "",
      tipo: preset?.tipo ?? "folga",
      data_alvo: preset?.data_alvo ?? "",
      data_fim: preset?.data_fim ?? "",
      motivo: "",
    });
    setDialogOpen(true);
  };

  useEffect(() => {
    if (!dialogOpen) return;
    if (!form.data_fim || !form.data_alvo) return;
    if (form.data_fim < form.data_alvo) setForm((f) => ({ ...f, data_fim: f.data_alvo }));
  }, [dialogOpen, form.data_alvo, form.data_fim]);

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!form.colaborador_id) throw new Error("Selecione um colaborador");
      if (!form.data_alvo) throw new Error("Informe a data inicial");
      if (form.motivo.length > 500) throw new Error("Observações muito longas (máx. 500)");
      const { error } = await supabase.from("dp_solicitacoes").insert({
        company_id: selectedCompanyId,
        colaborador_id: form.colaborador_id,
        tipo: form.tipo,
        data_alvo: form.data_alvo,
        data_fim: form.data_fim || null,
        motivo: form.motivo.trim() || null,
        criado_por: user?.id,
        status: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação criada", { description: "Ficará como pendente até aprovação." });
      qc.invalidateQueries({ queryKey: ["dp_folgas"] });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      setDialogOpen(false);
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  const quickAssign = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!selectedDay) throw new Error("Selecione um dia");
      if (!quickColabId) throw new Error("Escolha um colaborador");
      const { error } = await supabase.from("dp_solicitacoes").insert({
        company_id: selectedCompanyId,
        colaborador_id: quickColabId,
        tipo: "folga",
        data_alvo: format(selectedDay, "yyyy-MM-dd"),
        data_fim: null,
        motivo: null,
        criado_por: user?.id,
        status: "aprovada",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folga atribuída");
      qc.invalidateQueries({ queryKey: ["dp_folgas"] });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      setQuickColabId("");
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });



  const rangeStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const rangeEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

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
    queryKey: ["dp_dia_config", selectedCompanyId, format(cursor, "yyyy-MM")],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_dia_config")
        .select("data, limite_folgas, unidade_id")
        .eq("company_id", selectedCompanyId!)
        .gte("data", format(rangeStart, "yyyy-MM-dd"))
        .lte("data", format(rangeEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data ?? [];
    },
  });

  const query = useQuery({
    queryKey: ["dp_folgas", selectedCompanyId, format(cursor, "yyyy-MM"), unidadeFilter, colabFilter, tipoFilter],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_solicitacoes")
        .select("*, dp_colaboradores(nome, unidade_id)")
        .eq("company_id", selectedCompanyId!)
        .not("data_alvo", "is", null)
        .lte("data_alvo", format(rangeEnd, "yyyy-MM-dd"))
        .or(
          `data_fim.gte.${format(rangeStart, "yyyy-MM-dd")},and(data_fim.is.null,data_alvo.gte.${format(rangeStart, "yyyy-MM-dd")})`,
        );
      if (tipoFilter !== "todos") q = q.eq("tipo", tipoFilter);
      if (colabFilter !== "todos") q = q.eq("colaborador_id", colabFilter);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as Row[];
      if (unidadeFilter !== "todas") {
        rows = rows.filter((r) => r.dp_colaboradores?.unidade_id === unidadeFilter);
      }
      return rows;
    },
  });

  // Folgas efetivadas em dp_folgas (sorteio, admin manual, trocas)
  const folgasQuery = useQuery({
    queryKey: ["dp_folgas_efetivadas", selectedCompanyId, format(cursor, "yyyy-MM"), unidadeFilter, colabFilter, tipoFilter],
    enabled: !!selectedCompanyId && (tipoFilter === "todos" || tipoFilter === "folga"),
    queryFn: async () => {
      let q = supabase
        .from("dp_folgas")
        .select("id, colaborador_id, data, tipo, status, observacao, dp_colaboradores!inner(nome, unidade_id)")
        .eq("company_id", selectedCompanyId!)
        .neq("status", "cancelada")
        .gte("data", format(rangeStart, "yyyy-MM-dd"))
        .lte("data", format(rangeEnd, "yyyy-MM-dd"));
      if (colabFilter !== "todos") q = q.eq("colaborador_id", colabFilter);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as Array<{
        id: string;
        colaborador_id: string;
        data: string;
        tipo: string;
        status: string;
        observacao: string | null;
        dp_colaboradores: { nome: string; unidade_id: string | null } | null;
      }>;
      if (unidadeFilter !== "todas") {
        rows = rows.filter((r) => r.dp_colaboradores?.unidade_id === unidadeFilter);
      }
      return rows;
    },
  });

  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of query.data ?? []) {
      if (!r.data_alvo) continue;
      const start = parseISO(r.data_alvo);
      const end = r.data_fim ? parseISO(r.data_fim) : start;
      for (const d of eachDayOfInterval({ start, end })) {
        if (!isWithinInterval(d, { start: rangeStart, end: rangeEnd })) continue;
        const key = format(d, "yyyy-MM-dd");
        const list = map.get(key) ?? [];
        list.push(r);
        map.set(key, list);
      }
    }
    // Merge dp_folgas efetivadas como eventos sintéticos aprovados
    for (const f of folgasQuery.data ?? []) {
      const key = f.data;
      const list = map.get(key) ?? [];
      const dup = list.some(
        (e) =>
          e.colaborador_id === f.colaborador_id &&
          e.tipo === "folga" &&
          e.status === "aprovada",
      );
      if (dup) continue;
      list.push({
        id: `folga:${f.id}`,
        colaborador_id: f.colaborador_id,
        tipo: "folga" as Tipo,
        status: "aprovada" as Status,
        data_alvo: f.data,
        data_fim: null,
        motivo: f.observacao,
        dp_colaboradores: f.dp_colaboradores,
      } as unknown as Row);
      map.set(key, list);
    }

    if (tipoFilter === "todos" || tipoFilter === "folga") {
      const eligibleColabs = (colabs.data ?? [])
        .filter((c) => c.ativo !== false)
        .filter((c) => (unidadeFilter === "todas" ? true : c.unidade_id === unidadeFilter))
        .filter((c) => (colabFilter === "todos" ? true : c.id === colabFilter));

      for (const day of days) {
        const key = format(day, "yyyy-MM-dd");
        const weekday = day.getDay();
        const list = map.get(key) ?? [];

        for (const c of eligibleColabs) {
          const fixedWeekday = normalizeWeekday(c.folga_fixa_semana);
          if (fixedWeekday == null || fixedWeekday !== weekday) continue;

          const alreadyHasApprovedFolga = list.some(
            (e) => e.colaborador_id === c.id && e.tipo === "folga" && e.status === "aprovada",
          );
          if (alreadyHasApprovedFolga) continue;

          list.push({
            id: `${WEEKLY_FOLGA_ID_PREFIX}${c.id}:${key}`,
            colaborador_id: c.id,
            tipo: "folga" as Tipo,
            status: "aprovada" as Status,
            data_alvo: key,
            data_fim: null,
            motivo: "Folga semanal fixa",
            dp_colaboradores: {
              nome: c.nome,
              unidade_id: c.unidade_id,
            },
          } as unknown as Row);
        }

        if (list.length > 0) map.set(key, list);
      }
    }
    return map;
  }, [query.data, folgasQuery.data, tipoFilter, colabs.data, unidadeFilter, colabFilter, days, rangeStart, rangeEnd]);

  const capacityByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of diaConfigQuery.data ?? []) {
      const cur = map.get(c.data) ?? 0;
      map.set(c.data, cur + (c.limite_folgas ?? 0));
    }
    return map;
  }, [diaConfigQuery.data]);

  const defaultDailyCap = 1;

  // Stats do mês corrente (dias dentro do mês)
  const stats = useMemo(() => {
    let marcadas = 0;
    let capacidade = 0;
    let lotados = 0;
    for (const d of eachDayOfInterval({ start: monthStart, end: monthEnd })) {
      const key = format(d, "yyyy-MM-dd");
      const evs = eventsByDay.get(key) ?? [];
      const aprov = evs.filter((e) => e.status === "aprovada" && e.tipo === "folga").length;
      const cap = capacityByDay.get(key) ?? defaultDailyCap;
      marcadas += aprov;
      capacidade += cap;
      if (aprov >= cap && cap > 0) lotados += 1;
    }
    return {
      marcadas,
      capacidade,
      lotados,
      restantes: Math.max(0, capacidade - marcadas),
    };
  }, [eventsByDay, capacityByDay, monthStart, monthEnd]);

  const selectedEvents = selectedDay
    ? eventsByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []
    : [];

  const clearFilters = () => {
    setUnidadeFilter("todas");
    setColabFilter("todos");
    setTipoFilter("todos");
  };
  const hasFilters =
    unidadeFilter !== "todas" || colabFilter !== "todos" || tipoFilter !== "todos";

  const statCards = [
    { label: "FOLGAS MARCADAS", value: stats.marcadas, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "VAGAS RESTANTES", value: stats.restantes, icon: Users, tone: "text-blue-600" },
    { label: "DIAS LOTADOS", value: stats.lotados, icon: AlertTriangle, tone: "text-red-600" },
    { label: "CAPACIDADE TOTAL", value: stats.capacidade, icon: CalendarIcon, tone: "text-primary" },
  ];

  return (
    <DpPage>
      <Helmet>
        <title>Calendário Geral — DP 360°</title>
      </Helmet>

      <DpPageHeader
        icon={CalendarDays}
        title="Calendário Geral"
        description="Gestão centralizada de escalas e folgas da equipe."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => openNew()} className="gap-2">
              <Plus className="h-4 w-4" /> Nova solicitação
            </Button>
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[hsl(var(--dp-border))] bg-card p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {s.label}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <s.icon className={cn("h-5 w-5", s.tone)} />
              <span className="text-3xl font-bold text-foreground">{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <DpFilterCard>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Unidade
            </label>
            <Select value={unidadeFilter} onValueChange={setUnidadeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as Unidades</SelectItem>
                {(unidadesQuery.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" /> Colaborador
            </label>
            <Select value={colabFilter} onValueChange={setColabFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os colaboradores</SelectItem>
                {(colabs.data ?? []).filter((c) => c.ativo).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Tipo de Folga
            </label>
            <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as Tipo | "todos")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => (
                  <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button
              variant="ghost"
              onClick={clearFilters}
              disabled={!hasFilters}
              className="text-primary font-semibold uppercase text-xs tracking-wide"
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </DpFilterCard>

      {/* Calendar */}
      <DpContentCard contentClassName="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-3xl font-bold text-foreground">
            <span className="capitalize">{format(cursor, "MMMM", { locale: ptBR })}</span>{" "}
            <span className="text-muted-foreground/50 font-semibold">
              {format(cursor, "yyyy")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
              Hoje
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor(subMonths(cursor, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {query.isLoading ? (
          <CalendarSkeleton />
        ) : (
          <div className="grid grid-cols-7 gap-px bg-[hsl(var(--dp-border))] rounded-lg overflow-hidden border border-[hsl(var(--dp-border))]">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div
                key={d}
                className="bg-muted/40 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {d}
              </div>
            ))}
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const events = eventsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              const isToday = isSameDay(day, new Date());
              const cap = capacityByDay.get(key) ?? defaultDailyCap;
              const aprov = events.filter((e) => e.status === "aprovada" && e.tipo === "folga").length;
              const lotado = cap > 0 && aprov >= cap;
              const parcial = aprov > 0 && !lotado;

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    "min-h-[112px] bg-white p-2 text-left flex flex-col gap-1.5 transition-colors hover:bg-muted/30",
                    !inMonth && "bg-muted/10 text-muted-foreground",
                    lotado && inMonth && "bg-red-50/60",
                    parcial && inMonth && "bg-emerald-50/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        isToday && "text-primary",
                        lotado && inMonth && "text-red-700",
                        parcial && inMonth && "text-emerald-700",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {inMonth && (
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                          lotado
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700",
                        )}
                      >
                        {aprov}/{cap}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 overflow-hidden">
                    {events.slice(0, 3).map((ev) => {
                      const isWeekly = ev.id.startsWith(WEEKLY_FOLGA_ID_PREFIX);
                      return (
                      <div
                        key={ev.id + key}
                        className={cn(
                          "truncate rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-center",
                          ev.status === "pendente"
                            ? "bg-violet-100 text-violet-700"
                            : isWeekly
                              ? "bg-blue-100 text-blue-700"
                              : ev.tipo === "folga"
                                ? "bg-amber-100 text-amber-700"
                                : ev.tipo === "ferias"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-100 text-slate-700",
                        )}
                        title={`${ev.dp_colaboradores?.nome ?? ""} — ${isWeekly ? "Folga Semanal" : TIPO_LABEL[ev.tipo]}`}
                      >
                        {(ev.dp_colaboradores?.nome ?? "—").split(" ")[0]}
                      </div>
                      );
                    })}
                    {events.length > 3 && (
                      <div className="text-[10px] text-muted-foreground pl-1">
                        +{events.length - 3}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-5 mt-2 border-t border-[hsl(var(--dp-border))]">
          {LEGEND.map((l) => (
            <div key={l.label} className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", l.color)} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {l.label}
              </span>
            </div>
          ))}
        </div>
      </DpContentCard>

      <DpCalendarDayDialog
        day={selectedDay}
        onClose={() => {
          setSelectedDay(null);
          setQuickColabId("");
        }}
        schedule={selectedEvents.map<DpDayScheduleEntry>((ev) => ({
          id: ev.id,
          name: ev.dp_colaboradores?.nome ?? "—",
          meta: (
            <>
              {ev.id.startsWith(WEEKLY_FOLGA_ID_PREFIX) ? "Folga Semanal" : TIPO_LABEL[ev.tipo]}
              {ev.data_fim ? ` · até ${ev.data_fim}` : ""}
              {ev.motivo ? ` · ${ev.motivo}` : ""}
            </>
          ),
          status: (
            <DpStatusBadge tone={ev.id.startsWith(WEEKLY_FOLGA_ID_PREFIX) ? "info" : statusToneFor(ev.status)}>
              {ev.id.startsWith(WEEKLY_FOLGA_ID_PREFIX) ? "Semanal" : STATUS_LABEL[ev.status]}
            </DpStatusBadge>
          ),
        }))}
        assignOptions={(colabs.data ?? [])
          .filter((c) => c.ativo !== false)
          .filter((c) =>
            unidadeFilter === "todas" ? true : c.unidade_id === unidadeFilter,
          )
          .map((c) => ({ value: c.id, label: c.nome }))}
        assignValue={quickColabId}
        onAssignChange={setQuickColabId}
        onAssign={() => quickAssign.mutate()}
        assignPending={quickAssign.isPending}
        secondaryAction={
          selectedDay
            ? {
                label: "Solicitar ausência avançada (férias, atestado, período)",
                onClick: () =>
                  openNew({ data_alvo: format(selectedDay, "yyyy-MM-dd") }),
              }
            : undefined
        }
      />



      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova solicitação de ausência</DialogTitle>
            <DialogDescription>
              Selecione o colaborador, o tipo e o intervalo de datas. A solicitação ficará pendente até aprovação.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Colaborador *</Label>
              <Select
                value={form.colaborador_id}
                onValueChange={(v) => setForm({ ...form, colaborador_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {(colabs.data ?? []).filter((c) => c.ativo).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                  {(colabs.data ?? []).filter((c) => c.ativo).length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Nenhum colaborador ativo. Cadastre em Colaboradores.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => (
                    <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Data inicial *</Label>
                <Input
                  type="date"
                  value={form.data_alvo}
                  onChange={(e) => setForm({ ...form, data_alvo: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Data final</Label>
                <Input
                  type="date"
                  min={form.data_alvo || undefined}
                  value={form.data_fim}
                  onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                maxLength={500}
                placeholder="Motivo, contexto ou observação (opcional)"
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              />
              <div className="text-[10px] text-muted-foreground text-right">
                {form.motivo.length}/500
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={create.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Salvando..." : "Criar solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}
