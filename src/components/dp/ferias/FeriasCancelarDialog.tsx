import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FeriasGozo } from "@/hooks/useDpFerias";

type Props = {
  gozo: (FeriasGozo & { colaborador_nome?: string | null }) | null;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSubmit: (motivo: string) => void;
};

const fmt = (iso: string) => format(parseISO(iso), "dd/MM/yyyy");

/** Cancelamento de férias com motivo — o registro fica no histórico. */
export function FeriasCancelarDialog({ gozo, onOpenChange, saving, onSubmit }: Props) {
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (gozo) setMotivo("");
  }, [gozo]);

  return (
    <DpDialogShell
      open={!!gozo}
      onOpenChange={onOpenChange}
      title="Cancelar férias"
      description={
        gozo
          ? `${gozo.colaborador_nome ?? "Colaborador"} · ${fmt(gozo.data_inicio)} a ${fmt(gozo.data_fim)}`
          : undefined
      }
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button
            variant="destructive"
            disabled={saving || motivo.trim().length < 3}
            onClick={() => onSubmit(motivo.trim())}
          >
            {saving ? "Cancelando…" : "Cancelar férias"}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
          <Label>Motivo do cancelamento</Label>
          <Textarea
            rows={3}
            value={motivo}
            placeholder="Ex.: necessidade da operação, pedido do colaborador…"
            onChange={(e) => setMotivo(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            O registro não é apagado: ele fica no histórico com o motivo e a data do cancelamento.
          </p>
      </div>
    </DpDialogShell>
  );
}
