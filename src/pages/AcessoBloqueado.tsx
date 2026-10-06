import { Link, Navigate } from "react-router-dom";
import { AlertTriangle, CreditCard, LifeBuoy, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExportMyDataCard } from "@/components/settings/ExportMyDataCard";
import { useCompanyAccess, type MotivoBloqueio } from "@/hooks/useCompanyAccess";
import { PageSpinner } from "@/components/PageSpinner";

const TEXTOS: Record<MotivoBloqueio, { titulo: string; descricao: string }> = {
  sem_assinatura: {
    titulo: "Escolha um plano para continuar",
    descricao:
      "Esta empresa ainda não tem um plano contratado. Escolha o plano ideal e libere o acesso na hora.",
  },
  trial_expirado: {
    titulo: "Seu período de teste terminou",
    descricao:
      "O teste de 7 dias acabou. Contrate um plano agora para voltar a usar o sistema — seus dados continuam guardados.",
  },
  inadimplente_suspenso: {
    titulo: "Acesso suspenso por pagamento em atraso",
    descricao:
      "Sua mensalidade está em atraso há mais de 10 dias. Quite a fatura para liberar o acesso; o pagamento pode levar até dois dias úteis para ser confirmado.",
  },
  rescindido: {
    titulo: "Contrato encerrado por falta de pagamento",
    descricao:
      "A pendência passou de 30 dias e o contrato foi encerrado. Seus dados ficam guardados por 90 dias contados do vencimento e você pode exportá-los abaixo.",
  },
  carencia_expirada: {
    titulo: "Período de carência encerrado",
    descricao:
      "Sua cortesia chegou ao fim e o período de carência expirou. Escolha um plano para reativar seu acesso na hora — seus dados continuam guardados.",
  },
  expirado_definitivo: {
    titulo: "Prazo de guarda dos dados encerrado",
    descricao:
      "Passaram-se mais de 90 dias do vencimento. A exportação não está mais disponível. Fale com o suporte para contratar um novo plano.",
  },
};

function formatarValor(cents: number | null) {
  if (cents == null) return null;
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AcessoBloqueado() {
  const { loading, access, blocked } = useCompanyAccess();

  if (loading) return <PageSpinner />;
  if (!blocked) return <Navigate to="/hub" replace />;

  const motivo: MotivoBloqueio = access?.motivo ?? "sem_assinatura";
  const { titulo, descricao } = TEXTOS[motivo];
  const valor = formatarValor(access?.valorPendenteCents ?? null);
  const dias = access?.diasAtraso ?? null;
  const podeExportar = access?.canExport !== false;
  // Aviso urgente a partir de D+80: contagem regressiva para o fim da guarda de 90 dias.
  const diasRestantesGuarda =
    podeExportar && dias != null && dias >= 80 && dias <= 90 ? 90 - dias : null;

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {titulo}
            </CardTitle>
            <CardDescription>{descricao}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(valor || dias != null) && (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                {valor && (
                  <p>
                    Valor pendente: <span className="font-semibold">{valor}</span>
                  </p>
                )}
                {dias != null && dias > 0 && (
                  <p className="text-muted-foreground">Vencida há {dias} dias.</p>
                )}
              </div>
            )}

            {diasRestantesGuarda != null && (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {diasRestantesGuarda === 0
                    ? "Último dia para exportar seus dados"
                    : `Faltam ${diasRestantesGuarda} ${diasRestantesGuarda === 1 ? "dia" : "dias"} para a exclusão definitiva dos seus dados`}
                </p>
                <p className="mt-1 text-muted-foreground">
                  O prazo de guarda de 90 dias está terminando. Depois dele, a exportação deixa de
                  estar disponível e as informações são excluídas de forma definitiva. Quite a
                  pendência para manter o acesso ou exporte seus dados agora.
                </p>
              </div>
            )}

            {access?.isOwner === false ? (
              <p className="rounded-lg border bg-muted/40 p-4 text-sm">
                A regularização do plano é feita pelo responsável pela empresa. Fale com ele para
                liberar o acesso novamente.
              </p>
            ) : (
            <div className="flex flex-wrap gap-2">
              {access?.faturaPendenteId && (
                <Button asChild>
                  <Link to={`/checkout/pagamento/${access.faturaPendenteId}`}>
                    <CreditCard className="mr-2 h-4 w-4" /> Pagar agora
                  </Link>
                </Button>
              )}
              <Button asChild variant={access?.faturaPendenteId ? "outline" : "default"}>
                <Link to="/planos">
                  <Sparkles className="mr-2 h-4 w-4" /> Ver planos
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/assinatura">Plano e faturas</Link>
              </Button>
            </div>
            )}

            <p className="text-xs text-muted-foreground">
              Após a confirmação do pagamento integral, o acesso é restabelecido — em até dois dias
              úteis, conforme a forma de pagamento.
            </p>
          </CardContent>
        </Card>

        {podeExportar ? (
          <ExportMyDataCard />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LifeBuoy className="h-5 w-5 text-primary" /> Precisa de ajuda?
              </CardTitle>
              <CardDescription>
                O prazo de guarda de 90 dias terminou e a exportação não está mais disponível. Fale com
                o nosso suporte para retomar o uso do sistema.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
