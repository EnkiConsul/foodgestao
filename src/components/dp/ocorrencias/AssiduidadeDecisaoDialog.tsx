import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

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
import type { Ocorrencia } from "@/hooks/useDpOcorrencias";
import { TIPO_LABEL } from "@/lib/dp/ocorrencias";

interface Props {
  ocorrencia: Ocorrencia | null;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onDecidir: (input: { perde: boolean; observacao: string | null }) => void;
}

/** Decisão do gestor sobre o prêmio de assiduidade da ocorrência. */
export function AssiduidadeDecisaoDialog({ ocorrencia, saving, onOpenChange, onDecidir }: Props) {
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (ocorrencia) setObservacao("");
  }, [ocorrencia?.id]);

  const data = ocorrencia
    ? new Date(`${ocorrencia.data_operacional}T12:00:00`).toLocaleDateString("pt-BR")
    : "";

  return (
    <Dialog open={!!ocorrencia} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Prêmio de assiduidade
          </DialogTitle>
          <DialogDescription>
            {ocorrencia
              ? `${ocorrencia.colaborador?.nome ?? "Colaborador"} · ${TIPO_LABEL[ocorrencia.tipo]} de ${data}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {ocorrencia?.assiduidade_risco_motivo && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
            {ocorrencia.assiduidade_risco_motivo}
          </p>
        )}

        <div className="space-y-1.5">
          <Label>Motivo (obrigatório para manter o prêmio)</Label>
          <Textarea
            rows={3}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex: Atraso causado por falta de ônibus, comprovado pelo colaborador."
          />
          <p className="text-xs text-muted-foreground">
            O colaborador é avisado quando a ocorrência descontar o prêmio.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            variant="outline"
            disabled={saving || !observacao.trim()}
            onClick={() => onDecidir({ perde: false, observacao: observacao.trim() })}
          >
            Mantém o prêmio
          </Button>
          <Button
            disabled={saving}
            onClick={() => onDecidir({ perde: true, observacao: observacao.trim() || null })}
          >
            Perde o prêmio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
