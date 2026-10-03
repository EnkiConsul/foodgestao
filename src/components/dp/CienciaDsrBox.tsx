import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  texto: string;
  ciente: boolean;
  onChange: (v: boolean) => void;
  /** Frase da ciência; muda entre colaborador e gestor. */
  declaracao?: string;
};

/** Alerta de mais de 6 dias seguidos sem descanso com ciência obrigatória. */
export function CienciaDsrBox({
  texto,
  ciente,
  onChange,
  declaracao = "Estou ciente de que esta alteração resultará em mais de 6 dias consecutivos de trabalho e solicito por minha livre conveniência.",
}: Props) {
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <p className="font-semibold">Atenção trabalhista: {texto}</p>
      <label className="flex items-start gap-2 font-medium">
        <Checkbox checked={ciente} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
        <span>{declaracao}</span>
      </label>
    </div>
  );
}
