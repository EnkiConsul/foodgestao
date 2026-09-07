import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { diasDireitoPorFaltas, exigeRevisaoAdministrativa } from "@/lib/dp/ferias-direito";
import type { FeriasPeriodo } from "@/hooks/useDpFerias";

const fmt = (iso: string) => format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });

type Props = {
  periodo: FeriasPeriodo | null;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSubmit: (faltas: number, motivo: string | null) => void;
};

/** Informe manual das faltas injustificadas computáveis para férias. */
export function FeriasFaltasDialog({ periodo, onOpenChange, saving, onSubmit }: Props) {
  const [faltas, setFaltas] = useState("0");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!periodo) return;
    setFaltas(String(periodo.faltas_injustificadas ?? 0));
    setMotivo("");
  }, [periodo]);

  const valor = Number.parseInt(faltas, 10);
  const valido = Number.isFinite(valor) && valor >= 0;
  const jaInformado = periodo?.faltas_injustificadas !== null && periodo?.faltas_injustificadas !== undefined;
  const alterou = jaInformado && valor !== periodo?.faltas_injustificadas;
  const precisaMotivo = alterou && motivo.trim().length === 0;
  const direito = valido ? diasDireitoPorFaltas(valor) : null;
  const revisao = valido && exigeRevisaoAdministrativa(valor);

  return (
    <Dialog open={!!periodo} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Faltas do período aquisitivo</DialogTitle>
          <DialogDescription>
            Informe somente faltas que devem ser consideradas para fins de férias. Ausências
            justificadas não devem ser incluídas.
          </DialogDescription>
        </DialogHeader>

        {periodo && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <p className="font-semibold">{periodo.colaborador_nome ?? "Colaborador"}</p>
              <p className="text-muted-foreground">
                Período: {fmt(periodo.inicio_aquisitivo)} a {fmt(periodo.fim_aquisitivo)}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ferias-faltas">Faltas injustificadas computáveis</Label>
              <Input
                id="ferias-faltas"
                type="number"
                min={0}
                inputMode="numeric"
                value={faltas}
                onChange={(e) => setFaltas(e.target.value)}
              />
            </div>

            {direito !== null && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {revisao ? (
                  <Badge className="bg-destructive/15 text-destructive">
                    Exige revisão administrativa
                  </Badge>
                ) : (
                  <>
                    <span className="text-muted-foreground">Direito apurado:</span>
                    <Badge variant="outline">{direito} dias</Badge>
                  </>
                )}
              </div>
            )}

            {alterou && (
              <div className="space-y-1.5">
                <Label htmlFor="ferias-faltas-motivo">Motivo da alteração</Label>
                <Textarea
                  id="ferias-faltas-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: correção após conferência das folhas de ponto"
                />
                <p className="text-xs text-muted-foreground">
                  O valor anterior ({periodo.faltas_injustificadas}) fica guardado no histórico.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!valido || precisaMotivo || saving}
            onClick={() => onSubmit(valor, motivo.trim() || null)}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
