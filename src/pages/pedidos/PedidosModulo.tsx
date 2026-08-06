import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bike,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Loader2,
  MessageCircle,
  PackageCheck,
  Plug,
  Settings2,
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
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useOrdersEntitlement, useStartOrdersTrial } from "@/hooks/useOrdersEntitlement";
import { useOrdersUnits } from "@/hooks/useOrdersUnits";
import { useOrdersBoard } from "@/hooks/useOrdersBoard";
import { columnForStatus } from "@/lib/orders/board";
import { ORDERS_TRIAL_DAYS } from "@/lib/orders/entitlement";

const HELP = {
  titulo: "Painel do módulo Pedidos: acompanhe a operação do dia e acesse as telas de trabalho.",
  central: "Abre a fila de pedidos, onde você aceita, acompanha e finaliza cada pedido.",
  operacao: "Contadores em tempo real dos pedidos da unidade, agrupados por etapa.",
  atalhos: "Acesso rápido às telas do módulo: cozinha, expedição, cardápio, relatórios e ajustes.",
  trial: "Libera o módulo completo por alguns dias para teste, sem cobrança automática no fim.",
} as const;

const STAT_HELP: Record<string, string> = {
  Novos: "Pedidos recebidos que ainda não foram aceitos pela loja.",
  "Em preparo": "Pedidos aceitos e em produção na cozinha.",
  Prontos: "Pedidos finalizados, aguardando entrega ou retirada.",
  "Entrega / retirada": "Pedidos já despachados ao cliente ou no balcão de retirada.",
};

const SHORTCUT_HELP: Record<string, string> = {
  "/pedidos/cozinha": "Fila de produção: veja o que preparar e marque cada item como pronto.",
  "/pedidos/expedicao": "Controle de saída: despacho, entregador responsável e retirada no balcão.",
  "/pedidos/cardapio": "Cadastro de produtos, preços, variações e o que está disponível para venda.",
  "/pedidos/relatorios": "Indicadores da operação: volume, ticket médio, tempos e atrasos.",
  "/pedidos/integracoes": "Filas de eventos trocados com canais externos e falhas para revisar.",
  "/pedidos/onboarding": "Configuração da unidade: horários, prazos, canais, som e impressão.",
};

const HIGHLIGHTS = [
  { icon: ClipboardList, title: "Pedidos em tempo real", desc: "Balcão, mesa, retirada e delivery em uma fila só." },
  { icon: UtensilsCrossed, title: "Produção organizada", desc: "Acompanhe preparo e entrega por etapa." },
  { icon: Bike, title: "Entregas controladas", desc: "Despacho, entregador e status do cliente." },
  { icon: Sparkles, title: "Sem depender do Financeiro", desc: "Opere Pedidos mesmo sem configurar contas ou categorias." },
];


const SHORTCUTS = [
  {
    to: "/pedidos/cozinha",
    icon: ChefHat,
    title: "Cozinha",
    desc: "Fila de produção por etapa.",
  },
  {
    to: "/pedidos/expedicao",
    icon: PackageCheck,
    title: "Expedição",
    desc: "Despacho, retirada e entregadores.",
  },
  {
    to: "/pedidos/cardapio",
    icon: UtensilsCrossed,
    title: "Cardápio",
    desc: "Produtos, preços e disponibilidade.",
  },
  {
    to: "/pedidos/relatorios",
    icon: BarChart3,
    title: "Relatórios",
    desc: "Volume, ticket médio e SLA.",
  },
  {
    to: "/pedidos/integracoes",
    icon: Plug,
    title: "Integrações",
    desc: "Filas de entrada e saída de eventos.",
  },
  {
    to: "/pedidos/onboarding",
    icon: Settings2,
    title: "Configurar unidade",
    desc: "Horários, prazos, canais e impressão.",
  },
];

const WA_LINK = `https://wa.me/5562992365959?text=${encodeURIComponent(
  "Olá! Quero contratar o módulo Pedidos 360° no 360°FOOD.",
)}`;

const UNIT_STATE_LABEL: Record<string, string> = {
  open: "Aberta",
  paused: "Pausada",
  closed: "Fechada",
};

