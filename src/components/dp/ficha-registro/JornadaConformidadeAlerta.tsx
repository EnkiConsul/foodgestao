import { Clock, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { JUSTIFICATIVA_DIVERGENCIA_MIN } from "@/lib/dp/ficha-registro/divergencia";
import type { InconformidadeJornada } from "@/lib/dp/ficha-registro/jornada-parse";

interface Props {
  id: string;
  inconformidades: InconformidadeJornada[];
  justificativa: string;
  onJustificativa: (v: string) => void;
  ciente: boolean;
  onCiente: (v: boolean) => void;
  mostrarErro?: boolean;
  /** Completa o intervalo mínimo da CLT nos dias abaixo dele (null = não há o que completar). */
  onIntervaloMinimo?: (() => void) | null;
  /** Confirma 1 folga por semana definida na escala (só quando a ficha lista os 7 dias). */
  onFolgaNaEscala?: (() => void) | null;
  /** Plantão longo (11h ou mais): talvez seja escala 12x36. */
  plantaoLongo?: boolean;
}

/**
 * Jornada fora da CLT na conferência da ficha: corrigir em um toque ou registrar
 * a ciência com justificativa. Sem um dos dois, o cadastro não é criado.
 */
export function JornadaConformidadeAlerta({
  id, inconformidades, justificativa, onJustificativa, ciente, onCiente, mostrarErro,
  onIntervaloMinimo, onFolgaNaEscala, plantaoLongo,
}: Props) {
  if (inconformidades.length === 0) return null;
  const curta = justificativa.trim().length < JUSTIFICATIVA_DIVERGENCIA_MIN;
  const temIntervalo = inconformidades.some((i) => i.codigo === "intervalo" || i.codigo === "intervalo_reduzido");
  const temDescanso = inconformidades.some((i) => i.codigo === "descanso_semanal");
  const temReduzido = inconformidades.some((i) => i.codigo === "intervalo_reduzido");
  const sugestoes = [
    temReduzido ? "Intervalo de 30 min previsto na convenção coletiva da categoria." : null,
    plantaoLongo ? "Escala 12x36 prevista em convenção ou acordo (art. 59-A da CLT)." : null,
    "Horário confirmado com a contabilidade conforme o contrato.",
  ].filter((s): s is string => !!s);

  return (
    <div id={id} role="alert" className="mt-3 scroll-mt-20 space-y-3 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
      <div className="flex items-start gap-2">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">Horário fora da CLT</p>
          <p className="text-xs text-muted-foreground">
            Corrija o horário ou, se for assim mesmo, registre a ciência com o motivo. Sem um dos dois o cadastro não é criado.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {inconformidades.map((i) => (
          <li key={i.codigo} className="rounded-md border bg-background p-2 text-xs leading-relaxed">
            <p className="font-medium">{i.titulo}</p>
            <p className="text-muted-foreground">{i.detalhe}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{i.fundamento}</p>
          </li>
        ))}
      </ul>

      {((temIntervalo && onIntervaloMinimo) || (temDescanso && onFolgaNaEscala)) && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Corrigir em um toque</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {temIntervalo && onIntervaloMinimo && (
              <Button type="button" variant="outline" className="h-10 justify-start bg-background" onClick={onIntervaloMinimo}>
                <Clock className="mr-2 h-4 w-4" /> Completar intervalo mínimo
              </Button>
            )}
            {temDescanso && onFolgaNaEscala && (
              <Button type="button" variant="outline" className="h-10 justify-start bg-background" onClick={onFolgaNaEscala}>
                <Clock className="mr-2 h-4 w-4" /> 1 folga por semana na escala
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            O horário corrigido fica diferente da ficha: avise a contabilidade para atualizar o registro.
          </p>
        </div>
      )}

      {plantaoLongo && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Se for escala 12x36, registre a ciência abaixo e, depois de criar o cadastro, escolha "Escala 12x36" em Turno e
          Jornada, na ficha do colaborador, com a data do primeiro plantão.
        </p>
      )}

      <div className="space-y-2 border-t border-warning/30 pt-3">
        <Label htmlFor={`${id}-just`} className="text-xs font-medium">Manter assim: motivo</Label>
        <div className="flex flex-wrap gap-1.5">
          {sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full border bg-background px-2.5 py-1 text-left text-[11px] hover:bg-muted"
              onClick={() => onJustificativa(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <Textarea
          id={`${id}-just`}
          rows={2}
          value={justificativa}
          onChange={(e) => onJustificativa(e.target.value)}
          placeholder="Ex.: jornada prevista na convenção coletiva da categoria"
          className="bg-background text-sm"
        />
        {mostrarErro && curta && (
          <p className="text-[11px] text-destructive">Escreva o motivo com pelo menos {JUSTIFICATIVA_DIVERGENCIA_MIN} caracteres.</p>
        )}
        <label className="flex items-start gap-2 text-xs leading-relaxed">
          <Checkbox checked={ciente} onCheckedChange={(v) => onCiente(v === true)} className="mt-0.5" />
          <span>
            Estou ciente dos limites da CLT e assumo a responsabilidade por cadastrar este horário. A ciência fica registrada
            com meu usuário, data e hora.
          </span>
        </label>
        {mostrarErro && !ciente && <p className="text-[11px] text-destructive">Marque a ciência para manter este horário.</p>}
      </div>
    </div>
  );
}
