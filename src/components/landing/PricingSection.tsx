import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useLandingSection } from "@/hooks/useLandingContent";
import { buildCta, formatPrice, trackCta } from "@/lib/landing/utm";

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_period: string;
  trial_days: number;
  sort_order: number;
  is_featured: boolean;
  featured_label: string | null;
  features: Record<string, unknown> | null;
};

const featureLabel = (key: string, value: unknown): string | null => {
  const v = value as number | boolean | string;
  switch (key) {
    case "max_transactions_per_month":
      return v === -1 ? "Lançamentos ilimitados" : `${v} lançamentos/mês`;
    case "max_companies":
      return v === -1 ? "Empresas ilimitadas" : `${v} empresa${v === 1 ? "" : "s"}`;
    case "max_users_per_company":
      return v === -1 ? "Usuários ilimitados" : `${v} usuário${v === 1 ? "" : "s"} por empresa`;
    case "max_attachments_per_transaction":
      return `${v} anexo${v === 1 ? "" : "s"} por lançamento`;
    case "export_csv":
      return v ? "Exportação em CSV" : null;
    case "export_pdf":
      return v ? "Exportação em PDF" : null;
    case "reports_advanced":
      return v ? "Relatórios avançados" : null;
    case "ai_enabled":
      return v ? "Recursos com IA" : null;
    case "support":
      return v === "community"
        ? "Suporte por comunidade"
        : v === "email"
          ? "Suporte por e-mail"
          : v === "priority"
            ? "Suporte prioritário"
            : v === "dedicated"
              ? "Suporte dedicado"
              : null;
    default:
      return null;
  }
};

export function PricingSection({ utm }: { utm: string }) {
  const intro = useLandingSection("pricing_intro");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("plans")
        .select(
          "id, slug, name, description, price_cents, billing_period, trial_days, sort_order, is_featured, featured_label, features"
        )
        .eq("is_active", true)
        .eq("is_public", true)
        .order("sort_order", { ascending: true });
      setPlans((data as Plan[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <section id="planos" className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            {intro.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {intro.title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">
            {intro.subtitle}
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-6xl gap-5 pt-3 sm:mt-12 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-border/60">
                  <CardContent className="space-y-4 p-5 sm:p-6">
                    <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                    <div className="h-10 w-32 animate-pulse rounded bg-muted" />
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <div key={j} className="h-3 w-full animate-pulse rounded bg-muted" />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            : plans.map((p) => {
                const featured = !!p.is_featured;
                const entries = p.features ? Object.entries(p.features) : [];
                const labels = entries
                  .map(([k, v]) => featureLabel(k, v))
                  .filter((x): x is string => !!x);
                const href = buildCta(
                  p.price_cents === 0 ? "/auth?tab=signup" : `/auth?tab=signup&plan=${p.slug}`,
                  utm
                );
                return (
                  <Card
                    key={p.id}
                    className={`relative border-border/60 ${
                      featured ? "border-primary shadow-xl ring-1 ring-primary/40" : ""
                    }`}
                  >
                    {featured && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">{p.featured_label || "Mais popular"}</Badge>
                    )}
                    <CardContent className="flex h-full flex-col p-5 sm:p-6">
                      <h3 className="text-lg font-semibold">{p.name}</h3>
                      {p.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                      )}
                      <div className="mt-4 sm:mt-5">
                        <span className="text-3xl font-bold tracking-tight sm:text-4xl">
                          {formatPrice(p.price_cents)}
                        </span>
                        {p.price_cents > 0 && (
                          <span className="ml-1 text-sm text-muted-foreground">/mês</span>
                        )}
                      </div>
                      {p.trial_days > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {p.trial_days} dias grátis para testar
                        </p>
                      )}
                      <ul className="mt-6 flex-1 space-y-2.5">
                        {labels.slice(0, 6).map((l) => (
                          <li key={l} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                            <span className="text-foreground/90">{l}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        asChild
                        className="mt-6 w-full"
                        variant={featured ? "default" : "outline"}
                      >
                        <Link to={href} onClick={() => trackCta(`pricing_${p.slug}`)}>
                          Começe Grátis
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
        </div>
      </div>
    </section>
  );
}
