import { CalendarRange } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDpGradesSemanais, type GradeSemanal } from "@/hooks/useDpGradesSemanais";
import { DOW_CURTO, type TurnoResolvido } from "@/lib/dp/config-trabalho";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unidadeId?: string | null;
  turnos: TurnoResolvido[];
  onAplicar: (grade: GradeSemanal) => void;
}

/** Escolha da grade semanal da unidade para preencher a semana do colaborador. */
export function UsarGradeSemanalDialog({ open, onOpenChange, unidadeId, turnos, onAplicar }: Props) {
  const { grades, isLoading } = useDpGradesSemanais(unidadeId ?? null);
  const ativas = grades.filter((g) => g.ativo);

  const resumo = (g: GradeSemanal) => g.dias
    .map((d) => {
      if (!d.trabalha) return `${DOW_CURTO[d.dow]}: folga`;
      const t = turnos.find((x) => x.id === d.turno_id);
      return `${DOW_CURTO[d.dow]}: ${t ? `${t.entrada}–${t.saida}` : "horário base"}`;
    })
    .join(" · ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-5 w-5 text-primary" aria-hidden="true" />
            Grade semanal da unidade
          </DialogTitle>
          <DialogDescription>
            Semanas padrão da operação. Aplique e ajuste só o que for diferente para este colaborador.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && ativas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma grade cadastrada ainda. Cadastre em Cadastros → Grades semanais.
            </p>
          )}
          {ativas.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => { onAplicar(g); onOpenChange(false); }}
              className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{g.nome}</span>
                {g.folga_variavel && <Badge variant="secondary">Folga variável</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{resumo(g)}</p>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
