import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useLandingSection } from "@/hooks/useLandingContent";
import { buildCta, trackCta } from "@/lib/landing/utm";
import { formatCents, formatLimit } from "@/lib/billing";
import {
  FIDELIDADE_INSTALLMENTS,
  annualSavingsCents,
  annualTotalCents,
} from "@/lib/billing/fidelidade360";

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  sort_order: number;
  is_featured: boolean;
  featured_label: string | null;
  features: Record<string, unknown> | null;
};

const WHATSAPP_URL =
  "https://wa.me/5562992365959?text=" +
  encodeURIComponent("Olá! Quero conhecer o módulo de Departamento Pessoal do 360°FOOD.");

function planHighlights(f: Record<string, unknown>): string[] {
  const n = (k: string) => formatLimit(typeof f[k] === "number" ? (f[k] as number) : null);
  return [
    `${n("max_companies")} ${Number(f.max_companies) === 1 ? "empresa/CNPJ" : "empresas/CNPJs"}`,
    `${n("max_users_per_company")} usuários`,
    `${n("max_accountant_seats")} acesso gratuito para contador`,
    `${n("max_open_finance_connections")} conexões Open Finance`,
    "Lançamentos financeiros ilimitados",
    "Conciliação bancária automática",
    "Fluxo de caixa e DRE gerencial",
    typeof f.whatsapp_alerts_per_month === "number"
      ? `${f.whatsapp_alerts_per_month} alertas de WhatsApp/mês por empresa`
      : "Alertas por WhatsApp",
    "Agente de IA e suporte incluídos",
  ];
}

export function PricingSection({ utm }: { utm: string }) {
  const intro = useLandingSection("pricing_intro");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("plans")
        .select("id, slug, name, description, price_cents, sort_order, is_featured, featured_label, features")
        .eq("is_active", true)
        .eq("is_public", true)
        .order("sort_order", { ascending: true });
      setPlans(
        ((data as Plan[]) ?? []).filter(
          (p) => ((p.features?.solution as string) ?? "financeiro") === "financeiro"
        )
      );
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

        <Tabs defaultValue="financeiro" className="mt-8 sm:mt-10">
          <TabsList className="mx-auto flex w-fit">
            <TabsTrigger value="financeiro">{intro.tab_financeiro}</TabsTrigger>
            <TabsTrigger value="dp">{intro.tab_dp}</TabsTrigger>
          </TabsList>

          <TabsContent value="financeiro">
            <div className="mx-auto mt-8 grid max-w-6xl gap-5 pt-3 sm:gap-6 md:grid-cols-3">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="border-border/60">
                      <CardContent className="space-y-4 p-5 sm:p-6">
                        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-10 w-32 animate-pulse rounded bg-muted" />
                        <div className="space-y-2">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <div key={j} className="h-3 w-full animate-pulse rounded bg-muted" />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                : plans.map((p) => {
                    const f = p.features ?? {};
                    const featured = !!p.is_featured;
                    const href = buildCta(`/auth?tab=signup&plan=${p.slug}`, utm, {
                      variant: "fidelidade360",
                    });
                    return (
                      <Card
                        key={p.id}
                        className={`relative border-border/60 ${
                          featured ? "border-primary shadow-xl ring-1 ring-primary/40" : ""
                        }`}
                      >
                        {featured && (
                          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                            {p.featured_label || "Mais popular"}
                          </Badge>
                        )}
                        <CardContent className="flex h-full flex-col p-5 sm:p-6">
                          <h3 className="text-lg font-semibold">{p.name}</h3>
                          {p.description && (
                            <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                          )}

                          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                              Anual Fidelidade 360
                            </p>
                            <p className="mt-1">
                              <span className="text-sm text-muted-foreground">
                                {FIDELIDADE_INSTALLMENTS}x de{" "}
                              </span>
                              <span className="text-3xl font-bold tracking-tight">
                                {formatCents(p.price_cents)}
                              </span>
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Total em 12 meses: {formatCents(annualTotalCents(p.price_cents))} ·
                              economia de {formatCents(annualSavingsCents(p.price_cents))}
                            </p>
                            <p className="mt-1 text-xs font-medium text-primary">
                              1º mês grátis + meses 5 e 9 gratuitos
                            </p>
                          </div>

                          <p className="mt-3 text-xs text-muted-foreground">
                            Ou <b className="text-foreground">{formatCents(p.price_cents)}/mês</b> no
                            mensal flexível, sem compromisso anual.
                          </p>

                          <ul className="mt-5 flex-1 space-y-2.5">
                            {planHighlights(f).map((l) => (
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
                              Começar com o 1º mês grátis
                            </Link>
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
            </div>
            <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-muted-foreground">
              {intro.legal}
            </p>
          </TabsContent>

          <TabsContent value="dp">
            <Card className="mx-auto mt-8 max-w-2xl border-border/60">
              <CardContent className="p-6 text-center sm:p-8">
                <Badge variant="secondary">Preços em breve</Badge>
                <h3 className="mt-4 text-xl font-semibold">{intro.dp_title}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{intro.dp_subtitle}</p>
                <Button asChild className="mt-6">
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    {intro.dp_cta_label}
                  </a>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
