import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Palmtree, Plus, RefreshCw, Pencil, Trash2, AlertTriangle, CalendarClock, CheckCircle2,
} from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard, useDpEmbedded } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import {
  useDpFerias, type FeriasGozo, type FeriasPeriodo, type FeriasPeriodoStatus,
} from "@/hooks/useDpFerias";
import { FeriasGozoDialog } from "@/components/dp/ferias/FeriasGozoDialog";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { FeriasRestricoesAviso } from "@/components/dp/ferias/FeriasRestricoesAviso";

const PERIODO_LABEL: Record<FeriasPeriodoStatus, string> = {
  em_aquisicao: "Em aquisição",
  disponivel: "Disponível",
  parcial: "Parcial",
  concluido: "Concluído",
  vencido: "Vencido",
};

const PERIODO_TONE: Record<FeriasPeriodoStatus, string> = {
  em_aquisicao: "bg-muted text-muted-foreground",
  disponivel: "bg-emerald-500/15 text-emerald-600",
  parcial: "bg-amber-500/15 text-amber-600",
  concluido: "bg-primary/15 text-primary",
  vencido: "bg-destructive/15 text-destructive",
};

const GOZO_LABEL: Record<string, string> = {
  planejado: "Planejado",
  aprovado: "Aprovado",
  em_gozo: "Em gozo",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const fmt = (iso: string) => format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });

