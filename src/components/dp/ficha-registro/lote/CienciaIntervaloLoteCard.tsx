import { useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import { JUSTIFICATIVA_DIVERGENCIA_MIN, cienciaDivergenciaValida } from "@/lib/dp/ficha-registro/divergencia";
import type { CienciaIntervaloLote } from "@/lib/dp/ficha-registro/organizacao-lote";

const SUGESTAO = "Intervalo de 30 min previsto na convenção coletiva da categoria.";

interface Props {
  /** Fichas pendentes com mais de 6h de trabalho e intervalo de 30 a 59 min. */
  quantidade: number;
  ciencia: CienciaIntervaloLote | null;
  salvando: boolean;
  onSalvar: (justificativa: string) => Promise<void>;
  onDesfazer: () => Promise<void>;
}

/**
 * Ciência única do lote para o intervalo reduzido (CLT art. 71 e 611-A, III):
 * vale para todas as fichas de 30 min; o resto da jornada fora da CLT continua
 * com ciência ficha por ficha.
 */
export function CienciaIntervaloLoteCard({ quantidade, ciencia, salvando, onSalvar, onDesfazer }: Props) {
  const [aberto, setAberto] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [ciente, setCiente] = useState(false);
  const [tentou, setTentou] = useState(false);
  if (quantidade === 0 && !ciencia) return null;

  const valido = cienciaDivergenciaValida(justificativa, ciente);
  const quando = ciencia?.em
    ? new Date(ciencia.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : null;

  if (ciencia) {
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <p className="min-w-0 text-xs leading-relaxed">
              <span className="font-medium">Intervalo de 30 min com ciência do lote{quando ? ` (${quando})` : ""}.</span>{" "}
              <span className="text-muted-foreground">“{ciencia.justificativa}”</span>
            </p>
          </div>
          <Button variant="ghost" size="sm" className="h-9 shrink-0" disabled={salvando} onClick={() => onDesfazer()}>
            Desfazer
          </Button>
        </CardContent>
      </Card>
    );
  }

  const salvar = async () => {
    setTentou(true);
    if (!valido) return;
    try {
      await onSalvar(justificativa.trim());
      setAberto(false);
    } catch { /* a mensagem de erro já foi mostrada */ }
  };

  return (
    <>
      <Card className="border-warning/50 bg-warning/10">
        <CardContent className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="min-w-0 text-xs leading-relaxed">
              <span className="font-medium">
                {quantidade} {quantidade === 1 ? "ficha tem" : "fichas têm"} intervalo de 30 min em jornada acima de 6h.
              </span>{" "}
              A CLT pede 1h; menos que isso só com convenção ou acordo coletivo. Registre a ciência uma vez para o lote.
            </p>
          </div>
          <Button size="sm" className="h-10 shrink-0" onClick={() => setAberto(true)}>
            Registrar ciência
          </Button>
        </CardContent>
      </Card>

      <ResponsiveDialog
        open={aberto}
        onOpenChange={(o) => !salvando && setAberto(o)}
        title="Intervalo de 30 min no lote"
        description="Vale para todas as fichas deste lote com intervalo entre 30 e 59 min. Intervalo menor que 30 min, falta de intervalo, carga acima de 44h ou semana sem descanso continuam pedindo ciência em cada ficha."
        className="sm:max-w-lg"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="h-11" disabled={salvando} onClick={() => setAberto(false)}>Cancelar</Button>
            <Button className="h-11" disabled={salvando} onClick={salvar}>
              {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Registrar ciência
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">CLT, art. 71 e art. 611-A, III.</p>
          <div className="space-y-2">
            <Label htmlFor="ciencia-intervalo-lote" className="text-xs font-medium">Motivo</Label>
            <button
              type="button"
              className="rounded-full border bg-background px-2.5 py-1 text-left text-[11px] hover:bg-muted"
              onClick={() => setJustificativa(SUGESTAO)}
            >
              {SUGESTAO}
            </button>
            <Textarea
              id="ciencia-intervalo-lote"
              rows={3}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: convenção coletiva SECHSEG 2026, cláusula do intervalo"
            />
            {tentou && justificativa.trim().length < JUSTIFICATIVA_DIVERGENCIA_MIN && (
              <p className="text-[11px] text-destructive">Escreva o motivo com pelo menos {JUSTIFICATIVA_DIVERGENCIA_MIN} caracteres.</p>
            )}
          </div>
          <label className="flex items-start gap-2 text-xs leading-relaxed">
            <Checkbox checked={ciente} onCheckedChange={(v) => setCiente(v === true)} className="mt-0.5" />
            <span>
              Confirmo que o intervalo reduzido está previsto em norma coletiva e assumo a responsabilidade. A ciência fica
              registrada com meu usuário, data e hora, e em cada colaborador criado.
            </span>
          </label>
          {tentou && !ciente && <p className="text-[11px] text-destructive">Marque a ciência para continuar.</p>}
        </div>
      </ResponsiveDialog>
    </>
  );
}
