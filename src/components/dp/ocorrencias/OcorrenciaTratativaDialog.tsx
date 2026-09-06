import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MARCACAO_LABEL, TIPO_LABEL } from "@/lib/dp/ocorrencias";
import type { Ocorrencia } from "@/hooks/useDpOcorrencias";

interface Props {
  ocorrencia: Ocorrencia | null;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  onSubmit: (input: { decisao: string; observacao: string }) => void;
}

/** Decisão do gestor sobre o que precisa ser considerado depois no ponto. */
export function OcorrenciaTratativaDialog({ ocorrencia, onOpenChange, saving, onSubmit }: Props) {
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    setObservacao(ocorrencia?.tratativa_observacao ?? "");
  }, [ocorrencia?.id, ocorrencia?.tratativa_observacao]);

  if (!ocorrencia) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tratativa de ponto</DialogTitle>
          <DialogDescription>
            {ocorrencia.colaborador?.nome} — {TIPO_LABEL[ocorrencia.tipo]}
            {ocorrencia.marcacao_alvo ? ` (${MARCACAO_LABEL[ocorrencia.marcacao_alvo]})` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {ocorrencia.horario_real && (
            <p className="text-sm text-muted-foreground">
              Horário informado: <strong>{ocorrencia.horario_real.slice(0, 5)}</strong>
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: considerar entrada às 17:58 no tratamento do ponto."
            />
          </div>
          <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
            Esta tratativa não altera o ponto. Ela só registra a decisão para quem fará o tratamento.
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onSubmit({ decisao: "ajuste_solicitado", observacao })}
          >
            Solicitar ajuste
          </Button>
          <Button disabled={saving} onClick={() => onSubmit({ decisao: "confirmada", observacao })}>
            Confirmar informação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
