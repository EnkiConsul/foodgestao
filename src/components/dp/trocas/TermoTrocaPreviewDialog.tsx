import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DpTrocaRow } from "@/hooks/useDpTrocas";
import { emitirTermoTrocaPdf, termoTrocaHtml } from "@/lib/dp/troca-certificado";

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
  const [emitindo, setEmitindo] = useState(false);
  const emitir = async () => {
    if (!troca) return;
    const janela = window.open("", "_blank");
    setEmitindo(true);
    try {
      await emitirTermoTrocaPdf(troca, empresa, janela);
    } catch {
      janela?.close();
      toast.error("Não foi possível gerar o PDF do termo. Tente novamente; se continuar, recarregue a página.");
    } finally {
      setEmitindo(false);
    }
  };
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
          <Button className="min-h-11" disabled={emitindo} onClick={emitir}>
            <FileDown className="mr-1 h-4 w-4" /> {emitindo ? "Gerando…" : "Emitir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
