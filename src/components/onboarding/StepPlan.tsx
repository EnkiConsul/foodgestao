import { useNavigate } from "react-router-dom";
import { usePlans } from "@/hooks/usePlans";
import { useCurrentSubscription } from "@/hooks/useCurrentSubscription";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents, formatLimit } from "@/lib/billing";
import type { OnboardingData } from "@/pages/Onboarding";

interface Props {
  data: OnboardingData;
  update: (partial: Partial<OnboardingData>) => void;
}

export function StepPlan({ data, update }: Props) {
  const navigate = useNavigate();
  const { data: plans = [], isLoading } = usePlans();
  const { data: current } = useCurrentSubscription();

  const visible = plans.filter((p: any) => p.is_active && p.is_public);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando planos...</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {visible.map((p: any) => {
        const f = p.features || {};
        const isSelected = data.selectedPlanSlug === p.slug;
        const isCurrent = current?.plan_id === p.id;
        const isPaid = (p.price_cents ?? 0) > 0;
        const needsCheckout = isPaid && !isCurrent;

        return (
          <Card
            key={p.id}
            onClick={() => update({ selectedPlanSlug: p.slug })}
            className={cn(
              "p-4 cursor-pointer transition-colors hover:border-primary/60",
              isSelected && "border-primary border-2 bg-primary/5"
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold">{p.name}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                  {p.description}
                </p>
              </div>
              {isCurrent && <Badge variant="secondary">Atual</Badge>}
            </div>
            <div className="mb-3">
              <span className="text-2xl font-bold">{formatCents(p.price_cents)}</span>
              <span className="text-xs text-muted-foreground">
                /{p.billing_period === "monthly" ? "mês" : "ano"}
              </span>
              {p.trial_days > 0 && (
                <p className="text-xs text-emerald-600 mt-0.5">
                  {p.trial_days} dias grátis
                </p>
              )}
            </div>
            <ul className="space-y-1 text-xs mb-3">
              <li className="flex gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                {formatLimit(f.max_transactions_per_month)} lançamentos/mês
              </li>
              <li className="flex gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                Até {formatLimit(f.max_companies)} {f.max_companies === 1 ? "perfil" : "perfis"}
              </li>
              {f.ai_enabled && (
                <li className="flex gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  Recursos com IA
                </li>
              )}
            </ul>
            {needsCheckout && isSelected && (
              <Button
                size="sm"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/checkout/${p.slug}`);
                }}
              >
                Assinar agora
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}
