import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  Download,
  Printer,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrdersGuard } from "@/components/orders/OrdersGuard";
import { HelpHint } from "@/components/common/HelpHint";
import { OrdersPageHeader, ScrollRow } from "@/components/orders/OrdersPageHeader";
import { ResponsiveTable } from "@/components/orders/ResponsiveTable";
import { useOrdersUnits } from "@/hooks/useOrdersUnits";
import {
  useOrdersExport,
  useOrdersOpsHealth,
  useOrdersReportOverview,
  type OrdersExportDataset,
} from "@/hooks/useOrdersReports";

const CHANNEL_LABEL: Record<string, string> = {
  manual: "Manual / balcão",
  whatsapp: "WhatsApp",
  totem: "Totem",
  site: "Site próprio",
  app: "Aplicativo",
  marketplace: "Marketplace",
  integration: "Integração",
};

const TYPE_LABEL: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Retirada",
  dine_in: "Salão / mesa",
  drive_thru: "Drive-thru",
};

const TIMING_LABEL: Record<string, string> = {
  immediate: "Imediato",
  scheduled: "Agendado",
};

const EXPORTS: { key: OrdersExportDataset; label: string; hint: string }[] = [
  { key: "orders", label: "Pedidos", hint: "Cabeçalho, valores e marcos de tempo" },
  { key: "items", label: "Itens", hint: "Produtos, quantidades e preparo" },
  { key: "payments", label: "Pagamentos", hint: "Formas, valores e estornos" },
  { key: "cancellations", label: "Cancelamentos", hint: "Motivos e datas" },
  { key: "customers", label: "Clientes", hint: "Exige permissão de dados de clientes" },
];


const HELP = {
  title: "Indicadores operacionais do módulo Pedidos: volume, tempos e atrasos. Não substitui relatórios contábeis.",
  kpiOrders: "Total de pedidos criados no período e filtros escolhidos, com quantos foram concluídos ou cancelados.",
  kpiTicket: "Vendas brutas dividido pelo número de pedidos do período selecionado.",
  kpiTime: "Tempo médio entre a criação e a conclusão do pedido, incluindo aceite, preparo e entrega.",
  kpiDelays: "Pedidos que ultrapassaram o tempo de tolerância definido na unidade.",
  tabResumo: "Visão geral de valores, pedidos por unidade, canal e tipo.",
  tabOperacao: "Tempos de cozinha, desempenho de entrega e volume por dia.",
  tabProdutos: "Produtos mais vendidos e horários com mais pedidos.",
  tabTecnico: "Situação técnica da operação: pedidos travados, impressão e falhas.",
  tabExportar: "Baixe os dados detalhados do período em arquivos CSV.",
  valoresPeriodo: "Soma de vendas, descontos, taxas e reembolsos no período e filtros escolhidos.",
  pedidosUnidade: "Quantidade de pedidos e receita gerada por cada unidade no período.",
  pedidosCanalTipo: "Pedidos agrupados por canal de venda (site, app, balcão etc.) e por tipo (entrega, retirada, salão).",
  produtosVendidos: "Ranking dos produtos com mais unidades vendidas e o tempo médio de preparo de cada um.",
  horariosPico: "Distribuição dos pedidos por hora do dia, para planejar equipe e estoque.",
  saudeTecnica: "Indicadores técnicos: pedidos parados, falhas de impressão e falhas definitivas nas integrações.",
  exportacoesSeguras: "Exportações em CSV que respeitam o período e a unidade filtrados, com dados sensíveis mascarados quando necessário.",
  exportOrders: "Dados completos de cabeçalho, valores e horários de cada pedido.",
  exportItems: "Lista de produtos vendidos, quantidades e tempos de preparo por pedido.",
  exportPayments: "Formas de pagamento usadas, valores recebidos e estornos.",
  exportCancellations: "Pedidos cancelados, com motivo e data do cancelamento.",
  exportCustomers: "Dados de clientes vinculados aos pedidos; só disponível com permissão específica.",
};

