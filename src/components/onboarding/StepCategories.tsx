import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { OnboardingData } from "@/pages/Onboarding";

const suggestedCategories = [
  { group: "Despesas Pessoais", items: ["Alimentação", "Transporte", "Moradia", "Saúde", "Educação", "Lazer", "Vestuário"] },
  { group: "Despesas Empresariais", items: ["Fornecedores", "Folha de Pagamento", "Impostos", "Marketing", "Aluguel Comercial", "Serviços"] },
  { group: "Receitas", items: ["Salário", "Freelance", "Vendas", "Investimentos", "Outros"] },
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Selecione categorias sugeridas:</p>
        <button onClick={selectAll} className="text-xs text-primary hover:underline">
          Selecionar todas
        </button>
      </div>

      <div className="space-y-5 max-h-[300px] overflow-y-auto pr-1">
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
