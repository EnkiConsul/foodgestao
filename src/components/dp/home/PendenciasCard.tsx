import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ArrowRight, Clock, Clock3, CalendarClock, AlarmClockOff, Info, CalendarPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useDpPendencias, type Pendencia } from "@/hooks/useDpPendencias";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { addDays, isAfter, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

function isPostponed(id: string, map: Record<string, string>) {
  const until = map[id];
  if (!until) return false;
  return isAfter(new Date(until), new Date());
}

export function PendenciasCard() {
  const { data = [], isLoading } = useDpPendencias();
  const { prefs, save } = useDpUserPrefs();
  const [detail, setDetail] = useState<Pendencia | null>(null);

  const visible = useMemo(
    () => data.filter((p) => !isPostponed(p.id, prefs.pendencias_adiadas)),
    [data, prefs.pendencias_adiadas],
  );

  const counters = useMemo(() => {
    let atrasado = 0, hoje = 0, proximo = 0;
    for (const p of visible) {
      if (p.atrasoDias > 0) atrasado++;
      else if (p.atrasoDias === 0) hoje++;
      else proximo++;
    }
    return { atrasado, hoje, proximo };
  }, [visible]);

  const adiar = (p: Pendencia, dias: number) => {
    const until = addDays(new Date(), dias).toISOString();
    save({ pendencias_adiadas: { ...prefs.pendencias_adiadas, [p.id]: until } });
    toast.success(`Adiada por ${dias} ${dias === 1 ? "dia" : "dias"}`);
  };

  return (
    <div className="rounded-2xl border-2 border-[hsl(var(--dp-pending-border))] bg-[hsl(var(--dp-pending-bg))] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Pendências do Sistema</h2>
        <Badge className="ml-1 bg-primary text-primary-foreground rounded-full h-6 min-w-6 px-2">
          {visible.length}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <UrgencyChip icon={AlarmClockOff} label="Atrasado" count={counters.atrasado} tone="destructive" />
        <UrgencyChip icon={Clock3} label="Hoje" count={counters.hoje} tone="warning" />
        <UrgencyChip icon={CalendarClock} label="Próximo" count={counters.proximo} tone="info" />
      </div>

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && visible.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem pendências. 🎉</p>
        )}
        {visible.map((p) => (
          <div
            key={p.id}
            className="flex items-start gap-3 rounded-xl bg-card border border-[hsl(var(--dp-border))] p-3 hover:shadow-sm transition-shadow"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <p.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium truncate">{p.titulo}</p>
                {p.atrasoDias > 0 ? (
                  <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive text-[10px] shrink-0">
                    <Clock className="h-3 w-3 mr-1" />
                    Atrasado {p.atrasoDias}d
                  </Badge>
                ) : p.atrasoDias === 0 ? (
                  <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900 text-[10px] shrink-0">
                    <Clock className="h-3 w-3 mr-1" />
                    Vence hoje
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] shrink-0">
                    <Clock className="h-3 w-3 mr-1" />
                    Vence em {Math.abs(p.atrasoDias)}d
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{p.subtitulo}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="default" className="h-7 text-xs">
                  <Link to={p.url}>
                    Resolver <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDetail(p)}>
                  <Info className="h-3 w-3 mr-1" /> Detalhes
                </Button>
                <AdiarPopover onAdiar={(dias) => adiar(p, dias)} />
              </div>
            </div>
          </div>
        ))}
      </div>


      <Dialog open={!!detail} onOpenChange={(v) => { if (!v) setDetail(null); }}>
        <DialogContent className="max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <detail.icon className="h-5 w-5 text-primary" />
                  {detail.titulo}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">{detail.subtitulo}</p>
                {detail.vencimento && (
                  <p>
                    <span className="font-medium">Vencimento: </span>
                    {format(new Date(detail.vencimento), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </p>
                )}
                {detail.atrasoDias > 0 ? (
                  <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                    <Clock className="h-3 w-3 mr-1" /> Atrasado há {detail.atrasoDias} dia(s)
                  </Badge>
                ) : detail.atrasoDias === 0 ? (
                  <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">
                    <Clock className="h-3 w-3 mr-1" /> Vence hoje
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                    <Clock className="h-3 w-3 mr-1" /> Vence em {Math.abs(detail.atrasoDias)} dia(s)
                  </Badge>
                )}
              </div>
              <DialogFooter className="gap-2">
                <AdiarPopover
                  onAdiar={(dias) => { if (detail) { adiar(detail, dias); setDetail(null); } }}
                  triggerVariant="ghost"
                  triggerSize="default"
                />
                <Button asChild onClick={() => setDetail(null)}>
                  <Link to={detail.url}>
                    Resolver <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
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

function AdiarPopover({
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
          className={triggerSize === "sm" ? "h-7 text-xs" : ""}
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

