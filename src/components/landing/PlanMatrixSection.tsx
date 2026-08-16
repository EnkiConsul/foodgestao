import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useLandingSection } from "@/hooks/useLandingContent";
import { formatCents } from "@/lib/billing";
import { PLAN_MATRIX_ROWS, type PlanFeatureMap } from "@/lib/landing/planMatrix";
import { FIDELIDADE_INSTALLMENTS } from "@/lib/billing/fidelidade360";

type Plan = {
  id: string;
  name: string;
  price_cents: number;
  sort_order: number;
  features: PlanFeatureMap | null;
};

/** Comparativo completo dos planos do módulo Financeiro. */
export function PlanMatrixSection() {
  const c = useLandingSection("plan_matrix");
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("plans")
        .select("id, name, price_cents, sort_order, features")
        .eq("is_active", true)
        .eq("is_public", true)
        .order("sort_order", { ascending: true });
      setPlans(((data as Plan[]) ?? []).filter((p) => (p.features?.solution ?? "financeiro") === "financeiro"));
    })();
  }, []);

  if (plans.length === 0) return null;

  return (
    <section id="comparativo" className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            {c.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{c.title}</h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">{c.subtitle}</p>
        </div>

        <Card className="mx-auto mt-8 max-w-5xl overflow-x-auto border-border/60 sm:mt-10">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">{c.col_resource}</th>
                {plans.map((p) => (
                  <th key={p.id} className="px-4 py-3 text-center font-semibold text-foreground">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_MATRIX_ROWS.map((row, i) => (
                <tr key={row.label} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                  <td className={`px-4 py-3 ${row.strong ? "font-semibold" : "text-foreground/90"}`}>
                    {row.label}
                  </td>
                  {plans.map((p) => (
                    <td key={p.id} className="px-4 py-3 text-center text-muted-foreground">
                      {row.value(p.features ?? {})}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-border/60 bg-muted/30">
                <td className="px-4 py-3 font-semibold">Mensal flexível</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-4 py-3 text-center font-semibold">
                    {formatCents(p.price_cents)}
                  </td>
                ))}
              </tr>
              <tr className="bg-primary/5">
                <td className="px-4 py-3 font-semibold text-primary">Anual Fidelidade 360</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-4 py-3 text-center font-semibold text-primary">
                    {FIDELIDADE_INSTALLMENTS}x de {formatCents(p.price_cents)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Card>
      </div>
    </section>
  );
}
