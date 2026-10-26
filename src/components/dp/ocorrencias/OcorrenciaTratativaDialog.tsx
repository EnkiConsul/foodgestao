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
import { rotuloTipoOcorrencia, ocorrenciaDeFolga, temControlePonto } from "@/lib/dp/ocorrencias";

/** Tipos de jornada em que o gestor decide entre Compensação, Abono ou Desconto em Folha. */
const TIPOS_DECISAO_JORNADA = ["atraso", "falta", "saida_antecipada", "atraso_intervalo"];
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
  const comPonto = temControlePonto(ocorrencia);
  const jornada = TIPOS_DECISAO_JORNADA.includes(ocorrencia.tipo);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{comPonto ? "Tratar ponto" : "Conferir ocorrência"}</DialogTitle>
          <DialogDescription>{ocorrencia.colaborador?.nome}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-medium">{r.titulo}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {r.batida ?? rotuloTipoOcorrencia(ocorrencia)}
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
              placeholder={comPonto && r.horario ? `Ex.: considerar ${r.batida?.toLowerCase() ?? "marcação"} às ${r.horario}.` : ""}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {jornada
              ? "Escolha a decisão: Compensação (o tempo será compensado), Abono ou Desconto em Folha. Nada é descontado sem a sua escolha."
              : comPonto
                ? "Ao decidir, a ocorrência já sai das pendências. O ponto em si é ajustado por quem faz o tratamento."
                : "Ao confirmar, você registra ciência da justificativa e a ocorrência sai das pendências."}
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {jornada ? (
            <>
              <Button variant="outline" disabled={saving} onClick={() => onSubmit({ decisao: "desconto", observacao })}>
                Desconto em Folha
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => onSubmit({ decisao: "abono", observacao })}>
                Abono
              </Button>
              <Button disabled={saving} onClick={() => onSubmit({ decisao: "compensacao", observacao })}>
                Compensação
              </Button>
            </>
          ) : (
            <>
              {comPonto && (
                <Button variant="outline" disabled={saving} onClick={() => onSubmit({ decisao: "ajuste_solicitado", observacao })}>
                  Pedir ajuste do ponto
                </Button>
              )}
              <Button disabled={saving} onClick={() => onSubmit({ decisao: "confirmada", observacao })}>
                {ocorrenciaDeFolga(ocorrencia)
                  ? "Confirmar justificativa"
                  : !comPonto
                    ? "Registrar ciência"
                    : r.horario
                      ? `Aceitar ${r.horario}`
                      : "Aceitar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
