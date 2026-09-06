import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MOTIVO_PARCIAL_TEXTO, formatarMinutos, janelaMinutos, trechosDescobertos, validarHorarioParcial,
} from "@/lib/dp/convocacoes-parcial";

const hhmm = (v: string | null | undefined) => (v ? String(v).slice(0, 5) : "");

export interface PropostaParcialDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loading?: boolean;
  necessidade: { entrada: string; saida: string; termina_no_dia_seguinte?: boolean | null };
  onConfirm: (p: {
    entrada: string;
    saida: string;
    termina_no_dia_seguinte: boolean;
    observacao: string | null;
  }) => void;
}

/**
 * O colaborador informa até quando/desde quando consegue vir naquele dia.
 * Só é possível ENCURTAR a janela pedida — a mesma regra vale no servidor.
 */
export function PropostaParcialDialog({
  open, onOpenChange, loading, necessidade, onConfirm,
}: PropostaParcialDialogProps) {
  const [entrada, setEntrada] = useState(hhmm(necessidade.entrada));
  const [saida, setSaida] = useState(hhmm(necessidade.saida));
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    setEntrada(hhmm(necessidade.entrada));
    setSaida(hhmm(necessidade.saida));
    setObservacao("");
  }, [open, necessidade.entrada, necessidade.saida]);

  const { validacao, descoberto, viraODia } = useMemo(() => {
    // A saída "vira o dia" sempre que for menor ou igual à entrada proposta.
    const bruto = janelaMinutos({ entrada, saida });
    const vira = !!bruto && bruto.fim > 1440;
    const parcial = { entrada, saida, termina_no_dia_seguinte: vira };
    return {
      validacao: validarHorarioParcial(necessidade, parcial),
      descoberto: trechosDescobertos(necessidade, parcial),
      viraODia: vira,
    };
  }, [entrada, saida, necessidade]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Posso vir parte do horário
          </DialogTitle>
          <DialogDescription>
            Horário pedido: {hhmm(necessidade.entrada)} → {hhmm(necessidade.saida)}
            {necessidade.termina_no_dia_seguinte ? " (do dia seguinte)" : ""}. Informe o horário que
            você consegue cumprir — dentro desse período.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="parcial-entrada">Chego às</Label>
            <Input
              id="parcial-entrada" type="time" value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parcial-saida">Saio às</Label>
            <Input
              id="parcial-saida" type="time" value={saida}
              onChange={(e) => setSaida(e.target.value)}
            />
          </div>
        </div>

        {validacao.ok ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-1">
            <p>
              Você cobre {formatarMinutos(validacao.minutos)}
              {viraODia ? " (saída no dia seguinte)" : ""}.
            </p>
            {descoberto && descoberto.total > 0 ? (
              <p className="text-muted-foreground">
                Ficam descobertos {formatarMinutos(descoberto.total)}
                {descoberto.inicio > 0 ? ` no começo (${formatarMinutos(descoberto.inicio)})` : ""}
                {descoberto.inicio > 0 && descoberto.fim > 0 ? " e" : ""}
                {descoberto.fim > 0 ? ` no fim (${formatarMinutos(descoberto.fim)})` : ""}.
              </p>
            ) : null}
            <p className="text-muted-foreground">
              O dia fica reservado para você até o gestor aprovar ou recusar.
            </p>
          </div>
        ) : (
          <p className="text-sm text-destructive">{MOTIVO_PARCIAL_TEXTO[validacao.motivo]}</p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="parcial-obs">Recado para o gestor (opcional)</Label>
          <Textarea
            id="parcial-obs" rows={3} value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: consigo chegar mais tarde por causa de um compromisso."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Voltar
          </Button>
          <Button
            disabled={!ok || loading}
            onClick={() =>
              onConfirm({
                entrada,
                saida,
                termina_no_dia_seguinte: viraODia,
                observacao: observacao.trim() || null,
              })
            }
          >
            Enviar para aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
