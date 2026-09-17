/**
 * Confirmação para excluir uma ficha de admissão.
 *
 * A exclusão é feita pela rotina do servidor: a ficha sai das listas, o link do
 * candidato deixa de valer e fica guardado quem excluiu, quando e por quê.
 * Nada é apagado — nem familiares, nem documentos, nem histórico.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notifyError } from "@/lib/notifyError";
import { useDpPreadmissaoGestor } from "@/hooks/dp/useDpPreadmissoes";

interface Props {
  /** Ficha a excluir; null mantém a janela fechada. */
  preadmissaoId: string | null;
  candidatoNome: string;
  onOpenChange: (aberto: boolean) => void;
  /** Chamado depois de excluir (fechar a revisão, por exemplo). */
  onExcluida?: () => void;
}

export function PreadmissaoExcluirDialog({
  preadmissaoId, candidatoNome, onOpenChange, onExcluida,
}: Props) {
  const { excluir } = useDpPreadmissaoGestor(preadmissaoId);
  const [motivo, setMotivo] = useState("");

  const confirmar = async () => {
    try {
      await excluir.mutateAsync({ motivo: motivo.trim() });
      toast.success("Ficha excluída");
      setMotivo("");
      onOpenChange(false);
      onExcluida?.();
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "excluir a ficha" });
    }
  };

  return (
    <Dialog open={!!preadmissaoId} onOpenChange={(v) => { if (!v) setMotivo(""); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir a ficha de {candidatoNome}?</DialogTitle>
          <DialogDescription>
            Ela sai da lista e o link deixa de valer. Os documentos enviados e o histórico continuam guardados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="excluir-motivo">Por que está excluindo? (opcional)</Label>
          <Textarea
            id="excluir-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: candidato desistiu da vaga"
            rows={3}
          />
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-10">
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="min-h-10"
            disabled={excluir.isPending}
            onClick={confirmar}
          >
            {excluir.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Trash2 className="h-4 w-4 mr-2" />}
            Excluir Ficha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
