import { Checkbox } from "@/components/ui/checkbox";

export const TEXTO_CIENCIA_FALTA_TROCA =
  "Estou ciente de que, depois de efetivada a troca, o dia que cedi passa a ser dia normal de trabalho, mesmo que antes fosse minha folga fixa. Se eu não comparecer, será considerado falta, com os descontos previstos em lei (Art. 473 da CLT e Lei 605/1949, que trata da perda do descanso semanal remunerado).";

type Props = { ciente: boolean; onChange: (v: boolean) => void };

/** Ciência obrigatória: o dia cedido na troca vira dia de trabalho e a ausência é falta. */
export function CienciaFaltaTrocaBox({ ciente, onChange }: Props) {
  return (
    <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
      <label className="flex items-start gap-2 font-medium">
        <Checkbox checked={ciente} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
        <span>{TEXTO_CIENCIA_FALTA_TROCA}</span>
      </label>
    </div>
  );
}
