import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MessageCircle,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useOrdersEntitlement, useStartOrdersTrial } from "@/hooks/useOrdersEntitlement";
import { ORDERS_TRIAL_DAYS } from "@/lib/orders/entitlement";
import { OrdersTrialBanner } from "@/components/orders/OrdersTrialBanner";

const HIGHLIGHTS = [
  { icon: ClipboardList, title: "Pedidos em tempo real", desc: "Balcão, mesa, retirada e delivery em uma fila só." },
  { icon: UtensilsCrossed, title: "Produção organizada", desc: "Acompanhe preparo e entrega por etapa." },
  { icon: Bike, title: "Entregas controladas", desc: "Despacho, entregador e status do cliente." },
  { icon: Sparkles, title: "Sem depender do Financeiro", desc: "Opere Pedidos mesmo sem configurar contas ou categorias." },
];

const WA_LINK = `https://wa.me/5562992365959?text=${encodeURIComponent(
  "Olá! Quero contratar o módulo Pedidos 360° no 360°FOOD.",
)}`;

export default function PedidosModulo() {
  const { contextType, companies, selectedCompanyId } = useCompanyContext();
  const { entitlement, isLoading, canStartTrial } = useOrdersEntitlement("orders.dashboard");
  const startTrial = useStartOrdersTrial();

  const companyName =
    companies.find((c) => c.id === selectedCompanyId)?.name ?? "sua empresa";
  const estimatedEnd = new Date(Date.now() + ORDERS_TRIAL_DAYS * 86_400_000);
  const usable = entitlement.usable;

  return (
    <div className="mx-auto max-w-4xl">
      <Helmet>
        <title>Pedidos 360° — Gestão de pedidos e delivery</title>
        <meta
          name="description"
          content="Módulo Pedidos 360°: fila de pedidos, produção e entregas para bares, restaurantes e delivery. Teste 7 dias grátis."
        />
      </Helmet>

      {!isLoading && <OrdersTrialBanner entitlement={entitlement} />}

      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ShoppingCart className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold md:text-3xl">Pedidos 360°</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Receba, prepare e entregue pedidos com o controle operacional do 360°FOOD.
          </p>
        </div>
        {usable && (
          <Badge className="ml-auto shrink-0 gap-1 bg-primary">
            <CheckCircle2 className="h-3 w-3" />
            {entitlement.effective_status === "trial" ? "Em teste" : "Ativo"}
          </Badge>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
          <Card key={title}>
            <CardContent className="flex gap-3 p-4">
              <Icon className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando disponibilidade…
            </div>
          ) : contextType !== "pj" ? (
            <p className="text-sm text-muted-foreground">
              O módulo Pedidos é exclusivo para empresas. Selecione uma empresa no seletor de
              contexto para continuar.
            </p>
          ) : usable ? (
            <>
              <p className="text-sm text-muted-foreground">
                Módulo liberado para <strong>{companyName}</strong>. As telas operacionais serão
                habilitadas nas próximas etapas de implantação.
              </p>
              <Button disabled className="w-full sm:w-auto">
                Abrir fila de pedidos (em implantação)
              </Button>
            </>
          ) : canStartTrial ? (
            <>
              <p className="text-sm text-muted-foreground">
                Experimente o módulo completo por <strong>{ORDERS_TRIAL_DAYS} dias</strong>, sem
                cobrança automática ao final do período.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="lg" className="w-full sm:w-auto" disabled={startTrial.isPending}>
                    {startTrial.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Iniciar meus {ORDERS_TRIAL_DAYS} dias gratuitos
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Iniciar teste gratuito?</AlertDialogTitle>
                    <AlertDialogDescription>
                      O teste do módulo Pedidos será liberado para <strong>{companyName}</strong> por{" "}
                      {ORDERS_TRIAL_DAYS} dias corridos, com encerramento estimado em{" "}
                      <strong>{estimatedEnd.toLocaleDateString("pt-BR")}</strong>. Não há cobrança
                      automática ao final e o teste pode ser usado uma única vez por empresa.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => startTrial.mutate()}>
                      Confirmar e iniciar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {entitlement.trial_used
                  ? "Esta empresa já utilizou o teste gratuito do módulo Pedidos. Fale com nossa equipe para contratar."
                  : entitlement.role === "owner" || entitlement.role === "admin"
                    ? "Este módulo ainda não está disponível para a empresa selecionada."
                    : "Somente o proprietário da empresa pode iniciar o teste gratuito do módulo Pedidos."}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" /> Contratar via WhatsApp
                  </a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/hub">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao Hub
                  </Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
