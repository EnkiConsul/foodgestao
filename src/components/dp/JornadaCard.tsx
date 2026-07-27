import { useState } from "react";
import { MoreVertical, MoonStar } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  calcularCargaDia,
  formatarHoras,
  INTERVALOS_RAPIDOS,
  viraODia,
  DIAS_SEMANA,
  type HorarioDia,
} from "@/lib/dp/jornada-utils";

export type DestinoDuplicacao = "todos" | "uteis" | "fds" | "escolher";

interface Props {
  dia: number;
  horario: HorarioDia | null;
  erro?: string;
  onToggle: (marcado: boolean) => void;
  onChange: (patch: Partial<HorarioDia>) => void;
  onDuplicar: (destino: DestinoDuplicacao) => void;
}

export function JornadaCard({ dia, horario, erro, onToggle, onChange, onDuplicar }: Props) {
  const info = DIAS_SEMANA.find((d) => d.v === dia)!;
  const [outroAberto, setOutroAberto] = useState(false);
  const trabalha = !!horario;
  const intervalo = horario?.intervalo_minutos ?? 60;
  const intervaloCustom = trabalha && !INTERVALOS_RAPIDOS.includes(intervalo);

  return (
    <section
      className={cn(
        "rounded-xl border bg-card p-4",
        trabalha ? "border-border" : "border-dashed border-border/70 bg-muted/30",
        erro && "border-destructive",
      )}
      aria-label={info.longo}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Switch
            id={`dia-${dia}`}
            checked={trabalha}
            onCheckedChange={onToggle}
            aria-label={`Trabalha ${info.longo}`}
          />
          <Label htmlFor={`dia-${dia}`} className="truncate text-base font-semibold">
            {info.longo}
          </Label>
        </div>
        {trabalha ? (
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              {formatarHoras(calcularCargaDia(horario))}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Opções de ${info.longo}`}>
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Duplicar horários</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onDuplicar("todos")}>Todos os dias</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onDuplicar("uteis")}>Dias úteis</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onDuplicar("fds")}>Fim de semana</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onDuplicar("escolher")}>Selecionar dias…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <span className="shrink-0 text-sm text-muted-foreground">Folga</span>
        )}
      </div>

      {trabalha && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`ent-${dia}`} className="text-xs text-muted-foreground">
                Entrada
              </Label>
              <Input
                id={`ent-${dia}`}
                type="time"
                className="h-12 text-base"
                value={horario.entrada}
                onChange={(e) => onChange({ entrada: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`sai-${dia}`} className="text-xs text-muted-foreground">
                Saída
              </Label>
              <Input
                id={`sai-${dia}`}
                type="time"
                className="h-12 text-base"
                value={horario.saida}
                onChange={(e) => onChange({ saida: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Intervalo</span>
            <div className="flex flex-wrap gap-2">
              {INTERVALOS_RAPIDOS.map((min) => (
                <Button
                  key={min}
                  type="button"
                  size="sm"
                  variant={!intervaloCustom && intervalo === min ? "default" : "outline"}
                  className="h-10 min-w-[64px]"
                  onClick={() => {
                    setOutroAberto(false);
                    onChange({ intervalo_minutos: min });
                  }}
                >
                  {min} min
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={intervaloCustom || outroAberto ? "default" : "outline"}
                className="h-10"
                onClick={() => setOutroAberto(true)}
              >
                Outro
              </Button>
            </div>
            {(outroAberto || intervaloCustom) && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={480}
                  step={5}
                  className="h-11 w-28 text-base"
                  aria-label={`Intervalo em minutos — ${info.longo}`}
                  value={intervalo}
                  onChange={(e) => onChange({ intervalo_minutos: Math.max(0, Number(e.target.value) || 0) })}
                />
                <span className="text-sm text-muted-foreground">minutos</span>
              </div>
            )}
          </div>

          {viraODia(horario.entrada, horario.saida) && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MoonStar className="h-3.5 w-3.5" aria-hidden="true" />
              Termina no dia seguinte
            </p>
          )}
          {erro && <p className="text-xs font-medium text-destructive">{erro}</p>}
        </div>
      )}
    </section>
  );
}
