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
import { ChevronLeft, ChevronRight, Loader2, CalendarDays, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Row = Database["public"]["Tables"]["dp_solicitacoes"]["Row"] & {
  dp_colaboradores: { nome: string } | null;
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

const TIPO_COLOR: Record<Tipo, string> = {
  folga: "bg-primary/15 text-primary border-primary/30",
  ferias: "bg-sky-500/15 text-sky-600 border-sky-500/30 dark:text-sky-300",
  atestado: "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-300",
  adiantamento: "bg-violet-500/15 text-violet-600 border-violet-500/30 dark:text-violet-300",
  outros: "bg-muted text-foreground border-border",
};

const STATUS_LABEL: Record<Status, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

export default function DpFolgas() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const [statusFilter, setStatusFilter] = useState<Status | "todas">("aprovada");
  const [tipoFilter, setTipoFilter] = useState<Tipo | "todos">("todos");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
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


  const rangeStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const rangeEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });

  const query = useQuery({
    queryKey: ["dp_folgas", selectedCompanyId, format(cursor, "yyyy-MM"), statusFilter, tipoFilter],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_solicitacoes")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .not("data_alvo", "is", null)
        .lte("data_alvo", format(rangeEnd, "yyyy-MM-dd"))
        .or(
          `data_fim.gte.${format(rangeStart, "yyyy-MM-dd")},and(data_fim.is.null,data_alvo.gte.${format(rangeStart, "yyyy-MM-dd")})`,
        );
      if (statusFilter !== "todas") q = q.eq("status", statusFilter);
      if (tipoFilter !== "todos") q = q.eq("tipo", tipoFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
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
    return map;
  }, [query.data, rangeStart, rangeEnd]);

  const selectedEvents = selectedDay
    ? eventsByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []
    : [];

  return (
    <div className="space-y-4">
      <Helmet>
        <title>Folgas — DP 360°</title>
      </Helmet>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Folgas & Ausências
          </h2>
          <p className="text-sm text-muted-foreground">
            Calendário mensal de folgas, férias, atestados e outras ausências.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "todas")}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="aprovada">Aprovadas</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="todas">Todos status</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as Tipo | "todos")}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos tipos</SelectItem>
              {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => (
                <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => openNew()}><Plus className="h-4 w-4 mr-2" /> Nova solicitação</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => setCursor(subMonths(cursor, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-lg font-semibold capitalize">
              {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
                Hoje
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {query.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden border">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div key={d} className="bg-muted/50 py-2 text-center text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const events = eventsByDay.get(key) ?? [];
                const inMonth = isSameMonth(day, cursor);
                const isToday = isSameDay(day, new Date());
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      "min-h-[92px] bg-background p-1.5 text-left flex flex-col gap-1 transition-colors hover:bg-muted/40",
                      !inMonth && "bg-muted/20 text-muted-foreground",
                      isSelected && "ring-2 ring-primary ring-inset",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full",
                          isToday && "bg-primary text-primary-foreground",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {events.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">{events.length}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {events.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id + key}
                          className={cn(
                            "truncate rounded px-1 py-0.5 text-[10px] border",
                            TIPO_COLOR[ev.tipo],
                            ev.status === "pendente" && "opacity-60",
                          )}
                          title={`${ev.dp_colaboradores?.nome ?? ""} — ${TIPO_LABEL[ev.tipo]}`}
                        >
                          {ev.dp_colaboradores?.nome ?? "—"}
                        </div>
                      ))}
                      {events.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">+{events.length - 3}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-4">
            {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => (
              <span key={t} className={cn("text-[10px] px-2 py-0.5 rounded border", TIPO_COLOR[t])}>
                {TIPO_LABEL[t]}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedDay && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">
                {format(selectedDay, "PPP", { locale: ptBR })}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
                Fechar
              </Button>
            </div>
            {selectedEvents.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma ausência registrada nesta data.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between border rounded-md p-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{ev.dp_colaboradores?.nome ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {TIPO_LABEL[ev.tipo]} · {ev.data_alvo}
                        {ev.data_fim ? ` → ${ev.data_fim}` : ""}
                        {ev.motivo ? ` · ${ev.motivo}` : ""}
                      </div>
                    </div>
                    <Badge className={cn("border", TIPO_COLOR[ev.tipo])} variant="outline">
                      {STATUS_LABEL[ev.status]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
