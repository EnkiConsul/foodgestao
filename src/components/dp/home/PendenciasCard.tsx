import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ArrowRight, Clock, Clock3, CalendarClock, AlarmClockOff, CalendarPlus, Settings, ChevronRight, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useDpPendencias, type Pendencia } from "@/hooks/useDpPendencias";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { useDpPendenciasDecisoes } from "@/hooks/useDpPendenciasDecisoes";
import { PendenciaAcoes } from "@/components/dp/pendencias/PendenciaAcoes";
import { format } from "date-fns";
import {
  agruparPorColaborador,
  agruparPorTipo,
  filtrarAbertas,
  urgenciaDe,
  type GrupoPendencias,
} from "@/lib/dp/pendencias";
import { toast } from "sonner";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { lerPendenciasSnapshot, salvarPendenciasSnapshot } from "@/lib/dp/pendencias-cache";

type StablePendenciasState = {
  companyId: string | null;
  data: Pendencia[];
  dataUpdatedAt: number;
  lastCalculatedAt: string | null;
  ready: boolean;
};

function instanteDaApuracao(valor: string | null): number {
  if (!valor) return 0;
  const instante = new Date(valor).getTime();
  return Number.isFinite(instante) ? instante : 0;
}

function podeConfirmarNovoQuadro(
  anterior: StablePendenciasState,
  companyId: string | null,
  lastCalculatedAt: string | null,
): boolean {
  if (!companyId || anterior.companyId !== companyId || !anterior.ready) return true;

  // Um retrato persistido só deve ser substituído quando o backend confirmar
  // uma apuração mais recente. O término da consulta, sozinho, pode representar
  // apenas uma resposta intermediária vazia durante a atualização diária.
  const anteriorEm = instanteDaApuracao(anterior.lastCalculatedAt);
  const novoEm = instanteDaApuracao(lastCalculatedAt);
  if (anteriorEm > 0) return novoEm > anteriorEm;
  return novoEm > 0;
}

/** Mantém o último quadro confirmado enquanto uma nova apuração está em andamento. */
export function useStablePendencias({
  companyId,
  data,
  dataUpdatedAt,
  lastCalculatedAt,
  isLoading,
  isFetching,
}: {
  companyId: string | null;
  data: Pendencia[] | undefined;
  dataUpdatedAt: number;
  lastCalculatedAt: string | null;
  isLoading: boolean;
  isFetching: boolean;
}) {
  const [confirmed, setConfirmed] = useState<StablePendenciasState>(() => {
    const snapshot = lerPendenciasSnapshot(companyId);
    if (snapshot) {
      return { companyId, ...snapshot, ready: true };
    }
    if (data !== undefined && !isLoading && !isFetching) {
      return { companyId, data, dataUpdatedAt, lastCalculatedAt, ready: true };
    }
    return {
      companyId,
      data: data ?? [],
      dataUpdatedAt,
      lastCalculatedAt,
      ready: data !== undefined && !isLoading,
    };
  });

  useEffect(() => {
    if (isLoading || isFetching || data === undefined) return;
    const snapshotDaEmpresa = lerPendenciasSnapshot(companyId);
    const baseAtual = confirmed.companyId === companyId
      ? confirmed
      : snapshotDaEmpresa
        ? { companyId, ...snapshotDaEmpresa, ready: true }
        : confirmed;

    if (snapshotDaEmpresa && !podeConfirmarNovoQuadro(baseAtual, companyId, lastCalculatedAt)) return;

    salvarPendenciasSnapshot(companyId, { data, dataUpdatedAt, lastCalculatedAt });
    setConfirmed((anterior) => {
      const base = anterior.companyId === companyId
        ? anterior
        : snapshotDaEmpresa
          ? { companyId, ...snapshotDaEmpresa, ready: true }
          : anterior;

      if (!podeConfirmarNovoQuadro(base, companyId, lastCalculatedAt)) {
        return base;
      }

      // Evita atualizações redundantes quando a fonte reemite o mesmo quadro.
      if (
        base.ready &&
        base.companyId === companyId &&
        base.dataUpdatedAt === dataUpdatedAt &&
        base.lastCalculatedAt === lastCalculatedAt &&
        base.data.length === data.length &&
        base.data.every((p, i) => p.id === data[i]?.id)
      ) {
        return base;
      }
      const proximo = { companyId, data, dataUpdatedAt, lastCalculatedAt, ready: true };
      return proximo;
    });
  }, [companyId, data, dataUpdatedAt, lastCalculatedAt, isLoading, isFetching, confirmed]);

  // Retrato local da empresa selecionada: usado enquanto a apuração atual não
  // terminou (inclusive no primeiro carregamento do dia e ao trocar de empresa).
  const snapshotDaEmpresa = useMemo(() => lerPendenciasSnapshot(companyId), [companyId]);

  if (confirmed.companyId !== companyId) {
    if (snapshotDaEmpresa) {
      return { ...snapshotDaEmpresa, ready: true };
    }
    if (data !== undefined && !isLoading && !isFetching) {
      return { data, dataUpdatedAt, lastCalculatedAt, ready: true };
    }
    return {
      data: data ?? [],
      dataUpdatedAt,
      lastCalculatedAt,
      ready: data !== undefined && !isLoading && !isFetching,
    };
  }

  return confirmed;
}

