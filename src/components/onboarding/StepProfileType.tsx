import { Card, CardContent } from "@/components/ui/card";
import { User, Briefcase, Building2, Shuffle } from "lucide-react";
import type { OnboardingData } from "@/pages/Onboarding";
import { cn } from "@/lib/utils";

const profiles = [
  { value: "pf", label: "Pessoa Física", desc: "Finanças pessoais", icon: User },
  { value: "mei", label: "MEI", desc: "Microempreendedor Individual", icon: Briefcase },
  { value: "microempresa", label: "Microempresa", desc: "Empresa de pequeno porte", icon: Building2 },
  { value: "hibrido", label: "Híbrido", desc: "PF + PJ no mesmo painel", icon: Shuffle },
];

interface Props {
  data: OnboardingData;
  update: (d: Partial<OnboardingData>) => void;
}

export function StepProfileType({ data, update }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Selecione o tipo de perfil que melhor se encaixa:</p>
      <div className="grid grid-cols-2 gap-3">
        {profiles.map((p) => (
          <Card
            key={p.value}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              data.profileType === p.value && "ring-2 ring-primary shadow-md"
            )}
            onClick={() => update({ profileType: p.value })}
          >
            <CardContent className="flex flex-col items-center text-center gap-2 p-4">
              <p.icon className={cn("h-8 w-8", data.profileType === p.value ? "text-primary" : "text-muted-foreground")} />
              <span className="text-sm font-medium">{p.label}</span>
              <span className="text-xs text-muted-foreground">{p.desc}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
