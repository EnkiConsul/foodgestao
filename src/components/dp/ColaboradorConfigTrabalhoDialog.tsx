import { CalendarClock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ColaboradorJornadaPanel } from "@/components/dp/ColaboradorJornadaPanel";

interface Props {
  colaborador: { id: string; nome: string; regime?: string | null; unidade_id?: string | null } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Atalho dedicado à configuração de trabalho do colaborador.
 * O conteúdo é o mesmo painel da aba "Turno & Jornada" do cadastro unificado.
 */
export function ColaboradorConfigTrabalhoDialog({ colaborador, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92vh] sm:rounded-lg">
        <DialogHeader className="border-b p-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
            Configuração de trabalho
          </DialogTitle>
          <DialogDescription>
            Como {colaborador?.nome ?? "o colaborador"} trabalha por padrão. A escala do mês nasce daqui.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <ColaboradorJornadaPanel colaborador={colaborador} active={open} />
        </div>

        <DialogFooter className="flex-row gap-2 border-t p-4">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
