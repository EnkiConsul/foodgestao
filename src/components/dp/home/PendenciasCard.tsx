import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ArrowRight, Clock, Clock3, CalendarClock, AlarmClockOff, CalendarPlus, Settings, ChevronRight } from "lucide-react";
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

export function PendenciasCard() {
  const { data = [], isLoading } = useDpPendencias();
  const { prefs } = useDpUserPrefs();
  const { ignoradas, adiadas } = useDpPendenciasDecisoes();
  const [grupoAberto, setGrupoAberto] = useState<GrupoPendencias<Pendencia> | null>(null);

  const abertas = useMemo(
    () =>
      filtrarAbertas(
        data.filter((p) => !ignoradas.has(p.id)),
        { ...prefs.pendencias_adiadas, ...adiadas },
      ),
    [data, prefs.pendencias_adiadas, ignoradas, adiadas],
  );

  const grupos = useMemo(() => agruparPorTipo(abertas), [abertas]);

  const counters = useMemo(() => {
    let atrasado = 0, hoje = 0, proximo = 0;
    for (const p of abertas) {
      const u = urgenciaDe(p);
      if (u === "atrasada") atrasado++;
      else if (u === "hoje") hoje++;
      else proximo++;
    }
    return { atrasado, hoje, proximo };
  }, [abertas]);

  return (
    <div className="rounded-2xl border-2 border-[hsl(var(--dp-pending-border))] bg-[hsl(var(--dp-pending-bg))] p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Bell className="h-5 w-5 text-primary shrink-0" />
        <h2 className="text-base sm:text-lg font-semibold min-w-0 break-words">Pendências do Sistema</h2>
        <Badge className="ml-1 bg-primary text-primary-foreground rounded-full h-6 min-w-6 px-2 shrink-0">
          {abertas.length}
        </Badge>
        <div className="ml-auto flex items-center gap-1 shrink-0">
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
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
            <Link to="/dp/cadastros/pendencias">
              Ver todas <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <UrgencyChip icon={AlarmClockOff} label="Atrasado" count={counters.atrasado} tone="destructive" />
        <UrgencyChip icon={Clock3} label="Hoje" count={counters.hoje} tone="warning" />
        <UrgencyChip icon={CalendarClock} label="Próximo" count={counters.proximo} tone="info" />
      </div>

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && abertas.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma pendência aberta no momento. 🎉</p>
        )}
        {grupos.map((g) => (
          <button
            key={g.tipo}
            type="button"
            onClick={() => setGrupoAberto(g)}
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
      <Dialog open={!!grupoAberto} onOpenChange={(v) => { if (!v) setGrupoAberto(null); }}>
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
                {agruparPorColaborador(grupoAberto.itens).map((sub) => (
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
                            <UrgenciaBadge atrasoDias={p.atrasoDias} />
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
                          <PendenciaAcoes pendencia={p} onNavigate={() => setGrupoAberto(null)} />
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

export function UrgenciaBadge({ atrasoDias }: { atrasoDias: number }) {
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
    : tone === "warning" ? "bg-amber-100 text-amber-900 border-amber-300"
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
