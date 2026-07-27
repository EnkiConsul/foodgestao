import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmarSemUnidadeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  totalItens: number;
}

/**
 * Bloqueio de aprovação quando a unidade do lote não foi identificada.
 * A aprovação só segue com confirmação explícita, registrada em auditoria.
 */
export function ConfirmarSemUnidadeDialog({
  open, onOpenChange, onConfirm, totalItens,
}: ConfirmarSemUnidadeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Aprovar Sem Unidade Identificada?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Não foi possível identificar a unidade deste lote ({totalItens} documento(s)).
                Sem unidade, o sistema não consegue verificar quais colaboradores ficaram sem documento
                na competência.
              </p>
              <p>
                O recomendado é vincular a unidade no alerta acima antes de aprovar. Se optar por seguir,
                a aprovação será registrada no log de auditoria como
                <strong> aprovação sem unidade</strong>.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Vincular Unidade</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Aprovar Sem Unidade</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
