import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Uma linha do aviso: rótulo do campo, valor do padrão e valor deste cadastro. */
export interface ItemDivergencia {
  rotulo: string;
  padrao: string;
  atual: string;
}

interface Props {
  /** De onde vem o padrão: "cargo em unidade", "unidade" ou "empresa". */
  origem: string;
  diferencas: ItemDivergencia[];
  onAplicar: () => void;
  onDispensar: () => void;
}


/**
 * Cadastro já existente que difere do padrão vigente. Só avisa — nada é
 * alterado sem o usuário clicar, porque exceções combinadas são legítimas.
 */
export function PadraoDivergenciaAviso({ origem, diferencas, onAplicar, onDispensar }: Props) {
  if (!diferencas.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-foreground">
            Este cadastro está fora do padrão {origem}
          </p>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {diferencas.map((d) => (
              <li key={d.campo}>
                <span className="text-foreground">{d.rotulo}:</span> padrão {d.padrao} • neste
                cadastro {d.atual}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" onClick={onAplicar}>
              Aplicar padrão
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDispensar}>
              Manter como está
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
