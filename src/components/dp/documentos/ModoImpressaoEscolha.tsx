import { cn } from "@/lib/utils";

/**
 * Escolha do formato de impressão de termos/recibos:
 * validação digital (com assinaturas e carimbos) ou folha limpa para assinar à mão,
 * sem data de emissão do sistema e com a data em branco.
 */
export function ModoImpressaoEscolha({ manual, onChange }: { manual: boolean; onChange: (v: boolean) => void }) {
  const opcoes = [
    { v: false, label: "Com Validação Digital" },
    { v: true, label: "Para Assinar à Mão" },
  ];
  return (
    <div className="space-y-1">
      <div role="radiogroup" aria-label="Formato de impressão" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {opcoes.map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={manual === o.v}
            onClick={() => onChange(o.v)}
            className={cn(
              "min-h-10 rounded-md px-2 text-xs font-medium transition-colors",
              manual === o.v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {manual && (
        <p className="text-xs text-muted-foreground">
          Sai sem data de emissão e sem carimbos digitais, com linha de assinatura e data em branco.
        </p>
      )}
    </div>
  );
}
