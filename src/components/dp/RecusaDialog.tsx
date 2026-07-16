import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface RecusaDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  description?: string;
  motivoObrigatorio?: boolean;
  onConfirm: (motivo: string) => void;
  loading?: boolean;
}

/**
 * Dialog padronizado para capturar motivo de recusa. Substitui `window.prompt`.
 */
export function RecusaDialog({
  open,
  onOpenChange,
  title = "Recusar",
  description = "Informe o motivo da recusa. Ele será registrado e visível ao solicitante.",
  motivoObrigatorio = false,
  onConfirm,
  loading = false,
}: RecusaDialogProps) {
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (open) setMotivo("");
  }, [open]);

  const canConfirm = motivoObrigatorio ? motivo.trim().length >= 3 : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 py-2">
          <Label>Motivo {motivoObrigatorio && <span className="text-destructive">*</span>}</Label>
          <Textarea
            rows={4}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Descreva brevemente o motivo..."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm || loading}
            onClick={() => onConfirm(motivo.trim())}
          >
            {loading ? "Enviando..." : "Confirmar recusa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
