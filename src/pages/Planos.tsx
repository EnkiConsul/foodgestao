import { useNavigate } from "react-router-dom";
import { usePlans } from "@/hooks/usePlans";
import { useCurrentSubscription } from "@/hooks/useCurrentSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { formatCents, formatLimit } from "@/lib/billing";
import { FIDELIDADE_INSTALLMENTS, annualSavingsCents } from "@/lib/billing/fidelidade360";


export default function Planos() {
  const navigate = useNavigate();
  const { data: plans = [], isLoading } = usePlans();
  const { data: current } = useCurrentSubscription();

  const visible = plans.filter((p: any) => p.is_active && p.is_public);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo size="sm" linkTo="/" />
          <Button variant="ghost" onClick={() => navigate("/")}>Voltar ao app</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <div className="text-center mb-6 md:mb-10">
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight">Escolha Seu Plano</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2">
            Comece grátis e evolua conforme sua necessidade
          </p>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground">Carregando...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {visible.map((p: any) => {
              const f = p.features || {};
              const isCurrent = current?.plan_id === p.id;
              const featured = !!p.is_featured;
              return (
                <Card key={p.id} className={`relative ${isCurrent ? "border-primary border-2" : featured ? "border-primary shadow-xl ring-1 ring-primary/40" : ""}`}>
                  {featured && !isCurrent && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">{p.featured_label || "Mais popular"}</Badge>
                  )}
                  <CardHeader className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold">{p.name}</h3>
                      {isCurrent && <Badge>Plano atual</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground min-h-[2.5rem]">{p.description}</p>
                    <div className="pt-2">
                      <span className="text-3xl font-bold">{formatCents(p.price_cents)}</span>
                      <span className="text-sm text-muted-foreground">
                        /{p.billing_period === "monthly" ? "mês" : "ano"}
                      </span>
                      {f.price_per_extra_company_cents > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          + {formatCents(f.price_per_extra_company_cents)} por perfil adicional
                        </p>
                      )}
                    </div>
                    {p.price_cents > 0 && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                        <p className="font-semibold text-primary">Fidelidade 360</p>
                        <p className="text-muted-foreground">
                          {FIDELIDADE_INSTALLMENTS}x de {formatCents(p.price_cents)} em 12 meses ·
                          1º mês grátis + meses 5 e 9 gratuitos (economia de{" "}
                          {formatCents(annualSavingsCents(p.price_cents))})
                        </p>
                      </div>
                    )}
                    {p.trial_days > 0 && (
                      <p className="text-xs text-emerald-600">{p.trial_days} dias de trial grátis</p>
                    )}

                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-2 text-sm">
                      <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />{f.price_per_extra_company_cents > 0 ? `${f.included_companies ?? f.max_companies} ${(f.included_companies ?? f.max_companies) === 1 ? "perfil incluso" : "perfis inclusos"} · extras sob demanda` : `Até ${formatLimit(f.max_companies)} ${f.max_companies === 1 ? "perfil" : "perfis"}`}</li>
                      <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />{formatLimit(f.max_transactions_per_month)} lançamentos/mês</li>
                      <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />{formatLimit(f.max_attachments_per_transaction)} anexos por lançamento</li>
                      <li className="flex gap-2">
                        {f.ai_enabled ? <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                        Recursos com IA
                      </li>
                      <li className="flex gap-2">
                        {f.export_pdf ? <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                        Exportar PDF
                      </li>
                      <li className="flex gap-2">
                        {f.reports_advanced ? <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                        Relatórios avançados
                      </li>
                    </ul>
                    <Button
                      className="w-full"
                      variant={isCurrent ? "outline" : "default"}
                      disabled={isCurrent}
                      onClick={() => navigate(`/checkout/${p.slug}`)}
                    >
                      {isCurrent ? "Plano atual" : p.price_cents === 0 ? "Começar grátis" : "Assinar"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
