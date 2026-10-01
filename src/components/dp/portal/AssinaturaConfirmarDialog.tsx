import { useState } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AssinaturaCaptura } from "@/components/dp/AssinaturaCaptura";

/** Pede o desenho ou o modelo de letra antes de registrar a assinatura. */
export function AssinaturaConfirmarDialog({
  open,
  onOpenChange,
  titulo,
  nome,
  enviando,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  nome: string;
  enviando?: boolean;
  onConfirmar: (assinatura: string) => void;
}) {
  const [png, setPng] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setPng(null); onOpenChange(v); }}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PenLine className="h-5 w-5 text-primary" />Assinar Documento</DialogTitle>
          <DialogDescription className="break-words">{titulo}</DialogDescription>
        </DialogHeader>
        {open && <AssinaturaCaptura nomePadrao={nome} onChange={setPng} />}
        <p className="text-xs text-muted-foreground">Sua assinatura aparecerá no documento e a rubrica em todas as páginas.</p>
        <DialogFooter>
          <Button className="w-full min-h-10" disabled={!png || enviando} onClick={() => png && onConfirmar(png)}>
            {enviando ? "Assinando…" : "Confirmar Assinatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
