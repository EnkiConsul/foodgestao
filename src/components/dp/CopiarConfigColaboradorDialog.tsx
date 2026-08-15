import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Users, CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDpModelosHorario } from "@/hooks/useDpModelosHorario";
import { resumoConfigTexto, type DiaConfig, type TurnoResolvido } from "@/lib/dp/config-trabalho";
import type { HorarioSimples } from "@/lib/dp/turno-resolver";

export interface ConfigCopiada {
  turno_padrao_id: string | null;
  folga_variavel: boolean;
  dias: DiaConfig[];
  /** Horário base do colega, já resolvido a partir do turno padrão. */
  horario: HorarioSimples | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Colaborador atual — excluído da lista. */
  colaboradorId?: string | null;
  /** Unidade atual — restringe a lista a colegas da mesma unidade. */
  unidadeId?: string | null;
  turnos: TurnoResolvido[];
  onCopiar: (config: ConfigCopiada) => void;
}

/**
 * Repete a configuração de trabalho de um colega já cadastrado, incluindo os
 * horários próprios de cada dia (exceções), para que o admin não precise
 * reconfigurar tudo a cada novo colaborador.
 */
export function CopiarConfigColaboradorDialog({
  open, onOpenChange, colaboradorId, unidadeId, turnos, onCopiar,
}: Props) {
  const { modelos, isLoading } = useDpModelosHorario(unidadeId, colaboradorId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            Copiar de outro colaborador
          </DialogTitle>
          <DialogDescription>
            Escolha um colega com a mesma rotina. Os horários diferentes por dia também são copiados.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : modelos.length === 0 ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <CalendarOff className="h-4 w-4" aria-hidden="true" />
            Nenhum colaborador desta unidade tem horário de trabalho cadastrado ainda.
          </p>
        ) : (
          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
            {modelos.map((m) => (
              <li key={m.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.colaborador_nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.cargo ? `${m.cargo} · ` : ""}
                    {resumoConfigTexto(
                      {
                        turno_padrao_id: m.turno_padrao_id,
                        folga_variavel: m.folga_variavel,
                        folga_fixa_dow: null,
                        dias: m.dias,
                      },
                      m.horario
                        ? [...turnos, { id: m.turno_padrao_id ?? "modelo", nome: "Horário", cor: null, ...m.horario }]
                        : turnos,
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    onCopiar({
                      turno_padrao_id: m.turno_padrao_id,
                      folga_variavel: m.folga_variavel,
                      dias: m.dias,
                      horario: m.horario,
                    });
                    onOpenChange(false);
                  }}
                >
                  Usar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
