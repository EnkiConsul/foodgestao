import type { ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Explica o que "Ignorar" faz antes de tirar a ficha da conferência: não cria
 * cadastro, guarda o que foi lido e pode ser desfeito em "Ignoradas".
 */
export function ConfirmarIgnorarFichaDialog({
  nome, children, onConfirm, disabled, emLote = false,
}: {
  nome: string;
  children: ReactNode;
  onConfirm: () => void;
  disabled?: boolean;
  /** No lote há o filtro "Ignoradas" na lista; fora dele a ficha fica no próprio envio. */
  emLote?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild disabled={disabled}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Ignorar a ficha de {nome}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Use quando esta pessoa não deve ser cadastrada agora (já saiu, ficha repetida ou de outra empresa).</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Nenhum cadastro é criado.</li>
                <li>O PDF e os dados lidos continuam guardados no lote.</li>
                <li>
                  Dá para trazer de volta quando quiser
                  {emLote ? <> em <strong className="text-foreground">Ignoradas</strong>, com o botão <strong className="text-foreground">Reativar</strong>.</> : " com o botão Reativar ficha."}
                </li>
              </ul>
              <p className="rounded-md border bg-muted/50 p-2">
                Se só falta alguma informação, prefira <strong className="text-foreground">Salvar e próxima</strong>: a ficha guarda o que foi preenchido e espera por você.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <AlertDialogCancel className="mt-0 min-h-11 w-full sm:w-auto">Voltar à ficha</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="min-h-11 w-full sm:w-auto">
            Ignorar ficha
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
