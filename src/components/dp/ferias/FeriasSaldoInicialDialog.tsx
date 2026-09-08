import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FeriasPeriodo } from "@/hooks/useDpFerias";

type Props = {
  periodo: FeriasPeriodo | null;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (dias: number, observacao: string | null) => void;
};

/** Saldo de dias que a pessoa já tinha antes de o sistema controlar as férias. */
export function FeriasSaldoInicialDialog({ periodo, saving, onOpenChange, onSubmit }: Props) {
  const [dias, setDias] = useState("30");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!periodo) return;
    setDias(String(periodo.dias_direito ?? 30));
    setObs(periodo.saldo_inicial_obs ?? "");
  }, [periodo]);

  const valor = Math.max(0, Math.min(30, Number(dias) || 0));

  return (
    <Dialog open={!!periodo} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Saldo Trazido de Fora</DialogTitle>
          <DialogDescription>
            Informe quantos dias de férias {periodo?.colaborador_nome ?? "a pessoa"} realmente tem
            neste período, conforme o controle anterior da contabilidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Dias de direito neste período
            </Label>
            <Input
              type="number" min={0} max={30}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Observação (opcional)
            </Label>
            <Textarea
              rows={3}
              placeholder="De onde vem esse saldo, por exemplo o relatório da contabilidade."
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="rounded-full px-6"
            disabled={saving}
            onClick={() => onSubmit(valor, obs.trim() || null)}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