export function PendenciasCard() {
  const { selectedCompanyId } = useCompanyContext();
  const { data, isLoading, isFetching, dataUpdatedAt, lastCalculatedAt, refetch } = useDpPendencias();
  const stable = useStablePendencias({
    companyId: selectedCompanyId,
    data,
    dataUpdatedAt,
    lastCalculatedAt,
    isLoading,
    isFetching,
  });
  const { prefs } = useDpUserPrefs();
  const { ignoradas, adiadas } = useDpPendenciasDecisoes();
  const [grupoAbertoTipo, setGrupoAbertoTipo] = useState<string | null>(null);

  const abertas = useMemo(
    () =>
      filtrarAbertas(
        stable.data.filter((p) => !ignoradas.has(p.id)),
        { ...prefs.pendencias_adiadas, ...adiadas },
      ),
    [stable.data, prefs.pendencias_adiadas, ignoradas, adiadas],
  );

  const grupos = useMemo(() => agruparPorTipo(abertas), [abertas]);
  const grupoAberto = grupos.find((grupo) => grupo.tipo === grupoAbertoTipo) ?? null;

  const counters = useMemo(() => {
    let atrasado = 0, urgente = 0, hoje = 0, proximo = 0;
    for (const p of abertas) {
      const u = urgenciaDe(p);
      if (u === "atrasada") atrasado++;
      else if (u === "urgente") urgente++;
      else if (u === "hoje") hoje++;
      else proximo++;
    }
    return { atrasado, urgente, hoje, proximo };
  }, [abertas]);

  return (
    <div className="rounded-2xl border-2 border-[hsl(var(--dp-pending-border))] bg-[hsl(var(--dp-pending-bg))] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-5 w-5 text-primary shrink-0" />
        <h2 className="text-base sm:text-lg font-semibold min-w-0 truncate">
          Pendências
        </h2>
        <Badge className="ml-1 bg-primary text-primary-foreground rounded-full h-6 min-w-6 px-2 shrink-0">
          {abertas.length}
        </Badge>
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Atualizar pendências agora"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Configurar prazos das pendências"
          >
            <Link to="/dp/configuracoes/prazos-pendencias" aria-label="Configurar prazos das pendências">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            <Link to="/dp/cadastros/pendencias">
              Ver todas <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="sm:hidden h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="Ver todas as pendências"
          >
            <Link to="/dp/cadastros/pendencias">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        <UrgencyChip icon={AlarmClockOff} label="Atrasado" count={counters.atrasado} tone="destructive" />
        <UrgencyChip icon={Clock3} label="Hoje" count={counters.hoje} tone="warning" />
        <UrgencyChip icon={CalendarClock} label="Próximo" count={counters.proximo} tone="info" />
      </div>

      <p className="mb-3 text-[11px] text-muted-foreground">
        {stable.lastCalculatedAt || stable.dataUpdatedAt
          ? `Atualizado ${new Date(stable.lastCalculatedAt ?? stable.dataUpdatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
          : "Atualizando…"}
      </p>


      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {!stable.ready && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {stable.ready && abertas.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma pendência aberta no momento. 🎉</p>
        )}
        {grupos.map((g) => (
          <button
            key={g.tipo}
            type="button"
            onClick={() => setGrupoAbertoTipo(g.tipo)}
            className="w-full text-left flex items-start gap-3 rounded-xl bg-card border border-[hsl(var(--dp-border))] p-3 hover:shadow-sm transition-shadow"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              {(() => {
                const Icon = g.itens[0]?.icon ?? Bell;
                return <Icon className="h-4 w-4 text-primary" />;
              })()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold truncate">{g.tipo}</p>
                <Badge variant="secondary" className="rounded-full h-5 min-w-5 px-1.5 text-[11px] shrink-0">
                  {g.total}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                {g.atrasadas > 0 && <span className="text-destructive font-medium">{g.atrasadas} atrasada(s)</span>}
                {g.hoje > 0 && <span className="text-amber-700 font-medium">{g.hoje} vence(m) hoje</span>}
                {g.proximas > 0 && <span className="text-emerald-700">{g.proximas} próxima(s)</span>}
                {g.colaboradores.length > 0 && (
                  <span className="text-muted-foreground">
                    {g.colaboradores.length} colaborador(es)
                  </span>
                )}
                {g.unidades.length > 0 && (
                  <span className="text-muted-foreground">
                    {g.unidades.length} unidade(s)
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2.5" />
          </button>
        ))}
      </div>

      {/* Detalhe do grupo: itens individuais preservados, agrupados por colaborador quando houver */}
      <Dialog open={!!grupoAberto} onOpenChange={(v) => { if (!v) setGrupoAbertoTipo(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {grupoAberto && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {grupoAberto.tipo}
                  <Badge variant="secondary" className="rounded-full">{grupoAberto.total}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {agruparPorColaborador(grupoAberto.itens, { ordenarPorAtraso: true }).map((sub) => (
                  <div key={sub.colaborador ?? "geral"} className="space-y-2">
                    {sub.colaborador && (
                      <p className="text-xs font-semibold text-muted-foreground">
                        {sub.colaborador} · {sub.itens.length} pendência(s)
                      </p>
                    )}
                    {sub.itens.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-start gap-3 rounded-xl border border-[hsl(var(--dp-border))] bg-card p-3"
                      >
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <p.icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium break-words">{p.titulo}</p>
                            <UrgenciaBadge atrasoDias={p.atrasoDias} urgente={p.urgente} />
                          </div>
                          <p className="text-xs text-muted-foreground break-words">{p.subtitulo}</p>
                          {p.unidadeNome && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">Unidade: {p.unidadeNome}</p>
                          )}
                          {p.vencimento && (
                            <p className="text-[11px] text-muted-foreground">
                              Prazo: {format(new Date(`${p.vencimento}T12:00:00`), "dd/MM/yyyy")}
                            </p>
                          )}
                           <PendenciaAcoes
                             pendencia={p}
                             onNavigate={() => setGrupoAbertoTipo(null)}
                             onResolved={() => {
                               if (grupoAberto.itens.length === 1) setGrupoAbertoTipo(null);
                             }}
                           />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function UrgenciaBadge({
  atrasoDias,
  urgente,
}: {
  atrasoDias: number;
  urgente?: boolean | null;
}) {
  if (atrasoDias <= 0 && urgente) {
    return (
      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive text-[10px] shrink-0">
        <Clock className="h-3 w-3 mr-1" />
        Urgente — risco de dobra
      </Badge>
    );
  }
  if (atrasoDias > 0) {
    return (
      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive text-[10px] shrink-0">
        <Clock className="h-3 w-3 mr-1" />
        Atrasado {atrasoDias}d
      </Badge>
    );
  }
  if (atrasoDias === 0) {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900 text-[10px] shrink-0">
        <Clock className="h-3 w-3 mr-1" />
        Vence hoje
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] shrink-0">
      <Clock className="h-3 w-3 mr-1" />
      Vence em {Math.abs(atrasoDias)}d
    </Badge>
  );
}

function UrgencyChip({
  icon: Icon, label, count, tone,
}: { icon: any; label: string; count: number; tone: "destructive" | "warning" | "info" }) {
  const cls =
    tone === "destructive" ? "bg-destructive/10 text-destructive border-destructive/30"
    : tone === "warning" ? "bg-warning/10 text-warning border-warning/30"
    : "bg-blue-50 text-blue-900 border-blue-200";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}: {count}
    </div>
  );
}


const PRESETS = [1, 3, 7, 15, 30];

export function AdiarPopover({
  onAdiar,
  triggerVariant = "ghost",
  triggerSize = "sm",
}: {
  onAdiar: (dias: number) => void;
  triggerVariant?: "ghost" | "outline" | "default";
  triggerSize?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const applyCustom = () => {
    const n = Number(custom);
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Informe um número de dias válido");
      return;
    }
    onAdiar(Math.round(n));
    setCustom("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size={triggerSize}
          variant={triggerVariant}
          className={triggerSize === "sm" ? "h-9 sm:h-7 text-xs w-full sm:w-auto" : ""}
        >
          <CalendarPlus className={triggerSize === "sm" ? "h-3 w-3 mr-1" : "h-4 w-4 mr-1"} />
          Adiar
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Adiar pendência por</p>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((d) => (
            <Button
              key={d}
              variant="outline"
              size="sm"
              className="h-7 text-xs flex-1 min-w-0"
              onClick={() => { onAdiar(d); setOpen(false); }}
            >
              {d}d
            </Button>
          ))}
        </div>
        <div className="pt-1 border-t space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Personalizado</p>
          <div className="flex gap-1">
            <Input
              type="number"
              min={1}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); }}
              placeholder="dias"
              className="h-7 text-xs"
            />
            <Button size="sm" className="h-7 text-xs" onClick={applyCustom}>OK</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
