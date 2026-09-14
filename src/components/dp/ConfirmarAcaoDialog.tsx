import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Props = {
  /** Botão que abre a confirmação. */
  children: ReactNode;
  titulo: string;
  descricao: string;
  confirmar?: string;
  cancelar?: string;
  destrutivo?: boolean;
  onConfirm: () => void;
  disabled?: boolean;
};

/**
 * Confirmação padrão para ações sem volta (cancelar, recusar, excluir).
 * Mesmo padrão já usado nas telas do gestor.
 */
export function ConfirmarAcaoDialog({
  children,
  titulo,
  descricao,
  confirmar = "Confirmar",
  cancelar = "Voltar",
  destrutivo = true,
  onConfirm,
  disabled,
}: Props) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild disabled={disabled}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <AlertDialogCancel className="min-h-10 w-full sm:w-auto">{cancelar}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              destrutivo
                ? "min-h-10 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto"
                : "min-h-10 w-full sm:w-auto"
            }
          >
            {confirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
