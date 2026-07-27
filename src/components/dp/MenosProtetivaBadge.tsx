import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { baseLegalDe, type AlertaCiencia } from "@/lib/dp/dsr-rules";

interface Props {
  campo: AlertaCiencia["campo"];
  setorComercio: boolean;
  valor: number;
  padrao: number;
}

const fmt = (v: number) =>
  v <= 0 ? "sem exigência de folga dominical" : `1 domingo a cada ${Number.isInteger(v) ? v : v.toFixed(1)} semana(s)`;

/** Badge "Menos protetiva" com popover explicando a base legal da sinalização. */
export function MenosProtetivaBadge({ campo, setorComercio, valor, padrao }: Props) {
  const base = baseLegalDe(campo, setorComercio);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="ml-2 inline-flex align-middle">
          <Badge variant="destructive" className="gap-1">
            Menos protetiva
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Ver base legal</span>
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 text-xs">
        <p className="text-sm font-semibold">{base.titulo}</p>
        <p className="text-muted-foreground">{base.texto}</p>
        <div className="rounded-md border p-2">
          <p>
            <span className="text-muted-foreground">Configurado: </span>
            {fmt(valor)}
          </p>
          <p>
            <span className="text-muted-foreground">Padrão legal: </span>
            {fmt(padrao)}
          </p>
        </div>
        <p className="text-muted-foreground">Fonte: {base.fonte}</p>
        <p className="text-muted-foreground">
          Salvar com esta configuração exige a confirmação de ciência do responsável, registrada no histórico.
        </p>
      </PopoverContent>
    </Popover>
  );
}
