import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TelasDesenvolvimentoPanel } from "@/components/dp/TelasDesenvolvimentoPanel";

/**
 * Atalho de super admin para ocultar/reexibir telas em desenvolvimento
 * sem sair do módulo Pessoas.
 */
export function TelasDesenvolvimentoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Telas em desenvolvimento</DialogTitle>
          <DialogDescription>
            Marque as telas inacabadas e use o interruptor único para ocultá-las de todos os
            usuários.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <TelasDesenvolvimentoPanel footerClassName="bottom-0 bg-background/95 py-2 backdrop-blur" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
