import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Landmark, Zap } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectManual: () => void;
  onSelectOpenFinance: () => void;
  showOpenFinance: boolean;
}

export function AccountCreationMethodDialog({
  open, onOpenChange, onSelectManual, onSelectOpenFinance, showOpenFinance,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conta bancária</DialogTitle>
          <DialogDescription>
            Escolha como deseja cadastrar sua conta.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 pt-2">
          {showOpenFinance && (
            <Button
              variant="outline"
              className="h-auto py-4 px-4 justify-start text-left"
              onClick={onSelectOpenFinance}
            >
              <Zap className="h-6 w-6 mr-3 text-primary shrink-0" />
              <div>
                <div className="font-semibold">Conectar via Open Finance</div>
                <div className="text-xs text-muted-foreground font-normal">
                  Traz automaticamente saldo e lançamentos dos últimos 30 dias.
                </div>
              </div>
            </Button>
          )}
          <Button
            variant="outline"
            className="h-auto py-4 px-4 justify-start text-left"
            onClick={onSelectManual}
          >
            <Landmark className="h-6 w-6 mr-3 text-primary shrink-0" />
            <div>
              <div className="font-semibold">Cadastrar manualmente</div>
              <div className="text-xs text-muted-foreground font-normal">
                Informar nome, banco, tipo e saldo inicial.
              </div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
