import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export type RecurringScope = "single" | "forward" | "all";

type Props = {
  open: boolean;
  value: RecurringScope;
  onValueChange: (v: RecurringScope) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RecurringEditScopeDialog({ open, value, onValueChange, onCancel, onConfirm }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Editar lançamento recorrente</AlertDialogTitle>
          <AlertDialogDescription>
            Este lançamento faz parte de uma série recorrente. O que você deseja alterar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup
          value={value}
          onValueChange={(v) => onValueChange(v as RecurringScope)}
          className="space-y-2 py-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="single" id="edit-scope-single" />
            <Label htmlFor="edit-scope-single" className="cursor-pointer font-normal">Somente este lançamento</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="forward" id="edit-scope-forward" />
            <Label htmlFor="edit-scope-forward" className="cursor-pointer font-normal">Este e os próximos</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="edit-scope-all" />
            <Label htmlFor="edit-scope-all" className="cursor-pointer font-normal">Todos da série</Label>
          </div>
        </RadioGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Continuar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
