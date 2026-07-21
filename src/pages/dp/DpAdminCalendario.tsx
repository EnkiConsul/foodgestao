import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Building,
  CalendarDays,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Lock,
  Plus,
  Save,
  Settings2,
  ShieldAlert,
  Shuffle,
  Trash2,
  Unlock,
  User as UserIcon,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type OccupantType = "fixed" | "monthly" | "pending";
type Occupant = {
  key: string;
  userId: string;
  userName: string;
  type: OccupantType;
  origin: string;
  folgaId?: string;
  extra?: boolean;
};

const parseYMD = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toYMD = (d: Date) => format(d, "yyyy-MM-dd");
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const isoWeekKey = (d: Date) => `${getISOWeekYear(d)}-${getISOWeek(d)}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`;

export default function DpAdminCalendario() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const colabsQ = useDpColaboradores();

  const today = new Date();
  const [ano, setAno] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);

  // filtros
  const [filterUnidade, setFilterUnidade] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterType, setFilterType] = useState("all");

  // dialog do dia
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [assignUser, setAssignUser] = useState("");
  const [editLimit, setEditLimit] = useState<number>(1);

  const range = useMemo(() => {
    const start = startOfMonth(new Date(ano, mes - 1, 1));
    const end = endOfMonth(start);
    return { start: toYMD(start), end: toYMD(end), startDate: start, endDate: end };
  }, [ano, mes]);

  const enabled = !!selectedCompanyId;

  const queries = useQueries({
    queries: [
      {
        queryKey: ["dp_folgas_admin", selectedCompanyId, ano, mes],
        enabled,
        queryFn: async () => {
          const { data, error } = await supabase
            .from("dp_folgas")
            .select("id, data, colaborador_id, status, tipo, extra, origem, criado_por, dp_colaboradores(nome, unidade_id)")
            .eq("company_id", selectedCompanyId!)
            .gte("data", range.start)
            .lte("data", range.end);
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: ["dp_datas_bloqueadas", selectedCompanyId, ano, mes],
        enabled,
        queryFn: async () => {
          const { data, error } = await supabase
            .from("dp_datas_bloqueadas")
            .select("id, data, motivo, liberada_por_solicitacao, regra_id, created_at")
            .eq("company_id", selectedCompanyId!)
            .gte("data", range.start)
            .lte("data", range.end);
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: ["dp_dia_config", selectedCompanyId, ano, mes],
        enabled,
        queryFn: async () => {
          const { data, error } = await supabase
            .from("dp_dia_config")
            .select("data, limite_folgas")
            .eq("company_id", selectedCompanyId!)
            .is("unidade_id", null)
            .gte("data", range.start)
            .lte("data", range.end);
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: ["dp_unidades_list", selectedCompanyId],
        enabled,
        queryFn: async () => {
          const { data, error } = await supabase
            .from("dp_unidades")
            .select("id, nome")
            .eq("company_id", selectedCompanyId!)
            .order("nome");
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: ["dp_solicitacoes_pend", selectedCompanyId, ano, mes],
        enabled,
        queryFn: async () => {
          const { data, error } = await supabase
            .from("dp_solicitacoes")
            .select("id, colaborador_id, data_alvo, tipo, status, dp_colaboradores(nome, unidade_id)")
            .eq("company_id", selectedCompanyId!)
            .eq("status", "pendente")
            .eq("tipo", "folga")
            .gte("data_alvo", range.start)
            .lte("data_alvo", range.end);
          if (error) throw error;
          return data ?? [];
        },
      },
    ],
  });

  const [folgasQ, blockedQ, diaConfigQ, unidadesQ, pendentesQ] = queries;

  const folgas = (folgasQ.data ?? []) as any[];
  const bloqueios = (blockedQ.data ?? []) as any[];
  const unidades = (unidadesQ.data ?? []) as any[];
  const pendentes = (pendentesQ.data ?? []) as any[];
  const dayLimits = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of (diaConfigQ.data ?? []) as any[]) m.set(r.data, r.limite_folgas);
    return m;
  }, [diaConfigQ.data]);

  const blockedByDate = useMemo(() => {
    const m = new Map<string, { motivo: string; auto: boolean; id: string }>();
    for (const b of bloqueios) {
      if (b.liberada_por_solicitacao) continue;
      m.set(b.data, { motivo: b.motivo, auto: !!b.regra_id, id: b.id });
    }
    return m;
  }, [bloqueios]);

  const colaboradores = colabsQ.data ?? [];
  const filteredColabs = useMemo(() => {
    if (filterUnidade === "all") return colaboradores;
    return colaboradores.filter((c: any) => c.unidade_id === filterUnidade);
  }, [colaboradores, filterUnidade]);

  // realtime
  useEffect(() => {
    if (!selectedCompanyId) return;
    const ch = supabase
      .channel(`dp-admin-cal-${selectedCompanyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_folgas" }, () =>
        qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_dia_config" }, () =>
        qc.invalidateQueries({ queryKey: ["dp_dia_config"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_datas_bloqueadas" }, () =>
        qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_solicitacoes" }, () =>
        qc.invalidateQueries({ queryKey: ["dp_solicitacoes_pend"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selectedCompanyId, qc]);

  // ocupantes por dia com filtros aplicados
  const occupantsByDate = useMemo(() => {
    const m = new Map<string, Occupant[]>();
    const nameById = new Map(colaboradores.map((c: any) => [c.id, c.nome]));
    const validIds = new Set(filteredColabs.map((c: any) => c.id));
    const days = eachDayOfInterval({ start: range.startDate, end: range.endDate });

    // 1) folgas fixas semanais
    for (const d of days) {
      const iso = toYMD(d);
      const wd = d.getDay();
      for (const c of filteredColabs as any[]) {
        if (c.folga_fixa_semana == null || c.folga_fixa_semana !== wd) continue;
        if (filterUser !== "all" && c.id !== filterUser) continue;
        if (filterType !== "all" && filterType !== "fixed") continue;
        const arr = m.get(iso) ?? [];
        arr.push({
          key: `fixed:${c.id}:${iso}`,
          userId: c.id,
          userName: c.nome,
          type: "fixed",
          origin: "Folga Semanal",
        });
        m.set(iso, arr);
      }
    }

    // 2) folgas registradas
    for (const f of folgas) {
      if (!validIds.has(f.colaborador_id)) continue;
      if (filterUser !== "all" && f.colaborador_id !== filterUser) continue;
      if (filterType !== "all" && filterType !== "monthly") continue;
      const iso = f.data as string;
      const origin = f.extra
        ? "Extra (Admin)"
        : f.origem === "sorteio"
        ? "Sorteio Automático"
        : f.criado_por
        ? "Atribuição Manual"
        : "Sorteio Automático";
      const arr = m.get(iso) ?? [];
      arr.push({
        key: `folga:${f.id}`,
        folgaId: f.id,
        userId: f.colaborador_id,
        userName: f.dp_colaboradores?.nome ?? nameById.get(f.colaborador_id) ?? "—",
        type: "monthly",
        origin,
        extra: !!f.extra,
      });
      m.set(iso, arr);
    }

    // 3) solicitações pendentes de folga
    for (const p of pendentes) {
      if (!p.data_alvo) continue;
      if (!validIds.has(p.colaborador_id)) continue;
      if (filterUser !== "all" && p.colaborador_id !== filterUser) continue;
      if (filterType !== "all" && filterType !== "pending") continue;
      const iso = p.data_alvo as string;
      const arr = m.get(iso) ?? [];
      arr.push({
        key: `pend:${p.id}`,
        userId: p.colaborador_id,
        userName: p.dp_colaboradores?.nome ?? nameById.get(p.colaborador_id) ?? "—",
        type: "pending",
        origin: "Solicitação Pendente",
      });
      m.set(iso, arr);
    }

    return m;
  }, [colaboradores, filteredColabs, folgas, pendentes, filterUser, filterType, range.startDate, range.endDate]);

  // KPIs
  const stats = useMemo(() => {
    const days = eachDayOfInterval({ start: range.startDate, end: range.endDate });
    let totalFolgas = 0;
    let totalVagas = 0;
    let diasLotados = 0;
    for (const d of days) {
      const iso = toYMD(d);
      const occ = occupantsByDate.get(iso)?.length ?? 0;
      const limit = dayLimits.get(iso) ?? 1;
      totalFolgas += occ;
      totalVagas += limit;
      if (occ >= limit && occ > 0) diasLotados++;
    }
    return {
      totalFolgas,
      totalVagas,
      diasLotados,
      vagasRestantes: Math.max(0, totalVagas - totalFolgas),
    };
  }, [occupantsByDate, dayLimits, range.startDate, range.endDate]);

  // navegação de mês
  const goPrev = () => {
    const d = new Date(ano, mes - 2, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth() + 1);
  };
  const goNext = () => {
    const d = new Date(ano, mes, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth() + 1);
  };

  // ===== mutations =====
  const sortear = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("dp-sorteio-folgas", {
        body: { company_id: selectedCompanyId!, ano, mes, regenerar_prioridades: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Sorteio concluído: ${data?.inseridas ?? 0} folgas inseridas`);
      if (data?.ignoradas?.length) {
        toast.info(`${data.ignoradas.length} ignoradas (limites/bloqueios)`);
      }
      qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro no sorteio"),
  });

  const gerarBloqueios = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("dp_gerar_bloqueios_ano", {
        _company_id: selectedCompanyId!,
        _ano: ano,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (n) => {
      toast.success(`${n ?? 0} datas bloqueadas geradas para ${ano}`);
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const removerFolga = useMutation({
    mutationFn: async (folgaId: string) => {
      const { error } = await supabase.from("dp_folgas").delete().eq("id", folgaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folga removida");
      qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const salvarLimite = useMutation({
    mutationFn: async () => {
      if (!dayOpen) return;
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_dia_config")
        .upsert(
          {
            company_id: selectedCompanyId!,
            data: dayOpen,
            limite_folgas: editLimit,
            criado_por: userRes.user?.id ?? null,
          },
          { onConflict: "company_id,unidade_id,data" },
        )
        .select();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limite atualizado");
      qc.invalidateQueries({ queryKey: ["dp_dia_config"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const liberarData = useMutation({
    mutationFn: async () => {
      if (!dayOpen) return;
      const bloco = bloqueios.find((b) => b.data === dayOpen && !b.liberada_por_solicitacao);
      if (bloco) {
        const { error } = await supabase
          .from("dp_datas_bloqueadas")
          .delete()
          .eq("id", bloco.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Data liberada");
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao liberar"),
  });

  // ===== atribuir folga com detecção de conflito =====
  const [confirmDialog, setConfirmDialog] = useState<{
    iso: string;
    conflitos: { id: string; data: string; tipo: string | null }[];
  } | null>(null);

  const insertFolga = async (iso: string, opts: { extra: boolean; deleteIds?: string[] }) => {
    const { data: userRes } = await supabase.auth.getUser();
    if (opts.deleteIds && opts.deleteIds.length > 0) {
      const { error: delError } = await supabase
        .from("dp_folgas")
        .delete()
        .in("id", opts.deleteIds);
      if (delError) throw delError;
    }
    const { error } = await supabase.from("dp_folgas").insert({
      company_id: selectedCompanyId!,
      colaborador_id: assignUser,
      data: iso,
      tipo: "normal",
      origem: "admin_manual",
      status: "agendada",
      extra: opts.extra,
      criado_por: userRes.user?.id ?? null,
    });
    if (error) throw error;
  };

  const atribuirCommit = useMutation({
    mutationFn: async (input: { iso: string; modo: "force" | "extra" | "substituir"; conflitoIds?: string[] }) => {
      await insertFolga(input.iso, {
        extra: input.modo === "extra",
        deleteIds: input.modo === "substituir" ? input.conflitoIds : undefined,
      });
    },
    onSuccess: (_, input) => {
      toast.success(input.modo === "extra" ? "Folga extra atribuída" : "Folga atribuída");
      qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] });
      setConfirmDialog(null);
      setAssignUser("");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atribuir"),
  });

  const prepararAtribuicao = async () => {
    if (!dayOpen) return;
    if (!assignUser) {
      toast.error("Escolha um colaborador");
      return;
    }
    const d = parseYMD(dayOpen);
    const isWknd = isWeekend(d);
    const mesRef = monthKey(d);
    const wkRef = isoWeekKey(d);

    const { data: existing, error } = await supabase
      .from("dp_folgas")
      .select("id, data, tipo")
      .eq("company_id", selectedCompanyId!)
      .eq("colaborador_id", assignUser);
    if (error) {
      toast.error("Erro ao verificar conflitos");
      return;
    }
    const conflitos = (existing ?? []).filter((f: any) => {
      if (f.data === dayOpen) return true;
      const fd = parseYMD(f.data);
      if (isWknd && monthKey(fd) === mesRef) return true;
      if (!isWknd && isoWeekKey(fd) === wkRef) return true;
      return false;
    });
    if (conflitos.length === 0) {
      atribuirCommit.mutate({ iso: dayOpen, modo: "force" });
      return;
    }
    setConfirmDialog({ iso: dayOpen, conflitos });
  };

  // ===== helpers do dialog =====
  const openDay = (iso: string) => {
    setDayOpen(iso);
    setEditLimit(dayLimits.get(iso) ?? 1);
    setAssignUser("");
  };

  const currentDay = dayOpen ? parseYMD(dayOpen) : null;
  const currentIsWeekend = currentDay ? isWeekend(currentDay) : false;
  const currentBlock = dayOpen ? blockedByDate.get(dayOpen) ?? null : null;
  const dayOccupants = dayOpen ? occupantsByDate.get(dayOpen) ?? [] : [];

  // ===== render helpers =====
  const clearFilters = () => {
    setFilterUnidade("all");
    setFilterUser("all");
    setFilterType("all");
  };

  const renderMobile = () => {
    const days = eachDayOfInterval({ start: range.startDate, end: range.endDate });
    return (
      <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-bold capitalize">
              {format(range.startDate, "MMMM yyyy", { locale: ptBR })}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {days.filter(isWeekend).length} FDS
          </span>
        </div>
        <div className="max-h-[70vh] divide-y divide-border overflow-y-auto">
          {days.map((d) => {
            const iso = toYMD(d);
            const occ = occupantsByDate.get(iso) ?? [];
            const limit = dayLimits.get(iso) ?? 1;
            const block = blockedByDate.get(iso);
            return (
              <button
                key={iso}
                onClick={() => openDay(iso)}
                className="flex w-full items-start justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-sm font-bold", !isWeekend(d) && "text-muted-foreground")}>
                      {format(d, "dd/MM")}
                    </span>
                    {block && (
                      <Badge variant="outline" className="h-5 border-destructive/30 bg-destructive/10 px-1.5 py-0 text-[9px] text-destructive">
                        Bloqueado
                      </Badge>
                    )}
                    {occ.length > 0 && (
                      <Badge className="h-5 border-primary/20 bg-primary/10 px-1.5 py-0 text-[9px] text-primary">
                        {occ.length}/{limit}
                      </Badge>
                    )}
                  </div>
                  {occ.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {occ.map((o) => (
                        <span
                          key={o.key}
                          className={cn(
                            "max-w-[140px] truncate rounded px-1.5 py-0.5 text-[10px] font-medium",
                            o.type === "fixed" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                            o.type === "monthly" && "bg-primary/10 text-primary",
                            o.type === "pending" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                          )}
                          title={o.userName}
                        >
                          {o.userName.split(" ")[0]}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Ninguém escalado</span>
                  )}
                </div>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderGrid = () => {
    const days = eachDayOfInterval({ start: range.startDate, end: range.endDate });
    const firstWeekday = range.startDate.getDay();
    const leading = Array.from({ length: firstWeekday });
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="min-w-[10rem] text-center text-lg font-semibold capitalize">
              {format(range.startDate, "MMMM 'de' yyyy", { locale: ptBR })}
            </h2>
            <Button variant="outline" size="icon" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-7 bg-muted/50 text-xs font-medium">
            {DOW.map((d) => (
              <div key={d} className="border-b p-2 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {leading.map((_, i) => (
              <div key={`lead-${i}`} className="min-h-[7rem] border-b border-r bg-muted/20" />
            ))}
            {days.map((d) => {
              const iso = toYMD(d);
              const occ = occupantsByDate.get(iso) ?? [];
              const limit = dayLimits.get(iso);
              const block = blockedByDate.get(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => openDay(iso)}
                  className={cn(
                    "flex min-h-[7rem] flex-col gap-1 border-b border-r p-2 text-left transition-colors hover:bg-accent/40",
                    block && "bg-destructive/5",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{format(d, "d")}</span>
                    <div className="flex items-center gap-1">
                      {block && <Lock className="h-3 w-3 text-destructive" />}
                      {limit != null ? (
                        <Badge variant="outline" className="h-4 px-1 text-[10px]">
                          {occ.length}/{limit}
                        </Badge>
                      ) : occ.length > 0 ? (
                        <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                          {occ.length}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {block && (
                    <span className="truncate text-[10px] text-destructive">{block.motivo}</span>
                  )}
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {occ.slice(0, 4).map((o) => (
                      <span
                        key={o.key}
                        className={cn(
                          "truncate rounded px-1 text-[10px]",
                          o.type === "fixed" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                          o.type === "monthly" &&
                            (o.extra ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary"),
                          o.type === "pending" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                        )}
                        title={`${o.userName} · ${o.origin}`}
                      >
                        {o.userName}
                      </span>
                    ))}
                    {occ.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">+{occ.length - 4}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <DpPage>
      <Helmet>
        <title>Calendário de folgas — DP 360°</title>
      </Helmet>
      <DpPageHeader
        icon={CalendarDays}
        title="Calendário Geral"
        description="Gestão centralizada de escalas, folgas e limites da equipe."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => gerarBloqueios.mutate()}
              disabled={gerarBloqueios.isPending}
            >
              <ShieldAlert className="mr-1 h-4 w-4" /> Gerar bloqueios do ano
            </Button>
            <Button onClick={() => sortear.mutate()} disabled={sortear.isPending}>
              {sortear.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Shuffle className="mr-1 h-4 w-4" />
              )}
              Sortear folgas do mês
            </Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Folgas Marcadas", value: stats.totalFolgas, icon: CheckCircle, tone: "text-emerald-500" },
          { label: "Vagas Restantes", value: stats.vagasRestantes, icon: Users, tone: "text-blue-500" },
          { label: "Dias Lotados", value: stats.diasLotados, icon: AlertTriangle, tone: "text-rose-500" },
          { label: "Capacidade Total", value: stats.totalVagas, icon: CalendarDays, tone: "text-muted-foreground" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {k.label}
            </div>
            <div className="flex items-center gap-2 text-2xl font-black">
              <k.icon className={cn("h-5 w-5", k.tone)} /> {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-6 rounded-3xl border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground">
            <Building className="h-3.5 w-3.5" /> Unidade
          </Label>
          <Select
            value={filterUnidade}
            onValueChange={(v) => {
              setFilterUnidade(v);
              setFilterUser("all");
            }}
          >
            <SelectTrigger className="h-12 w-[240px] rounded-2xl font-semibold">
              <SelectValue placeholder="Todas as Unidades" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="all">Todas as Unidades</SelectItem>
              {unidades.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground">
            <UserIcon className="h-3.5 w-3.5" /> Colaborador
          </Label>
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="h-12 w-[240px] rounded-2xl font-semibold">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="all">Todos os colaboradores</SelectItem>
              {filteredColabs.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Tipo
          </Label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-12 w-[200px] rounded-2xl font-semibold">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="fixed">Semanal</SelectItem>
              <SelectItem value="monthly">Mensal (FDS)</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-12 px-6 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          onClick={clearFilters}
        >
          Limpar filtros
        </Button>
      </div>

      {/* Calendário */}
      <DpContentCard contentClassName="p-4 md:p-6">
        {isMobile ? renderMobile() : renderGrid()}
      </DpContentCard>

      {/* Dialog do dia */}
      <Dialog open={!!dayOpen} onOpenChange={(o) => !o && setDayOpen(null)}>
        <DialogContent className="max-w-lg rounded-3xl border-none p-7 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-3xl font-black tracking-tight">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CalendarDays className="h-6 w-6" />
              </div>
              {currentDay && format(currentDay, "dd/MM/yyyy")}
            </DialogTitle>
          </DialogHeader>

          {dayOpen && (
            <div className="space-y-6 py-2">
              {currentBlock && (
                <div className="space-y-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-destructive">
                      <Lock className="h-3.5 w-3.5" /> Data Bloqueada
                    </h3>
                    <Badge variant="outline" className="border-destructive/30 text-[9px] font-black uppercase text-destructive">
                      {currentBlock.auto ? "Automático" : "Manual"}
                    </Badge>
                  </div>
                  <div className="flex items-start gap-2 text-sm font-semibold text-destructive">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    {currentBlock.motivo}
                  </div>
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl border-destructive/30 font-bold text-destructive hover:bg-destructive/10"
                    onClick={() => liberarData.mutate()}
                    disabled={liberarData.isPending}
                  >
                    <Unlock className="mr-2 h-4 w-4" /> Liberar Data
                  </Button>
                </div>
              )}

              {currentIsWeekend && (
                <div className="space-y-3 rounded-2xl border bg-muted/30 p-5">
                  <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    <Settings2 className="h-3.5 w-3.5" /> Configuração do Dia
                  </h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label className="mb-1.5 block text-[10px] font-bold text-muted-foreground">
                        Limite de colaboradores
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        value={editLimit}
                        onChange={(e) => setEditLimit(Number(e.target.value))}
                        className="h-11 rounded-xl font-bold"
                      />
                    </div>
                    <Button
                      onClick={() => salvarLimite.mutate()}
                      disabled={salvarLimite.isPending}
                      className="mt-auto h-11 rounded-xl px-5"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {salvarLimite.isPending ? "..." : "Salvar"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">0 = sem limite (livre).</p>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Escala do dia
                </h3>
                <div className="space-y-2">
                  {dayOccupants.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed py-10 text-center text-sm text-muted-foreground">
                      Ninguém escalado para este dia.
                    </div>
                  ) : (
                    dayOccupants.map((o) => (
                      <div
                        key={o.key}
                        className="group flex items-center justify-between rounded-2xl border bg-card p-4 transition-all hover:shadow-md"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              "h-3 w-3 rounded-full",
                              o.type === "fixed" && "bg-blue-500",
                              o.type === "monthly" && (o.extra ? "bg-accent-foreground" : "bg-primary"),
                              o.type === "pending" && "bg-amber-500",
                            )}
                          />
                          <div>
                            <div className="font-bold">{o.userName}</div>
                            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              {o.origin}
                              {o.extra && " · Extra"}
                            </div>
                          </div>
                        </div>
                        {o.type === "monthly" && o.folgaId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-xl text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                            onClick={() => removerFolga.mutate(o.folgaId!)}
                            disabled={removerFolga.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3 border-t pt-5">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Atribuir folga manual
                </h3>
                <div className="flex gap-3">
                  <Select value={assignUser} onValueChange={setAssignUser}>
                    <SelectTrigger className="h-12 flex-1 rounded-2xl font-semibold">
                      <SelectValue placeholder="Escolher colaborador..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {filteredColabs.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="h-12 rounded-2xl px-6 text-xs font-black uppercase tracking-widest"
                    onClick={prepararAtribuicao}
                    disabled={atribuirCommit.isPending || !assignUser}
                  >
                    {atribuirCommit.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="mr-1 h-4 w-4" /> Atribuir
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-center">
            <Button
              variant="ghost"
              onClick={() => setDayOpen(null)}
              className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground"
            >
              Fechar detalhes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de conflito */}
      <AlertDialog open={!!confirmDialog} onOpenChange={(o) => !o && setConfirmDialog(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-6 w-6" /> Conflito de folga
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-base">
                Este colaborador já possui folga(s) que conflitam com a nova atribuição:
                <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                  {confirmDialog?.conflitos.map((f) => (
                    <li key={f.id}>
                      {format(parseYMD(f.data), "dd/MM/yyyy")} — {f.tipo ?? "normal"}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 font-semibold text-foreground">Como deseja proceder?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() =>
                confirmDialog &&
                atribuirCommit.mutate({
                  iso: confirmDialog.iso,
                  modo: "substituir",
                  conflitoIds: confirmDialog.conflitos.map((f) => f.id),
                })
              }
            >
              Substituir (remover antigas)
            </AlertDialogAction>
            <AlertDialogAction
              className="rounded-xl bg-amber-500 text-white hover:bg-amber-600"
              onClick={() =>
                confirmDialog && atribuirCommit.mutate({ iso: confirmDialog.iso, modo: "extra" })
              }
            >
              Manter como Extra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
