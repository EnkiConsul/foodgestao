import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Palmtree, Plus, Pencil, ClipboardList, AlertTriangle } from "lucide-react";
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
import { useDpFeriasConfig } from "@/hooks/useDpFeriasConfig";
import { FeriasFaltasDialog } from "@/components/dp/ferias/FeriasFaltasDialog";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { FeriasRestricoesAviso } from "@/components/dp/ferias/FeriasRestricoesAviso";
import { NIVEL_VENCIMENTO_META, nivelVencimento } from "@/lib/dp/ferias-direito";

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
  planejado: "Aguardando aprovação",
  aprovado: "Programada",
  em_gozo: "Em férias",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

const fmt = (iso: string) => format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });

/** Planejamento: períodos aquisitivos, faltas informadas e agendamento das férias. */
export default function DpFerias() {
  const embedded = useDpEmbedded();
  const [params, setParams] = useSearchParams();
  const { data: colaboradores = [] } = useDpColaboradores();
  const [colabFilter, setColabFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeriasGozo | null>(null);
  const [defaultPeriodoId, setDefaultPeriodoId] = useState<string | null>(null);
  const [faltasPeriodo, setFaltasPeriodo] = useState<FeriasPeriodo | null>(null);

  const {
    periodos, periodosLoading, periodosError, refetchAll,
    gozos, programar, saveGozo, informarFaltas,
  } = useDpFerias(colabFilter);
  const { config: feriasConfig } = useDpFeriasConfig();

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

  const fracoesPorPeriodo = useMemo(() => {
    const map: Record<string, { id: string; dias: number }[]> = {};
    for (const g of gozos) {
      if (g.status === "cancelado") continue;
      (map[g.periodo_id] ??= []).push({ id: g.id, dias: g.dias ?? 0 });
    }
    return map;
  }, [gozos]);

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

  /** Atalho do painel: "Programar" abre direto o agendamento daquele período. */
  const periodoParam = params.get("periodo");
  useEffect(() => {
    if (!periodoParam || periodosLoading) return;
    if (!periodos.some((p) => p.id === periodoParam)) return;
    abrirNovo(periodoParam);
    const next = new URLSearchParams(params);
    next.delete("periodo");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoParam, periodosLoading, periodos]);

  const hoje = new Date();
  const alertaLimite = (p: FeriasPeriodo) => {
    if (p.status === "concluido") return null;
    const dias = differenceInCalendarDays(parseISO(p.limite_concessivo), hoje);
    const nivel = nivelVencimento(dias);
    if (nivel === "normal") return null;
    const meta = NIVEL_VENCIMENTO_META[nivel];
    return (
      <Badge className={meta.tone}>
        {nivel === "vencido" ? "Vencido" : `${meta.label} · ${dias}d`}
      </Badge>
    );
  };

  return (
    <DpPage>
      {!embedded && <Helmet><title>Férias — Pessoas 360°</title></Helmet>}
      {!embedded && (
        <DpPageHeader
          icon={Palmtree}
          title="Férias"
          description="Períodos aquisitivos, saldo por colaborador e agendamento formal de férias."
          actions={
            <Button className="rounded-full px-6" onClick={() => abrirNovo()}>
              <Plus className="mr-2 size-4" /> Programar férias
            </Button>
          }
        />
      )}

      <FeriasRestricoesAviso />

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
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
        </div>
        {embedded && (
          <Button className="rounded-full px-6" onClick={() => abrirNovo()}>
            <Plus className="mr-2 size-4" /> Programar férias
          </Button>
        )}
      </div>

      <DpContentCard>
        {periodosError ? (
          <div className="p-4">
            <DpErrorState onRetry={refetchAll} />
          </div>
        ) : periodosLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando…</div>
        ) : periodosFiltrados.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum período aquisitivo por aqui. Eles são criados e atualizados automaticamente
            conforme as admissões.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {periodosFiltrados.map((p) => {
              const lista = gozosByPeriodo.get(p.id) ?? [];
              const faltas = p.faltas_injustificadas;
              const encerrado = parseISO(p.fim_aquisitivo) <= hoje;
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
                      <Badge variant="outline">Direito {p.dias_direito}d</Badge>
                      <Badge variant="outline">Saldo {p.dias_saldo}d</Badge>
                      {p.dias_vendidos > 0 && <Badge variant="outline">Abono {p.dias_vendidos}d</Badge>}
                      <Button size="sm" variant="outline" onClick={() => abrirNovo(p.id)}>
                        <Plus className="mr-1 size-3.5" /> Programar
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {p.requer_revisao && (
                      <Badge className="bg-destructive/15 text-destructive">
                        <AlertTriangle className="mr-1 size-3.5" /> Exige revisão administrativa
                      </Badge>
                    )}
                    {faltas === null || faltas === undefined ? (
                      <Badge className="bg-amber-500/15 text-amber-600">Faltas não informadas</Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        Faltas informadas: <strong className="text-foreground">{faltas}</strong>
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant={faltas === null || faltas === undefined ? "default" : "ghost"}
                      onClick={() => setFaltasPeriodo(p)}
                    >
                      <ClipboardList className="mr-1 size-3.5" />
                      {faltas === null || faltas === undefined ? "Informar faltas" : "Alterar faltas"}
                    </Button>
                    {!encerrado && (
                      <span className="text-xs text-muted-foreground">
                        Período ainda em aquisição — as faltas podem ser informadas ao concluir.
                      </span>
                    )}
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
                            <Button
                              size="icon" variant="ghost"
                              aria-label="Editar férias programadas"
                              onClick={() => abrirEdicao(g)}
                            >
                              <Pencil className="size-4" />
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
        antecedenciaDias={feriasConfig.avisoAntecedenciaDias}
        fracionamento={{
          maxFracoes: feriasConfig.fracionamentoMax,
          minDias: feriasConfig.fracaoMinDias,
          maiorDias: feriasConfig.fracaoMaiorDias,
        }}
        fracoesPorPeriodo={fracoesPorPeriodo}
        saving={saveGozo.isPending || programar.isPending}
        onSubmit={(input) => {
          const fechar = { onSuccess: () => { setDialogOpen(false); setEditing(null); } };
          if (input.id) saveGozo.mutate(input, fechar);
          else programar.mutate(input, fechar);
        }}
      />

      <FeriasFaltasDialog
        periodo={faltasPeriodo}
        onOpenChange={(v) => { if (!v) setFaltasPeriodo(null); }}
        saving={informarFaltas.isPending}
        onSubmit={(faltas, motivo) =>
          faltasPeriodo &&
          informarFaltas.mutate(
            { periodoId: faltasPeriodo.id, faltas, motivo },
            { onSuccess: () => setFaltasPeriodo(null) },
          )
        }
      />
    </DpPage>
  );
}
