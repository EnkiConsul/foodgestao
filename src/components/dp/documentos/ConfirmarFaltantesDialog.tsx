import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CoverageColaborador } from "@/lib/dp/bulk-coverage";

export interface ConfirmarFaltantesDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  faltantes: CoverageColaborador[];
  competencia: string | null;
  onConfirm: () => void;
}

export function ConfirmarFaltantesDialog({
  open, onOpenChange, faltantes, competencia, onConfirm,
}: ConfirmarFaltantesDialogProps) {
  const compLabel = competencia
    ? `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`
    : "período do lote";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Faltam documentos de {faltantes.length} colaborador(es)</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Estes colaboradores estiveram ativos em {compLabel} e não têm documento neste lote:
              </p>
              <ul className="max-h-40 overflow-auto text-sm text-foreground space-y-0.5">
                {faltantes.slice(0, 30).map((c) => (
                  <li key={c.id}>
                    {c.nome}
                    {c.matricula ? ` · #${c.matricula}` : ""}
                  </li>
                ))}
                {faltantes.length > 30 && <li>… e mais {faltantes.length - 30}</li>}
              </ul>
              <p>Deseja aprovar assim mesmo?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Revisar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Aprovar mesmo assim</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
