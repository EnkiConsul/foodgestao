import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentSubscription } from "@/hooks/useCurrentSubscription";

export default function TrialExpired() {
  const navigate = useNavigate();
  const { data: sub } = useCurrentSubscription();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const headline =
    sub?.status === "canceled"
      ? "Sua assinatura foi cancelada"
      : "Seu período de teste gratuito terminou";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-center">
          <Logo size="md" linkTo={null} />
        </div>

        <Card className="border-destructive/30 shadow-lg">
          <CardContent className="pt-8 pb-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-destructive/10 p-3 shrink-0">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">{headline}</h1>
                <p className="text-muted-foreground">
                  Para continuar acessando o Aveto 360 e seus dados, escolha um plano que melhor atenda seu negócio.
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-medium">O que você terá ao assinar:</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {[
                  "Lançamentos ilimitados (contas a pagar e receber)",
                  "Relatórios completos e exportação PDF/CSV",
                  "Múltiplas empresas e usuários (planos pagos)",
                  "Suporte e atualizações contínuas",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg" className="flex-1">
                <Link to="/planos">Escolher um plano</Link>
              </Button>
              <Button variant="outline" size="lg" onClick={handleLogout} className="sm:w-auto">
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground pt-2">
              Precisa de ajuda? Fale com a gente:{" "}
              <a href="mailto:comercial@raptorsistemas.com" className="text-primary hover:underline">
                comercial@raptorsistemas.com
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
