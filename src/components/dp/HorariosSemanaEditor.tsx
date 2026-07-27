import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { JornadaCard, type DestinoDuplicacao } from "@/components/dp/JornadaCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  calcularCargaSemanal,
  duplicarHorario,
  formatarHoras,
  horarioHerdado,
  validarSemana,
  viraODia,
  DIAS_SEMANA,
  DIAS_UTEIS,
  FIM_DE_SEMANA,
  LIMITE_SEMANAL,
  ORDEM_EXIBICAO,
  type HorarioDia,
} from "@/lib/dp/jornada-utils";

interface Props {
  horarios: HorarioDia[];
  onChange: (horarios: HorarioDia[]) => void;
  menorDeIdade?: boolean;
}

export function HorariosSemanaEditor({ horarios, onChange, menorDeIdade }: Props) {
  const [origemEscolha, setOrigemEscolha] = useState<number | null>(null);
  const [selecionados, setSelecionados] = useState<number[]>([]);

  const semanal = useMemo(() => calcularCargaSemanal(horarios), [horarios]);
  const erros = useMemo(() => validarSemana(horarios, { menorDeIdade }), [horarios, menorDeIdade]);
  const errosPorDia = useMemo(
    () => new Map(erros.map((e) => [e.dia_semana, e.erro])),
    [erros],
  );
  const acima = semanal > LIMITE_SEMANAL;

  const ordenar = (lista: HorarioDia[]) =>
    [...lista].sort((a, b) => ORDEM_EXIBICAO.indexOf(a.dia_semana as 0) - ORDEM_EXIBICAO.indexOf(b.dia_semana as 0));

  const toggleDia = (dia: number, marcado: boolean) => {
    if (marcado) onChange(ordenar([...horarios, horarioHerdado(horarios, dia)]));
    else onChange(horarios.filter((h) => h.dia_semana !== dia));
  };

  const alterarDia = (dia: number, patch: Partial<HorarioDia>) => {
    onChange(
      horarios.map((h) => {
        if (h.dia_semana !== dia) return h;
        const next = { ...h, ...patch };
        return { ...next, termina_no_dia_seguinte: viraODia(next.entrada, next.saida) };
      }),
    );
  };

  const duplicar = (dia: number, destino: DestinoDuplicacao) => {
    if (destino === "escolher") {
      setOrigemEscolha(dia);
      setSelecionados(horarios.filter((h) => h.dia_semana !== dia).map((h) => h.dia_semana));
      return;
    }
    const alvos =
      destino === "todos" ? [0, 1, 2, 3, 4, 5, 6] : destino === "uteis" ? [...DIAS_UTEIS] : [...FIM_DE_SEMANA];
    onChange(ordenar(duplicarHorario(horarios, dia, alvos)));
  };

  const confirmarEscolha = () => {
    if (origemEscolha === null) return;
    onChange(ordenar(duplicarHorario(horarios, origemEscolha, selecionados)));
    setOrigemEscolha(null);
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "sticky top-0 z-10 flex items-center justify-between gap-3 rounded-xl border p-4",
          acima ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5",
        )}
      >
        <div>
          <p className="text-xs text-muted-foreground">Carga semanal</p>
          <p className="text-2xl font-bold tabular-nums">{formatarHoras(semanal)}</p>
        </div>
        <p className={cn("flex items-center gap-1.5 text-right text-xs font-medium", acima ? "text-destructive" : "text-primary")}>
          {acima ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {acima ? `Acima de ${LIMITE_SEMANAL} horas` : "Dentro do limite legal"}
        </p>
      </div>

      {ORDEM_EXIBICAO.map((dia) => (
        <JornadaCard
          key={dia}
          dia={dia}
          horario={horarios.find((h) => h.dia_semana === dia) ?? null}
          erro={errosPorDia.get(dia)}
          onToggle={(m) => toggleDia(dia, m)}
          onChange={(patch) => alterarDia(dia, patch)}
          onDuplicar={(d) => duplicar(dia, d)}
        />
      ))}

      <Dialog open={origemEscolha !== null} onOpenChange={(v) => { if (!v) setOrigemEscolha(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Copiar para quais dias?</DialogTitle>
            <DialogDescription>
              Os horários serão aplicados aos dias escolhidos, marcando-os como dias de trabalho.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {ORDEM_EXIBICAO.filter((d) => d !== origemEscolha).map((d) => {
              const info = DIAS_SEMANA.find((x) => x.v === d)!;
              const marcado = selecionados.includes(d);
              return (
                <label
                  key={d}
                  className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-accent"
                >
                  <Checkbox
                    checked={marcado}
                    onCheckedChange={(v) =>
                      setSelecionados((s) => (v ? [...s, d] : s.filter((x) => x !== d)))
                    }
                  />
                  <span className="text-base">{info.longo}</span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrigemEscolha(null)}>Cancelar</Button>
            <Button onClick={confirmarEscolha}>Copiar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Label className="sr-only">Semana de trabalho</Label>
    </div>
  );
}
