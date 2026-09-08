import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApoioUnidadesField } from "@/components/dp/ApoioUnidadesField";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nome: string;
  colaboradorId?: string | null;
  pessoaApoioId?: string | null;
  unidadeHabitualId?: string | null;
}

/**
 * Libera a pessoa para ser escalada como apoio em outras unidades da mesma
 * empresa, sem criar um segundo cadastro e sem mexer no contrato dela.
 */
export function ApoioUnidadesDialog({
  open, onOpenChange, nome, colaboradorId = null, pessoaApoioId = null, unidadeHabitualId = null,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Atuação em outras unidades</DialogTitle>
          <DialogDescription>
            {nome} — libere as unidades onde essa pessoa pode ser escalada como apoio.
            Contrato, salário e unidade principal continuam iguais.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <ApoioUnidadesField
            colaboradorId={colaboradorId}
            pessoaApoioId={pessoaApoioId}
            unidadeHabitualId={unidadeHabitualId}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
