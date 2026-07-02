import { Sparkles, MessageSquare, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InsightCards } from "@/components/ai/InsightCards";
import { openPlinIA } from "@/components/ai/plin-ia-controller";
import { usePlinIAUsage } from "@/hooks/usePlinIAInsights";

const QUICK_PROMPTS = [
  "Como está meu fluxo de caixa este mês?",
  "Quais são meus maiores gastos?",
  "Tenho lançamentos vencidos?",
  "Como está minha margem operacional (EBIT%)?",
  "Qual minha margem líquida no trimestre?",
  "Gere uma análise da minha DRE do mês",
  "Onde estou perdendo mais dinheiro na DRE?",
  "Resuma minhas receitas dos últimos 30 dias",
];

export default function PlinIA() {
  const { data: usage } = usePlinIAUsage();
  const enabled = !!usage?.aiEnabled;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-[#6366f1] flex items-center justify-center shadow-lg shadow-primary/30">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Plin IA</h1>
              {enabled && (
                <Badge className="bg-success/15 text-success border border-success/40 text-[10px] px-1.5 py-0 h-5">
                  <span className="mr-1 h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  IA Ativa
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Seu CFO virtual — analisa suas finanças em tempo real</p>
          </div>
        </div>
        <Button
          onClick={() => openPlinIA()}
          className="bg-gradient-to-br from-primary to-[#6366f1] hover:opacity-90"
          disabled={!enabled}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Abrir chat
        </Button>
      </div>

      {!enabled ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Sparkles className="h-8 w-8 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">Plin IA não disponível no seu plano</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Faça upgrade para um plano com IA e desbloqueie insights automáticos, análises e um assistente financeiro 24/7.
            </p>
            <Button asChild variant="outline">
              <a href="/planos">Ver planos</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <InsightCards />

          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Perguntas rápidas</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => openPlinIA(q)}
                    className="text-xs px-3 py-2 rounded-full border bg-card hover:border-primary/60 hover:text-primary transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