/** Faixa de indicadores da operação do dia, alimentada pela fila em tempo real. */
function LiveStats({ unitId }: { unitId: string | null }) {
  const { orders, isLoading } = useOrdersBoard(unitId);

  const stats = useMemo(() => {
    const count = (col: string) => orders.filter((o) => columnForStatus(o.status) === col).length;
    return [
      { label: "Novos", value: count("novos"), hint: "aguardando aceite" },
      { label: "Em preparo", value: count("preparo"), hint: "na cozinha" },
      { label: "Prontos", value: count("prontos"), hint: "para sair" },
      { label: "Entrega / retirada", value: count("transporte"), hint: "em trânsito" },
    ];
  }, [orders]);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="border-border/70">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {s.label}
            </p>
            {isLoading && !orders.length ? (
              <Skeleton className="mt-2 h-8 w-12" />
            ) : (
              <p className="mt-1 text-3xl font-bold leading-none tabular-nums">{s.value}</p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">{s.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PedidosModulo() {
  const { contextType, companies, selectedCompanyId } = useCompanyContext();
  const { entitlement, isLoading, canStartTrial } = useOrdersEntitlement("orders.dashboard");
  const startTrial = useStartOrdersTrial();
  const { data: units } = useOrdersUnits();

  const companyName = companies.find((c) => c.id === selectedCompanyId)?.name ?? "sua empresa";
  const estimatedEnd = new Date(Date.now() + ORDERS_TRIAL_DAYS * 86_400_000);
  const usable = entitlement.usable;
  const unit = (units ?? [])[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <Helmet>
        <title>Pedidos 360° — Gestão de pedidos e delivery</title>
        <meta
          name="description"
          content="Módulo Pedidos 360°: fila de pedidos, produção e entregas para bares, restaurantes e delivery. Teste 7 dias grátis."
        />
      </Helmet>

      {/* Cabeçalho */}
      <header className="rounded-2xl border bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShoppingCart className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Pedidos 360°</h1>
              {usable && (
                <Badge className="gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  {entitlement.effective_status === "trial" ? "Em teste" : "Ativo"}
                </Badge>
              )}
              {usable && unit && (
                <Badge variant="outline">
                  {unit.nome} · {UNIT_STATE_LABEL[unit.operational_state] ?? unit.operational_state}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              Receba, prepare e entregue pedidos com o controle operacional do 360°FOOD.
            </p>
          </div>

          {usable && (
            <Button asChild size="lg" className="w-full shrink-0 sm:w-auto">
              <Link to="/pedidos/central">
                <ClipboardList className="mr-2 h-4 w-4" aria-hidden="true" />
                Abrir Central de Pedidos
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Verificando
            disponibilidade…
          </CardContent>
        </Card>
      ) : contextType !== "pj" ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            O módulo Pedidos é exclusivo para empresas. Selecione uma empresa no seletor de contexto
            para continuar.
          </CardContent>
        </Card>
      ) : usable ? (
        <>
          <section aria-labelledby="operacao-agora" className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <h2 id="operacao-agora" className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Operação agora
                <HelpHint text={HELP.operacao} label="Ajuda sobre a operação de agora" />
              </h2>
              {unit && (
                <Link to="/pedidos/central" className="text-xs font-medium text-primary hover:underline">
                  Ver a fila completa
                </Link>
              )}
            </div>
            {unit ? (
              <LiveStats unitId={unit.id} />
            ) : (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
                  Nenhuma unidade operacional ativa ainda.
                  <Button asChild variant="outline" size="sm">
                    <Link to="/pedidos/onboarding">Ativar primeira unidade</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </section>

          <section aria-labelledby="atalhos" className="space-y-3">
            <h2 id="atalhos" className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Atalhos do módulo
              <HelpHint text={HELP.atalhos} label="Ajuda sobre os atalhos do módulo" />
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SHORTCUTS.map(({ to, icon: Icon, title, desc }) => (
                <div key={to} className="relative">
                  <Link
                    to={to}
                    className="group block rounded-xl border bg-card p-4 pr-10 transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 text-sm font-semibold">
                          {title}
                          <ArrowRight
                            className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-hidden="true"
                          />
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                  </Link>
                  <span className="absolute right-3 top-3">
                    <HelpHint text={SHORTCUT_HELP[to] ?? desc} label={`Ajuda sobre ${title}`} />
                  </span>
                </div>
              ))}
            </div>

          </section>
        </>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
              <Card key={title}>
                <CardContent className="flex gap-3 p-4">
                  <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardContent className="space-y-4 p-6">
              {canStartTrial ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Experimente o módulo completo por <strong>{ORDERS_TRIAL_DAYS} dias</strong>, sem
                    cobrança automática ao final do período.
                  </p>
                  <AlertDialog>
                    <div className="flex items-center gap-1.5">
                    <AlertDialogTrigger asChild>
                      <Button size="lg" className="w-full sm:w-auto" disabled={startTrial.isPending}>
                        {startTrial.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        )}
                        Iniciar meus {ORDERS_TRIAL_DAYS} dias gratuitos
                      </Button>
                    </AlertDialogTrigger>
                      <HelpHint text={HELP.trial} label="Ajuda sobre o teste gratuito" />
                    </div>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Iniciar teste gratuito?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O teste do módulo Pedidos será liberado para <strong>{companyName}</strong>{" "}
                          por {ORDERS_TRIAL_DAYS} dias corridos, com encerramento estimado em{" "}
                          <strong>{estimatedEnd.toLocaleDateString("pt-BR")}</strong>. Não há
                          cobrança automática ao final e o teste pode ser usado uma única vez por
                          empresa.
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
                        <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Contratar via
                        WhatsApp
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="lg">
                      <Link to="/hub">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Voltar ao Hub
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
