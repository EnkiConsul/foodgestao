import { Gift, Loader2 } from "lucide-react";
import { ModuloCard } from "./ModuloCard";
import { MODULES } from "@/lib/modules";

interface Props {
  selectedSlugs: string[];
  onToggle: (slug: string) => void;
}

export function StepModulos({ selectedSlugs, onToggle }: Props) {
  // Usa a lista de módulos do código, não o catálogo do banco.
  // Exibe somente módulos principais (sem parent) e que estejam prontos.
  const modulos = MODULES.filter((m) => m.available && !m.parent);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Selecione os Módulos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha as ferramentas que sua operação vai usar. Você pode ativar mais depois.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-[hsl(var(--onboarding-accent-soft))] p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Gift className="h-4 w-4" />
        </div>
        <div className="text-sm">
          <p className="font-semibold text-foreground">14 dias grátis em todos os módulos</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Após o período de teste, você decide quais manter — cobrança é por módulo, por empresa.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {modulos.map((m) => (
          <ModuloCard
            key={m.slug}
            modulo={m}
            selected={selectedSlugs.includes(m.slug)}
            onToggle={() => onToggle(m.slug)}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {selectedSlugs.length === 0
          ? "Selecione ao menos 1 módulo para continuar"
          : `${selectedSlugs.length} módulo${selectedSlugs.length > 1 ? "s" : ""} selecionado${selectedSlugs.length > 1 ? "s" : ""}`}
      </p>
    </div>
  );
}