function money(cents: number | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function duration(seconds: number | undefined): string {
  const value = seconds ?? 0;
  if (!value) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)} min`;
  return `${(value / 3600).toFixed(1)} h`;
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export default function PedidosRelatorios() {
  const [from, setFrom] = useState(() => isoDaysAgo(29));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [unitId, setUnitId] = useState<string>("all");
  const [includeTest, setIncludeTest] = useState(false);

  const filters = useMemo(
    () => ({ from, to, unitId: unitId === "all" ? null : unitId, includeTest }),
    [from, to, unitId, includeTest],
  );

  const { data: units = [] } = useOrdersUnits();
  const { data: report, isLoading, error } = useOrdersReportOverview(filters);
  const { data: health } = useOrdersOpsHealth();
  const exportMutation = useOrdersExport(filters);

  const totals = report?.totals;
  const peak = report?.peak_hours ?? [];
  const maxPeak = peak.reduce((acc, row) => Math.max(acc, row.orders), 0);

  return (
    <OrdersGuard operation="orders.reports">
      <Helmet>
        <title>Relatórios de Pedidos | 360°FOOD</title>
        <meta
          name="description"
          content="Indicadores operacionais do módulo Pedidos: volume, ticket médio, tempos de aceite e preparo, atrasos, cancelamentos e desempenho de entrega."
        />
      </Helmet>

      <div className="space-y-6 pb-10">
        <OrdersPageHeader
          backTo="/pedidos"
          backLabel="Voltar ao módulo Pedidos"
          title="Relatórios operacionais"
          icon={<BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />}
          subtitle="Indicadores de operação — não substituem os relatórios contábeis nem o DRE."
        />

        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="rep-from">De</Label>
              <Input
                id="rep-from"
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-to">Até</Label>
              <Input
                id="rep-to"
                type="date"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as unidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as unidades</SelectItem>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2">
                <Switch
                  id="rep-test"
                  checked={includeTest}
                  onCheckedChange={setIncludeTest}
                />
                <Label htmlFor="rep-test" className="text-sm">
                  Incluir pedidos de teste
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Card className="border-destructive/50">
            <CardContent className="pt-6 text-sm text-destructive">
              Não foi possível carregar os indicadores: {(error as Error).message}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pedidos no período</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {isLoading ? "—" : (totals?.orders ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {totals?.orders_completed ?? 0} concluídos · {totals?.orders_cancelled ?? 0}{" "}
                cancelados
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ticket médio</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {isLoading ? "—" : money(totals?.avg_ticket)}
              </div>
              <p className="text-xs text-muted-foreground">
                Vendas brutas {money(totals?.gross_sales)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tempo médio total</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {isLoading ? "—" : duration(totals?.avg_total_seconds)}
              </div>
              <p className="text-xs text-muted-foreground">
                P95 {duration(totals?.p95_total_seconds)}
              </p>
            </CardContent>
          </Card>
          <Card
            className={(totals?.late_orders ?? 0) > 0 ? "border-destructive/50" : undefined}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Atrasos</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {isLoading ? "—" : (totals?.late_orders ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {totals?.late_rate ?? 0}% acima da tolerância da unidade
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="resumo">
          <ScrollRow>
            <TabsList className="h-11">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="operacao">Operação</TabsTrigger>
              <TabsTrigger value="produtos">Produtos e pico</TabsTrigger>
              <TabsTrigger value="tecnico">Saúde técnica</TabsTrigger>
              <TabsTrigger value="exportar">Exportar</TabsTrigger>
            </TabsList>
          </ScrollRow>

          <TabsContent value="resumo" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Valores do período</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Vendas brutas", money(totals?.gross_sales)],
                  ["Descontos", money(totals?.discounts)],
                  ["Taxa de entrega", money(totals?.delivery_fees)],
                  ["Taxa de serviço", money(totals?.service_fees)],
                  ["Reembolsos", money(totals?.refunds)],
                  ["Total dos pedidos", money(totals?.total_amount)],
                  ["Líquido estimado", money(totals?.estimated_net)],
                  ["Pedidos de teste", String(totals?.test_orders ?? 0)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold">{value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pedidos por unidade</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ResponsiveTable
                    rows={report?.by_unit ?? []}
                    getKey={(row) => row.unit_id}
                    empty="Nenhum pedido no período."
                    columns={[
                      { key: "unit", header: "Unidade", primary: true, cell: (row) => row.unit_name },
                      { key: "orders", header: "Pedidos", align: "right", cell: (row) => row.orders },
                      { key: "revenue", header: "Receita", align: "right", cell: (row) => money(row.revenue) },
                    ]}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pedidos por canal e tipo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {(report?.by_channel ?? []).map((row) => (
                      <div
                        key={row.channel}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>{CHANNEL_LABEL[row.channel] ?? row.channel}</span>
                        <span className="text-muted-foreground">
                          {row.orders} · {money(row.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 border-t pt-3">
                    {(report?.by_type ?? []).map((row) => (
                      <div
                        key={`${row.order_type}-${row.order_timing}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>
                          {TYPE_LABEL[row.order_type] ?? row.order_type}
                          <Badge variant="outline" className="ml-2">
                            {TIMING_LABEL[row.order_timing] ?? row.order_timing}
                          </Badge>
                        </span>
                        <span className="text-muted-foreground">
                          {row.orders} · {money(row.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="operacao" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4" /> Desempenho da cozinha
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Tempo médio de aceite", duration(totals?.avg_accept_seconds)],
                  ["Tempo médio de preparo", duration(totals?.avg_prep_seconds)],
                  ["Tempo médio total", duration(totals?.avg_total_seconds)],
                  ["Taxa de cancelamento", `${totals?.cancel_rate ?? 0}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold">{value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="h-4 w-4" /> Desempenho da entrega
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Entregas", String(report?.delivery?.deliveries ?? 0)],
                  ["Concluídas", String(report?.delivery?.delivered ?? 0)],
                  ["Falhas", String(report?.delivery?.failed ?? 0)],
                  ["Coleta média", duration(report?.delivery?.avg_pickup_seconds)],
                  ["Trajeto médio", duration(report?.delivery?.avg_transit_seconds)],
                  [
                    "Distância média",
                    `${(((report?.delivery?.avg_distance_meters ?? 0) / 1000) || 0).toFixed(1)} km`,
                  ],
                  ["Taxas de entrega", money(report?.delivery?.fees)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold">{value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Pedidos por dia</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ResponsiveTable
                  rows={report?.by_day ?? []}
                  getKey={(row) => row.day}
                  empty="Nenhum pedido no período."
                  columns={[
                    {
                      key: "day",
                      header: "Dia",
                      primary: true,
                      cell: (row) => new Date(`${row.day}T12:00:00`).toLocaleDateString("pt-BR"),
                    },
                    { key: "orders", header: "Pedidos", align: "right", cell: (row) => row.orders },
                    { key: "revenue", header: "Receita", align: "right", cell: (row) => money(row.revenue) },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="produtos" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Produtos mais vendidos</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ResponsiveTable
                  rows={report?.top_products ?? []}
                  getKey={(row) => row.product}
                  empty="Sem itens vendidos no período."
                  columns={[
                    { key: "product", header: "Produto", primary: true, cell: (row) => row.product },
                    { key: "qty", header: "Qtd.", align: "right", cell: (row) => row.quantity },
                    { key: "revenue", header: "Receita", align: "right", cell: (row) => money(row.revenue) },
                    { key: "prep", header: "Preparo", align: "right", cell: (row) => duration(row.avg_prep_seconds) },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horários de pico</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {peak.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados no período.</p>
                ) : (
                  peak.map((row) => (
                    <div key={row.hour} className="flex items-center gap-3 text-sm">
                      <span className="w-12 tabular-nums text-muted-foreground">
                        {String(row.hour).padStart(2, "0")}h
                      </span>
                      <div className="h-2 flex-1 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{
                            width: `${maxPeak ? (row.orders / maxPeak) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="w-10 text-right tabular-nums">{row.orders}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tecnico" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pedidos abertos</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{health?.orders?.open_orders ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  {health?.orders?.awaiting_accept ?? 0} aguardando aceite
                </p>
              </CardContent>
            </Card>
            <Card
              className={
                (health?.orders?.stuck_over_2h ?? 0) > 0 ? "border-destructive/50" : undefined
              }
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Travados &gt; 2h</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {health?.orders?.stuck_over_2h ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">Requer intervenção manual</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Impressão (7 dias)</CardTitle>
                <Printer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{health?.print?.failed ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  falhas · {health?.print?.queued ?? 0} na fila de {health?.print?.total ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Falhas definitivas</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {health?.dead_letters?.open_dead_letters ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  <Link to="/pedidos/integracoes" className="underline">
                    Ver filas e integrações
                  </Link>
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exportar" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Exportações seguras</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Os arquivos respeitam o período e a unidade selecionados. Nome e telefone do
                  cliente são mascarados para quem não tem a permissão de dados de clientes, e
                  cada exportação é registrada na auditoria.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {EXPORTS.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.hint}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={exportMutation.isPending}
                        onClick={() => exportMutation.mutate(item.key)}
                      >
                        <Download className="mr-2 h-4 w-4" /> CSV
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OrdersGuard>
  );
}
