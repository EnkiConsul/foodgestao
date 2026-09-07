import { useEffect, useState } from "react";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
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
    <DpDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
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
        </>
      }
    >
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
    </DpDialogShell>
  );
}
