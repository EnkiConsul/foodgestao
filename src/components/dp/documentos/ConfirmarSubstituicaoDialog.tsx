import { AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface DuplicateCollision {
  item_id: string;
  colaborador_nome: string;
  competencia_label: string;
}

export interface ConfirmarSubstituicaoDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  collisions: DuplicateCollision[];
  totalItems: number;
  onSkip: () => void;
  onReplace: () => void;
}

export function ConfirmarSubstituicaoDialog({
  open, onOpenChange, collisions, totalItems, onSkip, onReplace,
}: ConfirmarSubstituicaoDialogProps) {
  const nonDup = totalItems - collisions.length;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg flex-col overflow-hidden">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Documentos Duplicados Encontrados
          </AlertDialogTitle>
          <AlertDialogDescription>
            {collisions.length} de {totalItems} página(s) já possuem documento
            salvo para o mesmo colaborador na mesma competência. Escolha como
            proceder:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border max-h-[40dvh]">
          <ul className="divide-y text-sm">
            {collisions.map((c) => (
              <li key={c.item_id} className="px-3 py-2 flex items-center justify-between gap-2">
                <span className="truncate">{c.colaborador_nome}</span>
                <span className="text-xs text-muted-foreground shrink-0">{c.competencia_label}</span>
              </li>
            ))}
          </ul>
        </div>

        <AlertDialogFooter className="shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {nonDup > 0 && (
            <Button variant="outline" className="h-auto whitespace-normal py-2" onClick={onSkip}>
              Pular duplicados e salvar {nonDup} nova(s)
            </Button>
          )}
          <Button variant="destructive" className="h-auto whitespace-normal py-2" onClick={onReplace}>
            Substituir {collisions.length} existente(s)
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
