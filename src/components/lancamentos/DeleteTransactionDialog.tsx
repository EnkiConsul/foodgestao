import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type DeleteScope = "single" | "forward" | "all";

type Props = {
  open: boolean;
  isRecurring: boolean;
  scope: DeleteScope;
  onScopeChange: (s: DeleteScope) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteTransactionDialog({
  open, isRecurring, scope, onScopeChange, onCancel, onConfirm,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
          <AlertDialogDescription>
            {isRecurring
              ? "Este lançamento faz parte de uma série recorrente. Escolha o que deseja excluir:"
              : "Essa ação não pode ser desfeita. O registro será removido permanentemente."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isRecurring && (
          <RadioGroup
            value={scope}
            onValueChange={(v) => onScopeChange(v as DeleteScope)}
            className="gap-2 px-1"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="single" id="scope-single" />
              <label htmlFor="scope-single" className="text-sm cursor-pointer">Somente este lançamento</label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="forward" id="scope-forward" />
              <label htmlFor="scope-forward" className="text-sm cursor-pointer">Este e os próximos</label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="all" id="scope-all" />
              <label htmlFor="scope-all" className="text-sm cursor-pointer">Todos os lançamentos da série</label>
            </div>
          </RadioGroup>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
