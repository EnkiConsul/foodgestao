import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Qualquer alerta com campo e mensagem — folga dominical, intervalo etc. */
export interface AlertaCienciaExibivel {
  campo: string;
  mensagem: string;
}

interface Props {
  open: boolean;
  alertas: AlertaCienciaExibivel[];
  titulo?: string;
  onCancel: () => void;
  onConfirm: (justificativa: string) => void;
  confirming?: boolean;
}

/**
 * Modal de ciência exibido quando o admin configura uma periodicidade de folga
 * dominical menos protetiva que o padrão legal. Não bloqueia a operação: exige
 * confirmação explícita, que fica registrada em dp_regras_historico.
 */
export function CienciaLegalDialog({ open, alertas, onCancel, onConfirm, confirming }: Props) {
  const [ciente, setCiente] = useState(false);
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (open) {
      setCiente(false);
      setJustificativa("");
    }
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            Periodicidade menos protetiva que o padrão legal
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <ul className="space-y-2">
                {alertas.map((a) => (
                  <li key={a.campo} className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    {a.mensagem}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                A responsabilidade pela adoção de regra diversa da referência legal é da empresa. Esta confirmação,
                seu usuário e o horário ficam registrados no histórico de regras.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ciencia-justificativa">Justificativa (opcional)</Label>
            <Textarea
              id="ciencia-justificativa"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: previsão em acordo coletivo vigente (CCT 2026)."
              rows={3}
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="ciencia-check" checked={ciente} onCheckedChange={(v) => setCiente(v === true)} />
            <Label htmlFor="ciencia-check" className="text-sm font-normal leading-snug">
              Estou ciente de que a configuração é menos protetiva que o padrão legal e assumo a responsabilidade.
            </Label>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ciente || confirming}
            onClick={(e) => { e.preventDefault(); onConfirm(justificativa.trim()); }}
          >
            {confirming ? "Salvando..." : "Confirmar e salvar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
