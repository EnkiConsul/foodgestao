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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONFIRMACAO_DE, TIPO_LABEL, minutosEntre } from "@/lib/dp/ocorrencias";
import type { Ocorrencia } from "@/hooks/useDpOcorrencias";

interface Props {
  ocorrencia: Ocorrencia | null;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  onConfirm: (input: { horarioReal: string | null; justificativaFinal: string | null }) => void;
  onNaoAconteceu: (motivo: string) => void;
}

/** Transforma a previsão no fato confirmado — mesma ocorrência, sem duplicar. */
export function OcorrenciaConfirmarDialog({
  ocorrencia,
  onOpenChange,
  saving,
  onConfirm,
  onNaoAconteceu,
}: Props) {
  const [horarioReal, setHorarioReal] = useState("");
  const [texto, setTexto] = useState("");

  useEffect(() => {
    setHorarioReal(ocorrencia?.horario_estimado?.slice(0, 5) ?? "");
    setTexto("");
  }, [ocorrencia?.id, ocorrencia?.horario_estimado]);

  if (!ocorrencia) return null;
  const destino = CONFIRMACAO_DE[ocorrencia.tipo] ?? ocorrencia.tipo;
  const pedeHorario = destino !== "falta";
  const previsto = ocorrencia.horario_previsto?.slice(0, 5) ?? null;
  const minutos = minutosEntre(previsto, horarioReal);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar {TIPO_LABEL[destino].toLowerCase()}</DialogTitle>
          <DialogDescription>
            {ocorrencia.colaborador?.nome} — rotina de{" "}
            {new Date(`${ocorrencia.data_operacional}T12:00:00`).toLocaleDateString("pt-BR")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {previsto && (
            <p className="text-sm text-muted-foreground">
              Horário previsto: <strong>{previsto}</strong>
              {ocorrencia.horario_estimado && (
                <>
                  {" "}
                  · estimado: <strong>{ocorrencia.horario_estimado.slice(0, 5)}</strong>
                </>
              )}
            </p>
          )}
          {pedeHorario && (
            <div className="space-y-1.5">
              <Label>Horário real</Label>
              <Input type="time" value={horarioReal} onChange={(e) => setHorarioReal(e.target.value)} />
              {minutos !== null && (
                <p className="text-xs text-muted-foreground">Diferença de {minutos} minutos.</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Justificativa final</Label>
            <Textarea
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="A justificativa informada antes continua guardada."
            />
            {ocorrencia.justificativa_inicial && (
              <p className="text-xs text-muted-foreground">
                Informado antes: “{ocorrencia.justificativa_inicial}”
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="sm:mr-auto"
            disabled={saving || !texto.trim()}
            onClick={() => onNaoAconteceu(texto.trim())}
          >
            Não aconteceu
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            disabled={saving || (pedeHorario && !horarioReal)}
            onClick={() =>
              onConfirm({
                horarioReal: pedeHorario ? horarioReal || null : null,
                justificativaFinal: texto.trim() || null,
              })
            }
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
