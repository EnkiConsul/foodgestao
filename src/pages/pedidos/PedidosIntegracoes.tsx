import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrdersGuard } from "@/components/orders/OrdersGuard";
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link to="/pedidos">
                <ArrowLeft className="mr-2 h-4 w-4" /> Módulo Pedidos
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">Integrações e filas</h1>
            <p className="text-sm text-muted-foreground">
              Base para conectar canais externos. Nenhum marketplace real está ativo — só o
              simulador, usado para validar recebimento, reenvio e falhas.
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> Ativação exige aprovação da plataforma
          </Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Eventos na fila</CardTitle>
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
              <CardTitle className="text-sm font-medium">Envios pendentes</CardTitle>
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
              <CardTitle className="text-sm font-medium">Atraso da fila</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{loadingMetrics ? "—" : formatLag(lag)}</div>
              <p className="text-xs text-muted-foreground">Evento pendente mais antigo</p>
            </CardContent>
          </Card>
          <Card className={openDeadLetters > 0 ? "border-destructive/50" : undefined}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Falhas em análise</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{loadingMetrics ? "—" : openDeadLetters}</div>
              <p className="text-xs text-muted-foreground">Tentativas esgotadas</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="canais">
          <TabsList>
            <TabsTrigger value="canais">Canais</TabsTrigger>
            <TabsTrigger value="entrada">Entrada</TabsTrigger>
            <TabsTrigger value="saida">Saída</TabsTrigger>
            <TabsTrigger value="falhas">Falhas</TabsTrigger>
          </TabsList>

          <TabsContent value="canais" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plug className="h-4 w-4" /> Canais cadastrados
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {integrations.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    Nenhum canal cadastrado. Integrações reais só podem ser ativadas após
                    homologação e aprovação da plataforma.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Canal</TableHead>
                        <TableHead>Provedor</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Aprovação</TableHead>
                        <TableHead>Último evento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {integrations.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.display_name}</TableCell>
                          <TableCell>{PROVIDER_LABEL[row.provider] ?? row.provider}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(row.status)}>
                              {STATUS_LABEL[row.status] ?? row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {row.approved_at ? formatDateTime(row.approved_at) : "Não aprovado"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDateTime(row.last_event_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entrada" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" /> Eventos recebidos
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {inbox.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Nenhum evento recebido ainda.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Evento</TableHead>
                        <TableHead>Pedido externo</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Tentativas</TableHead>
                        <TableHead>Recebido</TableHead>
                        <TableHead>Detalhe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inbox.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.event_type}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.external_order_id ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(row.status)}>
                              {STATUS_LABEL[row.status] ?? row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {row.attempts}/{row.max_attempts}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDateTime(row.received_at)}
                          </TableCell>
                          <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                            {row.error_message ?? (row.order_id ? "Pedido criado" : "—")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="saida" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Send className="h-4 w-4" /> Mensagens enviadas
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {outbox.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Nenhuma mensagem na fila.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ação</TableHead>
                        <TableHead>Provedor</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Tentativas</TableHead>
                        <TableHead>Criada</TableHead>
                        <TableHead>Detalhe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outbox.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.operation}</TableCell>
                          <TableCell>{PROVIDER_LABEL[row.provider] ?? row.provider}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(row.status)}>
                              {STATUS_LABEL[row.status] ?? row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {row.attempts}/{row.max_attempts}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDateTime(row.created_at)}
                          </TableCell>
                          <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                            {row.error_message ?? (row.sent_at ? "Enviada" : "—")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="falhas" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4" /> Falhas definitivas
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {deadLetters.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    Nenhuma falha definitiva registrada.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Origem</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Tentativas</TableHead>
                        <TableHead>Quando</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deadLetters.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {row.source === "inbox" ? "Entrada" : "Saída"}
                          </TableCell>
                          <TableCell>{row.event_type ?? "—"}</TableCell>
                          <TableCell className="max-w-[320px] text-sm text-muted-foreground">
                            {row.error_message ?? row.error_class ?? "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{row.attempts}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDateTime(row.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OrdersGuard>
  );
}
