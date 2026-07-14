import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import type { OnboardingData } from "@/pages/Onboarding";

const suggestedCategories = [
  { group: "Despesas Pessoais", items: ["Alimentação", "Transporte", "Moradia", "Saúde", "Educação", "Lazer", "Vestuário"] },
  { group: "Receitas Pessoais", items: ["Salário", "Freelance", "Investimentos", "Outros"] },
];

interface Props {
  data: OnboardingData;
  update: (d: Partial<OnboardingData>) => void;
}

export function StepCategories({ data, update }: Props) {
  const toggle = (name: string) => {
    const selected = data.selectedCategories.includes(name)
      ? data.selectedCategories.filter((c) => c !== name)
      : [...data.selectedCategories, name];
    update({ selectedCategories: selected });
  };

  const selectAll = () => {
    const all = suggestedCategories.flatMap((g) => g.items);
    update({ selectedCategories: all });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex gap-2">
        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Plano padrão 360°FOOD</p>
          <p className="text-xs text-muted-foreground">
            Toda empresa cadastrada recebe automaticamente as <strong>69 categorias</strong> do plano padrão
            para food service, organizadas em 4 níveis (Receitas, Custos, Despesas, Impostos e Investimentos).
            Você poderá editar, excluir ou criar novas categorias à vontade depois.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Categorias adicionais para Pessoa Física:</p>
        <button onClick={selectAll} className="text-xs text-primary hover:underline">
          Selecionar todas
        </button>
      </div>

      <div className="space-y-5 max-h-[240px] overflow-y-auto pr-1">
        {suggestedCategories.map((group) => (
          <div key={group.group} className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.group}</h3>
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => (
                <Label
                  key={item}
                  className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-md hover:bg-muted transition-colors"
                >
                  <Checkbox
                    checked={data.selectedCategories.includes(item)}
                    onCheckedChange={() => toggle(item)}
                  />
                  {item}
                </Label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
