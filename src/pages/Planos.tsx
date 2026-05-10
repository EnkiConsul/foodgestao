import { useNavigate } from "react-router-dom";
import { usePlans } from "@/hooks/usePlans";
import { useCurrentSubscription } from "@/hooks/useCurrentSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, TreePine } from "lucide-react";
import { formatCents, formatLimit } from "@/lib/billing";

export default function Planos() {
  const navigate = useNavigate();
  const { data: plans = [], isLoading } = usePlans();
  const { data: current } = useCurrentSubscription();

  const visible = plans.filter((p: any) => p.is_active && p.is_public);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TreePine className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">Gestor <span className="text-primary">Plin</span></span>
          </div>
          <Button variant="ghost" onClick={() => navigate("/")}>Voltar ao app</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Escolha seu plano</h1>
          <p className="text-muted-foreground mt-2">
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
              return (
                <Card key={p.id} className={isCurrent ? "border-primary border-2" : ""}>
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
                    </div>
                    {p.trial_days > 0 && (
                      <p className="text-xs text-emerald-600">{p.trial_days} dias de trial grátis</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-2 text-sm">
                      <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />Até {formatLimit(f.max_companies)} {f.max_companies === 1 ? "perfil" : "perfis"}</li>
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
