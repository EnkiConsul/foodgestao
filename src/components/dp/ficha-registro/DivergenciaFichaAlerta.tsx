import { ShieldAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { JUSTIFICATIVA_DIVERGENCIA_MIN, type DivergenciaFicha } from "@/lib/dp/ficha-registro/divergencia";

interface Props {
  id: string;
  divergencias: DivergenciaFicha[];
  justificativa: string;
  onJustificativa: (v: string) => void;
  ciente: boolean;
  onCiente: (v: boolean) => void;
  mostrarErro?: boolean;
  titulo?: string;
}

/** Card de divergência com o registro contábil: justificativa + termo de ciência obrigatórios. */
export function DivergenciaFichaAlerta({
  id, divergencias, justificativa, onJustificativa, ciente, onCiente, mostrarErro, titulo,
}: Props) {
  if (divergencias.length === 0) return null;
  const curta = justificativa.trim().length < JUSTIFICATIVA_DIVERGENCIA_MIN;
  return (
    <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <div className="flex items-start gap-2 text-destructive">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{titulo ?? "Divergência com o Registro Contábil da Ficha"}</p>
          <p className="text-[13px] opacity-90">
            O que vai ser gravado difere da ficha de registro (CTPS / eSocial). Divergência com o registro em
            carteira pode caracterizar desvio de função ou alteração contratual sem respaldo.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-background">
        {divergencias.map((d) => (
          <li key={d.campo} className="flex flex-wrap items-baseline gap-2 p-2 text-xs">
            <span className="font-medium">{d.label}</span>
            <span className="text-muted-foreground">Na ficha: {d.ficha}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold">{d.sistema}</span>
          </li>
        ))}
      </ul>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-just`} className="text-xs">Justificativa da divergência *</Label>
        <Textarea
          id={`${id}-just`}
          rows={2}
          value={justificativa}
          onChange={(e) => onJustificativa(e.target.value)}
          placeholder="Ex.: promoção homologada, aditivo contratual assinado, correção pendente na contabilidade."
        />
        {mostrarErro && curta && (
          <p className="text-[11px] text-destructive">
            Descreva o motivo com pelo menos {JUSTIFICATIVA_DIVERGENCIA_MIN} caracteres.
          </p>
        )}
      </div>
      <div className="flex items-start gap-2">
        <Checkbox id={`${id}-ciente`} checked={ciente} onCheckedChange={(v) => onCiente(v === true)} />
        <Label htmlFor={`${id}-ciente`} className="text-xs font-normal leading-snug">
          Estou ciente de que estas informações diferem do registro oficial na ficha e assumo a responsabilidade
          pela divergência.
        </Label>
      </div>
      {mostrarErro && !ciente && <p className="text-[11px] text-destructive">Confirme a ciência para continuar.</p>}
    </div>
  );
}
