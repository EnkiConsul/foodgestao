import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface MotivoDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  confirmLabel?: string;
  /** Mínimo de caracteres exigidos na justificativa. */
  minLength?: number;
  loading?: boolean;
  onConfirm: (motivo: string) => void;
}

/**
 * Captura uma justificativa obrigatória antes de uma ação sensível
 * (exclusão de cadastro, purga definitiva etc.). O motivo é registrado
 * na auditoria, por isso não pode ser vazio.
 */
export function MotivoDialog({
  open,
  onOpenChange,
  title,
  description,
  label = "Justificativa",
  confirmLabel = "Confirmar",
  minLength = 5,
  loading = false,
  onConfirm,
}: MotivoDialogProps) {
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (open) setMotivo("");
  }, [open]);

  const canConfirm = motivo.trim().length >= minLength;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-1.5 py-2">
          <Label>
            {label} <span className="text-destructive">*</span>
          </Label>
          <Textarea
            rows={4}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: cadastro duplicado criado por engano"
          />
          <p className="text-[11px] text-muted-foreground">
            Mínimo de {minLength} caracteres. A justificativa fica registrada na auditoria.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={!canConfirm || loading} onClick={() => onConfirm(motivo.trim())}>
            {loading ? "Processando..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
