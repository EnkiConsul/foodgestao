import { Sparkles, AlertTriangle, TrendingUp, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { usePlinIAInsights, type PlinIAInsight } from "@/hooks/usePlinIAInsights";
import { openPlinIA } from "@/components/ai/plin-ia-controller";

const STYLES: Record<PlinIAInsight["tipo"], { icon: typeof Sparkles; className: string; label: string }> = {
  alerta: {
    icon: AlertTriangle,
    className: "border-destructive/40 bg-destructive/5 text-destructive",
    label: "Alerta",
  },
  tendencia: {
    icon: TrendingUp,
    className: "border-primary/40 bg-primary/5 text-primary",
    label: "Tendência",
  },
  oportunidade: {
    icon: Lightbulb,
    className: "border-success/40 bg-success/5 text-success",
    label: "Oportunidade",
  },
};

export function InsightCards() {
  const { data, isLoading, isError } = usePlinIAInsights();

  if (isError) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Insights do Plin IA</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="shadow-sm">
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        {!isLoading &&
          (data ?? []).map((insight, i) => {
            const style = STYLES[insight.tipo] ?? STYLES.tendencia;
            const Icon = style.icon;
            return (
              <Card key={i} className={`shadow-sm border ${style.className}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                    <Icon className="h-3.5 w-3.5" />
                    {style.label}
                  </div>
                  <p className="text-sm font-semibold text-foreground">{insight.titulo}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{insight.mensagem}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => openPlinIA(`Analise em detalhe: ${insight.titulo}`)}
                  >
                    Perguntar ao Plin IA →
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        {!isLoading && (data ?? []).length === 0 && (
          <Card className="shadow-sm md:col-span-3">
            <CardContent className="p-4 text-sm text-muted-foreground">
              O Plin IA está aguardando mais dados para gerar insights. Cadastre alguns lançamentos e volte em instantes.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