export default function DpFerias() {
  const embedded = useDpEmbedded();
  const { data: colaboradores = [] } = useDpColaboradores();
  const [colabFilter, setColabFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [gerarColab, setGerarColab] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeriasGozo | null>(null);
  const [defaultPeriodoId, setDefaultPeriodoId] = useState<string | null>(null);

  const {
    periodos, periodosLoading, periodosError, refetchAll,
    gozos, gerarPeriodos, saveGozo, deleteGozo,
  } = useDpFerias(colabFilter);

  const periodosFiltrados = useMemo(
    () => (statusFilter === "todos" ? periodos : periodos.filter((p) => p.status === statusFilter)),
    [periodos, statusFilter],
  );

  const gozosByPeriodo = useMemo(() => {
    const map = new Map<string, FeriasGozo[]>();
    for (const g of gozos) {
      const list = map.get(g.periodo_id) ?? [];
      list.push(g);
      map.set(g.periodo_id, list);
    }
    return map;
  }, [gozos]);

  const hoje = new Date();
  const kpis = useMemo(() => {
    const vencidos = periodos.filter((p) => p.status === "vencido").length;
    const vencendo = periodos.filter(
      (p) =>
        p.status !== "concluido" &&
        p.status !== "vencido" &&
        differenceInCalendarDays(parseISO(p.limite_concessivo), hoje) <= 90 &&
        differenceInCalendarDays(parseISO(p.limite_concessivo), hoje) >= 0,
    ).length;
    const disponiveis = periodos.filter((p) => p.dias_saldo > 0 && p.status !== "em_aquisicao").length;
    const emGozo = gozos.filter((g) => g.status === "em_gozo").length;
    return { vencidos, vencendo, disponiveis, emGozo };
  }, [periodos, gozos, hoje]);

  const abrirNovo = (periodoId?: string) => {
    setEditing(null);
    setDefaultPeriodoId(periodoId ?? null);
    setDialogOpen(true);
  };
  const abrirEdicao = (g: FeriasGozo) => {
    setEditing(g);
    setDefaultPeriodoId(g.periodo_id);
    setDialogOpen(true);
  };

  const alertaLimite = (p: FeriasPeriodo) => {
    const dias = differenceInCalendarDays(parseISO(p.limite_concessivo), hoje);
    if (p.status === "concluido") return null;
    if (dias < 0) return <Badge className="bg-destructive/15 text-destructive">Vencido</Badge>;
    if (dias <= 90) return <Badge className="bg-amber-500/15 text-amber-600">Vence em {dias}d</Badge>;
    return null;
  };

  return (
    <DpPage>
      {!embedded && <Helmet><title>Férias — Pessoas 360°</title></Helmet>}
      <DpPageHeader
        icon={Palmtree}
        title="Férias"
        description="Períodos aquisitivos, saldo por colaborador e agendamento formal de férias."
        actions={
          <Button className="rounded-full px-6" onClick={() => abrirNovo()}>
            <Plus className="mr-2 size-4" /> Agendar férias
          </Button>
        }
      />

      <FeriasRestricoesAviso />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Períodos com saldo", value: kpis.disponiveis, icon: CheckCircle2, tone: "text-emerald-600" },
          { label: "Vencendo em 90 dias", value: kpis.vencendo, icon: CalendarClock, tone: "text-amber-600" },
          { label: "Vencidos", value: kpis.vencidos, icon: AlertTriangle, tone: "text-destructive" },
          { label: "Em gozo", value: kpis.emGozo, icon: Palmtree, tone: "text-primary" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
            <k.icon className={`size-5 ${k.tone}`} />
            <p className="mt-2 text-2xl font-bold">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros + geração */}
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Colaborador</Label>
          <Select value={colabFilter} onValueChange={setColabFilter}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="todos">Todos</SelectItem>
              {colaboradores.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Situação</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {(Object.keys(PERIODO_LABEL) as FeriasPeriodoStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{PERIODO_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Gerar períodos aquisitivos</Label>
          <div className="flex gap-2">
            <Select value={gerarColab} onValueChange={setGerarColab}>
              <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Escolha o colaborador" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="shrink-0"
              disabled={!gerarColab || gerarPeriodos.isPending}
              onClick={() => gerarPeriodos.mutate(gerarColab)}
            >
              <RefreshCw className={`mr-2 size-4 ${gerarPeriodos.isPending ? "animate-spin" : ""}`} />
              Gerar
            </Button>
          </div>
        </div>
      </div>

      {/* Períodos */}
      <DpContentCard>
        {periodosError ? (
          <div className="p-4">
            <DpErrorState onRetry={refetchAll} />
          </div>
        ) : periodosLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando…</div>
        ) : periodosFiltrados.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum período aquisitivo. Selecione um colaborador acima e clique em “Gerar”.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {periodosFiltrados.map((p) => {
              const lista = gozosByPeriodo.get(p.id) ?? [];
              return (
                <div key={p.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.colaborador_nome ?? "Colaborador"}</p>
                      <p className="text-sm text-muted-foreground">
                        Aquisitivo {fmt(p.inicio_aquisitivo)} — {fmt(p.fim_aquisitivo)} · limite {fmt(p.limite_concessivo)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={PERIODO_TONE[p.status]}>{PERIODO_LABEL[p.status]}</Badge>
                      {alertaLimite(p)}
                      <Badge variant="outline">Saldo {p.dias_saldo}d</Badge>
                      <Badge variant="outline">Gozados {p.dias_gozados}d</Badge>
                      {p.dias_vendidos > 0 && <Badge variant="outline">Abono {p.dias_vendidos}d</Badge>}
                      <Button size="sm" variant="outline" onClick={() => abrirNovo(p.id)}>
                        <Plus className="mr-1 size-3.5" /> Agendar
                      </Button>
                    </div>
                  </div>

                  {lista.length > 0 && (
                    <div className="space-y-2 rounded-xl bg-muted/40 p-3">
                      {lista.map((g) => (
                        <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="min-w-0">
                            {fmt(g.data_inicio)} a {fmt(g.data_fim)} · {g.dias} dias
                            {g.dias_abono > 0 && ` + ${g.dias_abono} de abono`}
                            {g.adiantar_13 && " · 13º adiantado"}
                            {g.aviso_em && ` · aviso em ${fmt(g.aviso_em)}`}
                          </span>
                          <span className="flex items-center gap-2">
                            <Badge variant="outline">{GOZO_LABEL[g.status] ?? g.status}</Badge>
                            <Button size="icon" variant="ghost" aria-label="Editar agendamento de férias" onClick={() => abrirEdicao(g)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon" variant="ghost" aria-label="Remover agendamento de férias"
                              onClick={() => {
                                if (confirm("Remover este agendamento de férias?")) deleteGozo.mutate(g.id);
                              }}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DpContentCard>

      <FeriasGozoDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
        periodos={periodos}
        editing={editing}
        defaultPeriodoId={defaultPeriodoId}
        saving={saveGozo.isPending}
        onSubmit={(input) =>
          saveGozo.mutate(input, {
            onSuccess: () => { setDialogOpen(false); setEditing(null); },
          })
        }
      />
    </DpPage>
  );
}
