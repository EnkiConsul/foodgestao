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
import { TIPO_LABEL } from "@/lib/dp/ocorrencias";
import { resumoTratativa } from "@/lib/dp/ocorrencia-resumo";
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
  const r = resumoTratativa(ocorrencia);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tratar ponto</DialogTitle>
          <DialogDescription>{ocorrencia.colaborador?.nome}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-medium">{r.titulo}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {r.batida ?? TIPO_LABEL[ocorrencia.tipo]}
              {r.horario ? ` às ${r.horario}` : ""}
              {r.previsto && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">(previsto {r.previsto})</span>
              )}
            </p>
            {ocorrencia.justificativa_inicial && (
              <p className="mt-1 text-sm italic text-muted-foreground">“{ocorrencia.justificativa_inicial}”</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={r.horario ? `Ex.: considerar ${r.batida?.toLowerCase() ?? "marcação"} às ${r.horario}.` : ""}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Ao decidir, a ocorrência já sai das pendências. O ponto em si é ajustado por quem faz o tratamento.
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
            Pedir ajuste do ponto
          </Button>
          <Button disabled={saving} onClick={() => onSubmit({ decisao: "confirmada", observacao })}>
            {r.horario ? `Aceitar ${r.horario}` : "Aceitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
