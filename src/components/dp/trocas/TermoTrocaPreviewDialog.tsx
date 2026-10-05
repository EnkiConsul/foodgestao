import { useMemo } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DpTrocaRow } from "@/hooks/useDpTrocas";
import { imprimirTermoTroca, termoTrocaHtml } from "@/lib/dp/troca-certificado";

type Props = {
  troca: DpTrocaRow | null;
  empresa: { nome: string; cnpj?: string | null };
  onOpenChange: (open: boolean) => void;
};

/** Mostra o Termo de Troca na tela; a impressão só acontece quando o usuário pede. */
export function TermoTrocaPreviewDialog({ troca, empresa, onOpenChange }: Props) {
  const html = useMemo(
    () => (troca ? termoTrocaHtml(troca, empresa) : ""),
    [troca, empresa],
  );
  return (
    <Dialog open={!!troca} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-3xl flex-col gap-3 p-4">
        <DialogHeader>
          <DialogTitle>Termo de Troca de Folga</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden rounded-xl border border-border bg-background">
          {troca && (
            <iframe
              title="Pré-visualização do Termo de Troca"
              srcDoc={html}
              sandbox=""
              className="h-full w-full bg-white"
            />
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button className="min-h-11" onClick={() => troca && imprimirTermoTroca(troca, empresa)}>
            <Printer className="mr-1 h-4 w-4" /> Imprimir / Salvar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
