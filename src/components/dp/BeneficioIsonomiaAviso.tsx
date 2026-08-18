import { AlertTriangle, Scale, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { descreverPadraoGrupo, type DivergenciaIsonomia } from "@/lib/dp/beneficios-regras";

interface Props {
  divergencias: DivergenciaIsonomia[];
  /** Iguala o benefício ao padrão do grupo, quando houver ação possível. */
  onAplicarPadrao?: (d: DivergenciaIsonomia) => void;
}

/**
 * Aviso permanente de isonomia na aba Remuneração: o risco aparece enquanto a
 * pessoa edita, não apenas em um diálogo no momento de salvar.
 */
export function BeneficioIsonomiaAviso({ divergencias, onAplicarPadrao }: Props) {
  if (divergencias.length === 0) return null;

  return (
    <div className="col-span-2 space-y-3 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Atenção à isonomia: {divergencias.length}{" "}
            {divergencias.length === 1 ? "benefício diverge" : "benefícios divergem"} do grupo
          </p>
          <p className="text-xs text-muted-foreground">
            Colegas em situação equivalente recebem condições diferentes deste cadastro.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {divergencias.map((d) => (
          <li key={`${d.chave}-${d.tipo}`} className="rounded-lg border border-amber-500/40 bg-background/70 p-3 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <Scale className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
              {d.titulo}
            </p>
            <p className="mt-1 text-muted-foreground">{d.mensagem}</p>
            <p className="mt-1 text-muted-foreground">
              Recebem: {d.colegas.slice(0, 4).join(", ")}
              {d.colegas.length > 4 ? ` e mais ${d.colegas.length - 4}` : ""}.
              {descreverPadraoGrupo(d) ? ` Padrão do grupo: ${descreverPadraoGrupo(d)}.` : ""}
            </p>
            <p className="mt-1 text-muted-foreground">{d.recomendacao}</p>
            {onAplicarPadrao && (
              <Button
                type="button" size="sm" variant="outline" className="mt-2 gap-2"
                onClick={() => onAplicarPadrao(d)}
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                Aplicar como os colegas
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
