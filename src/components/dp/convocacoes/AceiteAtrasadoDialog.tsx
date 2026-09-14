import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { rotuloAtraso } from "@/lib/dp/convocacoes";
import { hhmm as hhmmBase } from "@/lib/dp/formato";

const hhmm = (v?: string | null) => hhmmBase(v, "—");


export interface AceiteAtrasadoDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loading?: boolean;
  entrada: string | null;
  saida: string | null;
  minutosDeAtraso: number;
  onConfirm: (justificativa: string) => void;
}

/**
 * A pessoa veio trabalhar no horário e só não respondeu antes: aceite do
 * horário completo depois do início, com justificativa obrigatória.
 */
export function AceiteAtrasadoDialog({
  open, onOpenChange, loading, entrada, saida, minutosDeAtraso, onConfirm,
}: AceiteAtrasadoDialogProps) {
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (open) setTexto("");
  }, [open]);

  const valido = texto.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Vim no horário, só não respondi
          </DialogTitle>
          <DialogDescription>
            Você vai confirmar o horário completo ({hhmm(entrada)} → {hhmm(saida)}). Sua resposta
            está chegando {rotuloAtraso(minutosDeAtraso)}, então escreva o que aconteceu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="atraso-justificativa">Explique para o gestor</Label>
          <Textarea
            id="atraso-justificativa" rows={3} value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: cheguei no horário e só consegui responder aqui depois."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Voltar
          </Button>
          <Button disabled={!valido || loading} onClick={() => onConfirm(texto.trim())}>
            Confirmar o horário completo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
