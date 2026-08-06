import { Helmet } from "react-helmet-async";
import {
  Activity,
  AlertTriangle,
  Clock,
  Inbox,
  Plug,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrdersGuard } from "@/components/orders/OrdersGuard";
import { HelpHint } from "@/components/common/HelpHint";
import { OrdersPageHeader, ScrollRow } from "@/components/orders/OrdersPageHeader";
import { ResponsiveTable } from "@/components/orders/ResponsiveTable";
import {
  useOrdersDeadLetters,
  useOrdersInbox,
  useOrdersIntegrations,
  useOrdersOutbox,
  useOrdersQueueMetrics,
} from "@/hooks/useOrdersIntegrations";

const STATUS_LABEL: Record<string, string> = {
  pending: "Na fila",
  processing: "Processando",
  done: "Concluído",
  ignored: "Ignorado",
  dead: "Falhou",
  disabled: "Desativada",
  sandbox: "Simulação",
  active: "Ativa",
  pending_approval: "Aguardando aprovação",
};

const PROVIDER_LABEL: Record<string, string> = {
  sandbox: "Simulador",
  ifood: "iFood",
  rappi: "Rappi",
  anota_ai: "Anota AI",
  goomer: "Goomer",
  custom: "Canal próprio",
};


const HELP = {
  title: "Monitoramento das filas de entrada e saída das integrações com canais externos de pedidos.",
  kpiInbox: "Eventos recebidos de canais externos que ainda aguardam processamento.",
  kpiOutbox: "Mensagens que ainda precisam ser enviadas para os canais externos.",
  kpiLag: "Há quanto tempo o evento pendente mais antigo está esperando na fila.",
  kpiFailures: "Eventos ou mensagens que esgotaram as tentativas e precisam de atenção manual.",
  tabCanais: "Canais de venda externos cadastrados e sua situação de aprovação.",
  tabEntrada: "Eventos recebidos dos canais externos e o status de processamento de cada um.",
  tabSaida: "Mensagens enviadas aos canais externos e o status de entrega de cada uma.",
  tabFalhas: "Eventos e mensagens que falharam definitivamente após todas as tentativas.",
  canais: "Canais externos cadastrados, com provedor, situação e data de aprovação.",
  entrada: "Eventos recebidos dos canais externos, com tentativas e resultado do processamento.",
  saida: "Mensagens enviadas aos canais externos, com tentativas e status de entrega.",
  falhas: "Falhas definitivas de entrada ou saída, com motivo e data de ocorrência.",
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "dead") return "destructive";
  if (status === "done" || status === "active") return "default";
  if (status === "processing" || status === "pending") return "secondary";
  return "outline";
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatLag(seconds: number): string {
  if (!seconds) return "Sem atraso";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

export default function PedidosIntegracoes() {
  const { data: metrics, isLoading: loadingMetrics } = useOrdersQueueMetrics();
  const { data: integrations = [] } = useOrdersIntegrations();
  const { data: inbox = [] } = useOrdersInbox();
  const { data: outbox = [] } = useOrdersOutbox();
  const { data: deadLetters = [] } = useOrdersDeadLetters();

  const pendingInbox = metrics?.inbox?.pending ?? 0;
  const pendingOutbox = metrics?.outbox?.pending ?? 0;
  const openDeadLetters = metrics?.dead_letters_open ?? 0;
  const lag = metrics?.oldest_pending_seconds ?? 0;

  return (
    <OrdersGuard operation="orders.dashboard">
      <Helmet>
        <title>Integrações de Pedidos | 360°FOOD</title>
        <meta
          name="description"
          content="Monitore filas de entrada e saída, atrasos e falhas das integrações de canais externos do módulo Pedidos."
        />
      </Helmet>

      <div className="space-y-6 pb-10">
        <OrdersPageHeader
          backTo="/pedidos"
          backLabel="Voltar ao módulo Pedidos"
          title="Integrações e filas"
          icon={<Plug className="h-6 w-6 text-primary" aria-hidden="true" />}
          subtitle="Base para canais externos — apenas o simulador está ativo."
          actions={
            <>
              <HelpHint text={HELP.title} />
              <Badge variant="outline" className="hidden gap-1 lg:inline-flex">
                <ShieldCheck className="h-3.5 w-3.5" /> Ativação exige aprovação
              </Badge>
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">Eventos na fila<HelpHint text={HELP.kpiInbox} /></CardTitle>
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{loadingMetrics ? "—" : pendingInbox}</div>
              <p className="text-xs text-muted-foreground">
                {metrics?.inbox?.total ?? 0} recebidos no total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">Envios pendentes<HelpHint text={HELP.kpiOutbox} /></CardTitle>
              <Send className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{loadingMetrics ? "—" : pendingOutbox}</div>
              <p className="text-xs text-muted-foreground">
                {metrics?.outbox?.total ?? 0} mensagens no total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">Atraso da fila<HelpHint text={HELP.kpiLag} /></CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{loadingMetrics ? "—" : formatLag(lag)}</div>
              <p className="text-xs text-muted-foreground">Evento pendente mais antigo</p>
            </CardContent>
          </Card>
          <Card className={openDeadLetters > 0 ? "border-destructive/50" : undefined}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">Falhas em análise<HelpHint text={HELP.kpiFailures} /></CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{loadingMetrics ? "—" : openDeadLetters}</div>
              <p className="text-xs text-muted-foreground">Tentativas esgotadas</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="canais">
          <ScrollRow>
            <TabsList className="h-11">
            <TabsTrigger value="canais" className="gap-1.5">Canais<HelpHint text={HELP.tabCanais} /></TabsTrigger>
            <TabsTrigger value="entrada" className="gap-1.5">Entrada<HelpHint text={HELP.tabEntrada} /></TabsTrigger>
            <TabsTrigger value="saida" className="gap-1.5">Saída<HelpHint text={HELP.tabSaida} /></TabsTrigger>
            <TabsTrigger value="falhas" className="gap-1.5">Falhas<HelpHint text={HELP.tabFalhas} /></TabsTrigger>
            </TabsList>
          </ScrollRow>

          <TabsContent value="canais" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plug className="h-4 w-4" /> Canais cadastrados
                  <HelpHint text={HELP.canais} />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ResponsiveTable
                  rows={integrations}
                  getKey={(row) => row.id}
                  empty="Nenhum canal cadastrado. Integrações reais exigem homologação e aprovação da plataforma."
                  columns={[
                    { key: "name", header: "Canal", primary: true, cell: (row) => row.display_name },
                    { key: "provider", header: "Provedor", cell: (row) => PROVIDER_LABEL[row.provider] ?? row.provider },
                    {
                      key: "status",
                      header: "Situação",
                      cell: (row) => (
                        <Badge variant={statusVariant(row.status)}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      ),
                    },
                    {
                      key: "approved",
                      header: "Aprovação",
                      cell: (row) => (row.approved_at ? formatDateTime(row.approved_at) : "Não aprovado"),
                    },
                    { key: "last", header: "Último evento", cell: (row) => formatDateTime(row.last_event_at) },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entrada" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" /> Eventos recebidos
                  <HelpHint text={HELP.entrada} />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ResponsiveTable
                  rows={inbox}
                  getKey={(row) => row.id}
                  empty="Nenhum evento recebido ainda."
                  columns={[
                    { key: "event", header: "Evento", primary: true, cell: (row) => row.event_type },
                    { key: "ext", header: "Pedido externo", cell: (row) => row.external_order_id ?? "—" },
                    {
                      key: "status",
                      header: "Situação",
                      cell: (row) => (
                        <Badge variant={statusVariant(row.status)}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      ),
                    },
                    { key: "att", header: "Tentativas", cell: (row) => `${row.attempts}/${row.max_attempts}` },
                    { key: "at", header: "Recebido", cell: (row) => formatDateTime(row.received_at) },
                    {
                      key: "detail",
                      header: "Detalhe",
                      cell: (row) => row.error_message ?? (row.order_id ? "Pedido criado" : "—"),
                    },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="saida" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Send className="h-4 w-4" /> Mensagens enviadas
                  <HelpHint text={HELP.saida} />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ResponsiveTable
                  rows={outbox}
                  getKey={(row) => row.id}
                  empty="Nenhuma mensagem na fila."
                  columns={[
                    { key: "op", header: "Ação", primary: true, cell: (row) => row.operation },
                    { key: "provider", header: "Provedor", cell: (row) => PROVIDER_LABEL[row.provider] ?? row.provider },
                    {
                      key: "status",
                      header: "Situação",
                      cell: (row) => (
                        <Badge variant={statusVariant(row.status)}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      ),
                    },
                    { key: "att", header: "Tentativas", cell: (row) => `${row.attempts}/${row.max_attempts}` },
                    { key: "at", header: "Criada", cell: (row) => formatDateTime(row.created_at) },
                    {
                      key: "detail",
                      header: "Detalhe",
                      cell: (row) => row.error_message ?? (row.sent_at ? "Enviada" : "—"),
                    },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="falhas" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4" /> Falhas definitivas
                  <HelpHint text={HELP.falhas} />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ResponsiveTable
                  rows={deadLetters}
                  getKey={(row) => row.id}
                  empty="Nenhuma falha definitiva registrada."
                  columns={[
                    {
                      key: "source",
                      header: "Origem",
                      primary: true,
                      cell: (row) => (row.source === "inbox" ? "Entrada" : "Saída"),
                    },
                    { key: "event", header: "Evento", cell: (row) => row.event_type ?? "—" },
                    {
                      key: "reason",
                      header: "Motivo",
                      cell: (row) => row.error_message ?? row.error_class ?? "—",
                    },
                    { key: "att", header: "Tentativas", cell: (row) => row.attempts },
                    { key: "at", header: "Quando", cell: (row) => formatDateTime(row.created_at) },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OrdersGuard>
  );
}
