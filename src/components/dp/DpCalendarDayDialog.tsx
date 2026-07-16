import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Plus } from "lucide-react";
import { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Popup padrão de "detalhe do dia" do módulo DP.
 * Usado no Calendário Geral (admin) e no calendário do colaborador,
 * seguindo o design de referência da documentação:
 *   - cabeçalho com ícone circular + data em destaque
 *   - seção "Escala do dia" com dashed empty state
 *   - seção "Atribuir folga manual" com Select + botão primário
 *   - rodapé "Fechar detalhes"
 */

export interface DpDayScheduleEntry {
  id: string;
  name: string;
  meta?: ReactNode;
  status?: ReactNode;
}

export interface DpAssignOption {
  value: string;
  label: string;
}

interface DpCalendarDayDialogProps {
  day: Date | null;
  onClose: () => void;
  schedule: DpDayScheduleEntry[];
  emptyLabel?: string;
  scheduleLabel?: string;
  /** Bloco opcional de "atribuição rápida". Omitido quando `assignOptions` não é passado. */
  assignLabel?: string;
  assignPlaceholder?: string;
  assignButtonLabel?: string;
  assignOptions?: DpAssignOption[];
  assignValue?: string;
  onAssignChange?: (value: string) => void;
  onAssign?: () => void;
  assignPending?: boolean;
  /** Ação secundária opcional abaixo do bloco de atribuição (ex.: abrir formulário avançado). */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Slot livre acima do rodapé para ações extras específicas da tela. */
  footerExtra?: ReactNode;
}

export function DpCalendarDayDialog({
  day,
  onClose,
  schedule,
  emptyLabel = "Ninguém escalado para este dia.",
  scheduleLabel = "Escala do dia",
  assignLabel = "Atribuir folga manual",
  assignPlaceholder = "Escolher colaborador...",
  assignButtonLabel = "Atribuir",
  assignOptions,
  assignValue,
  onAssignChange,
  onAssign,
  assignPending,
  secondaryAction,
  footerExtra,
}: DpCalendarDayDialogProps) {
  return (
    <Dialog open={!!day} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "sm:max-w-lg gap-5 rounded-3xl border-none p-7 shadow-2xl",
          "bg-card",
        )}
      >
        {day && (
          <>
            <DialogHeader className="space-y-0">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <CalendarIcon className="h-6 w-6" />
                </div>
                <DialogTitle className="text-3xl font-black tracking-tight">
                  {format(day, "dd/MM/yyyy")}
                </DialogTitle>
              </div>
              <DialogDescription className="sr-only">
                {format(day, "PPPP", { locale: ptBR })}
              </DialogDescription>
            </DialogHeader>

            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {scheduleLabel}
              </div>
              {schedule.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-border/70 bg-muted/30 py-10 text-center text-sm text-muted-foreground">
                  {emptyLabel}
                </div>
              ) : (
                <ul className="space-y-2">
                  {schedule.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between rounded-2xl border bg-card p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{entry.name}</div>
                        {entry.meta && (
                          <div className="text-xs text-muted-foreground">
                            {entry.meta}
                          </div>
                        )}
                      </div>
                      {entry.status}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {assignOptions && (
              <section className="space-y-2 border-t pt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {assignLabel}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={assignValue ?? ""} onValueChange={onAssignChange}>
                    <SelectTrigger className="flex-1 rounded-xl">
                      <SelectValue placeholder={assignPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {assignOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={onAssign}
                    disabled={!assignValue || assignPending}
                    className="rounded-xl sm:min-w-[140px]"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {assignPending ? "Atribuindo..." : assignButtonLabel}
                  </Button>
                </div>
                {secondaryAction && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={secondaryAction.onClick}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {secondaryAction.label}
                    </button>
                  </div>
                )}
              </section>
            )}

            {footerExtra}

            <DialogFooter className="sm:justify-center">
              <Button
                variant="ghost"
                onClick={onClose}
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Fechar detalhes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
