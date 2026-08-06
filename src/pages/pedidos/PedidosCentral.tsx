import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CloudOff,
  Plus,
  RefreshCw,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrdersGuard } from "@/components/orders/OrdersGuard";
import { HelpHint } from "@/components/common/HelpHint";
import { OrderCard } from "@/components/orders/board/OrderCard";
import { OrderDetailsSheet } from "@/components/orders/board/OrderDetailsSheet";
import { ManualOrderDialog } from "@/components/orders/board/ManualOrderDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrdersEntitlement } from "@/hooks/useOrdersEntitlement";
import { useOrdersUnits } from "@/hooks/useOrdersUnits";
import { cn } from "@/lib/utils";
import {
  useOrderAction,
  useOrdersBoard,
  useOrdersChannels,
  useUnitDeadlines,
  type BoardOrder,
  type OrderAction,
} from "@/hooks/useOrdersBoard";
import {
  BOARD_COLUMNS,
  PENDENCY_LABELS,
  columnForStatus,
  pendenciesFor,
  primaryActionFor,
  type BoardColumnId,
  type PendencyKind,
} from "@/lib/orders/board";


const HELP = {
  title: "Visão geral em tempo real dos pedidos: acompanhe o fluxo do recebimento até a entrega.",
  sound: "Toca um alerta sonoro sempre que um novo pedido chegar na fila.",
  refresh: "Atualiza a fila de pedidos manualmente, sem esperar a atualização automática.",
  manualOrder: "Cadastra um pedido feito por telefone, balcão ou WhatsApp diretamente na fila.",
  unit: "Escolha qual unidade da rede você quer acompanhar.",
  tabQuadros: "Mostra os pedidos organizados por etapa: novos, em produção, prontos e entregues.",
  tabPendencias: "Lista só os pedidos com algum problema, como atraso ou pagamento pendente.",
  columnPrefix: "Etapa do fluxo: ",
  pendencyPrefix: "Tipo de pendência: ",
} as const;

function PedidosCentralContent() {
  const { entitlement, readOnly } = useOrdersEntitlement("orders.dashboard");
  const { entitlement: customerDataEnt } = useOrdersEntitlement("orders.customer_data");
  const { data: units } = useOrdersUnits();
  const { data: channels } = useOrdersChannels();
  const isMobile = useIsMobile();

  const [unitId, setUnitId] = useState<string | null>(null);
  const [view, setView] = useState<"quadros" | "pendencias">("quadros");
  const [activeColumn, setActiveColumn] = useState<BoardColumnId>("novos");
  const [selected, setSelected] = useState<BoardOrder | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const unit = useMemo(
    () => (units ?? []).find((u) => u.id === unitId) ?? (units ?? [])[0] ?? null,
    [units, unitId],
  );
  const deadlines = useUnitDeadlines(unit);
  const { orders, isLoading, refetch, isFetching, online } = useOrdersBoard(unit?.id ?? null);
  const action = useOrderAction();

  // relógio único para todos os temporizadores
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  // som opcional ao entrar um pedido novo
  const newCount = orders.filter((o) => o.status === "pending_acceptance").length;
  useEffect(() => {
    if (!soundOn || newCount === 0) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.05;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      window.setTimeout(() => {
        osc.stop();
        void ctx.close();
      }, 220);
    } catch {
      /* som é opcional */
    }
  }, [newCount, soundOn]);

  const channelName = (id: string | null) =>
    (channels ?? []).find((c) => c.id === id)?.name ?? null;

  const ordersByColumn = useMemo(() => {
    const map = new Map<BoardColumnId, BoardOrder[]>();
    BOARD_COLUMNS.forEach((c) => map.set(c.id, []));
    orders.forEach((o) => {
      const col = columnForStatus(o.status);
      if (col) map.get(col)!.push(o);
    });
    return map;
  }, [orders]);

  const pendencyList = useMemo(() => {
    const groups = new Map<PendencyKind, BoardOrder[]>();
    orders.forEach((o) => {
      pendenciesFor(o, deadlines, now).forEach((p) => {
        groups.set(p, [...(groups.get(p) ?? []), o]);
      });
    });
    return groups;
  }, [orders, deadlines, now]);

  const pendencyCount = Array.from(pendencyList.values()).reduce((a, l) => a + l.length, 0);

  function runAction(order: BoardOrder, act: OrderAction, reason?: string) {
    action.mutate(
      { orderId: order.id, action: act, version: order.version, reason },
      { onSuccess: () => setSelected(null) },
    );
  }

  function handlePrimary(order: BoardOrder) {
    const primary = primaryActionFor(order);
    if (!primary || primary.action === "cancel") {
      setSelected(order);
      return;
    }
    runAction(order, primary.action);
  }

  const renderCard = (o: BoardOrder, keyPrefix = "") => (
    <OrderCard
      key={`${keyPrefix}${o.id}`}
      order={o}
      channelName={channelName(o.channel_id)}
      deadlines={deadlines}
      now={now}
      readOnly={readOnly}
      isBusy={action.isPending && action.variables?.orderId === o.id}
      onOpen={setSelected}
      onPrimaryAction={handlePrimary}
    />
  );

  const emptyState = (text: string) => (
    <Card className="border-dashed bg-muted/30">
      <CardContent className="p-4 text-xs text-muted-foreground">{text}</CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-[1600px] pb-28 md:pb-6">
      <Helmet>
        <title>Central de Pedidos — 360°FOOD</title>
        <meta
          name="description"
          content="Central de Pedidos 360°FOOD: fila em tempo real, produção, entrega e pedidos manuais de balcão, telefone e WhatsApp."
        />
      </Helmet>

      {/* Cabeçalho fixo e compacto — no mobile mantém contexto ao rolar a fila */}
      <header className="sticky top-0 z-20 -mx-4 mb-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:mx-0 md:rounded-xl md:border md:px-4">
        <div className="flex items-start gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar ao módulo Pedidos" className="shrink-0">
            <Link to="/pedidos">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 truncate text-lg font-bold leading-tight md:text-2xl">
              <span className="truncate">Central de Pedidos</span>
              <HelpHint text={HELP.title} label="Ajuda sobre a central de pedidos" />
            </h1>
            <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground md:text-xs">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  online ? "bg-primary" : "bg-destructive",
                )}
                aria-hidden="true"
              />
              <span className="truncate">
                {unit ? unit.nome : "Selecione uma unidade"} ·{" "}
                {online ? "tempo real" : "offline — reconectando"}
              </span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Badge
              variant={online ? "secondary" : "destructive"}
              className="hidden gap-1 md:inline-flex"
            >
              {online ? (
                <Wifi className="h-3 w-3" aria-hidden="true" />
              ) : (
                <CloudOff className="h-3 w-3" aria-hidden="true" />
              )}
              {online ? "Conectado" : "Offline"}
            </Badge>

            <div className="hidden items-center gap-2 md:flex">
              <Switch id="sound" checked={soundOn} onCheckedChange={setSoundOn} />
              <Label htmlFor="sound" className="flex items-center gap-1 text-xs">
                {soundOn ? (
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Som
              </Label>
              <HelpHint text={HELP.sound} label="Ajuda sobre o som de novos pedidos" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 md:hidden"
              aria-label={soundOn ? "Desligar som de novos pedidos" : "Ligar som de novos pedidos"}
              onClick={() => setSoundOn((s) => !s)}
            >
              {soundOn ? (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 md:min-h-11 md:min-w-11"
              aria-label="Atualizar fila de pedidos"
              onClick={() => refetch()}
            >
              <RefreshCw
                className={cn("h-4 w-4", isFetching && "animate-spin")}
                aria-hidden="true"
              />
            </Button>
            <HelpHint text={HELP.refresh} label="Ajuda sobre atualizar a fila" className="hidden md:inline-flex" />
            {!readOnly && (
              <span className="hidden items-center gap-1 md:inline-flex">
                <Button
                  className="min-h-11"
                  onClick={() => setManualOpen(true)}
                  disabled={!unit}
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Pedido manual
                </Button>
                <HelpHint text={HELP.manualOrder} label="Ajuda sobre pedido manual" />
              </span>
            )}
          </div>
        </div>

        {/* Controles: unidade + visão */}
        <div className="mt-3 flex flex-wrap items-end gap-2 md:gap-3">
          <div className="min-w-40 flex-1 space-y-1 md:max-w-64 md:flex-none">
            <Label htmlFor="board-unit" className="flex items-center gap-1 text-[11px] text-muted-foreground">
              Unidade
              <HelpHint text={HELP.unit} label="Ajuda sobre escolha de unidade" />
            </Label>
            <Select value={unit?.id ?? ""} onValueChange={setUnitId}>
              <SelectTrigger id="board-unit" className="min-h-11">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(units ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="shrink-0">
            <TabsList className="h-11">
              <TabsTrigger value="quadros" className="gap-1">
                Quadros
                <HelpHint text={HELP.tabQuadros} label="Ajuda sobre a aba Quadros" />
              </TabsTrigger>
              <TabsTrigger value="pendencias" className="gap-1">
                Pendências
                {pendencyCount > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                    {pendencyCount}
                  </Badge>
                )}
                <HelpHint text={HELP.tabPendencias} label="Ajuda sobre a aba Pendências" />
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {unit && unit.operational_state !== "open" && (
            <Badge variant="outline" className="gap-1">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Unidade{" "}
              {unit.operational_state === "paused" ? "pausada" : unit.operational_state}
            </Badge>
          )}
        </div>

        {/* Mobile: seletor de etapa em chips roláveis (uma coluna por vez) */}
        {isMobile && view === "quadros" && unit && (
          <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1">
            <div className="flex w-max gap-2" role="tablist" aria-label="Etapas da fila">
              {BOARD_COLUMNS.map((col) => {
                const count = ordersByColumn.get(col.id)?.length ?? 0;
                const isActive = activeColumn === col.id;
                return (
                  <button
                    key={col.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveColumn(col.id)}
                    className={cn(
                      "flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {col.title}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px] font-semibold",
                        isActive ? "bg-primary-foreground/20" : "bg-muted",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {!unit ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhuma unidade operacional encontrada.{" "}
            <Link to="/pedidos/onboarding" className="underline">
              Ative sua primeira unidade
            </Link>
            .
          </CardContent>
        </Card>
      ) : view === "quadros" ? (
        isMobile ? (
          /* Mobile: fila vertical da etapa selecionada */
          <section aria-live="polite" className="space-y-2">
            <p className="text-[11px] text-muted-foreground">
              {BOARD_COLUMNS.find((c) => c.id === activeColumn)?.hint}
            </p>
            {isLoading
              ? emptyState("Carregando…")
              : (ordersByColumn.get(activeColumn) ?? []).length === 0
                ? emptyState("Sem pedidos nesta etapa.")
                : (ordersByColumn.get(activeColumn) ?? []).map((o) => renderCard(o))}
          </section>
        ) : (
          /* Desktop: quadro kanban com cabeçalhos fixos e colunas roláveis */
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {BOARD_COLUMNS.map((col) => {
              const list = ordersByColumn.get(col.id) ?? [];
              return (
                <section
                  key={col.id}
                  aria-labelledby={`col-${col.id}`}
                  className="min-w-0 rounded-xl border bg-muted/20 p-2"
                >
                  <div className="sticky top-0 z-10 rounded-lg bg-muted/60 px-2 py-2 backdrop-blur">
                    <div className="flex items-center justify-between gap-2">
                      <h2 id={`col-${col.id}`} className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold">
                        <span className="truncate">{col.title}</span>
                        <HelpHint text={`${HELP.columnPrefix}${col.hint}`} label={`Ajuda sobre a etapa ${col.title}`} />
                      </h2>
                      <Badge variant="secondary">{list.length}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{col.hint}</p>
                  </div>
                  <div className="mt-2 space-y-2 overflow-y-auto pr-0.5 xl:max-h-[calc(100vh-19rem)]">
                    {isLoading
                      ? emptyState("Carregando…")
                      : list.length === 0
                        ? emptyState("Sem pedidos aqui.")
                        : list.map((o) => renderCard(o))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {pendencyCount === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Nenhuma pendência agora. Tudo dentro dos prazos configurados da unidade.
              </CardContent>
            </Card>
          ) : (
            (Object.keys(PENDENCY_LABELS) as PendencyKind[]).map((kind) => {
              const list = pendencyList.get(kind) ?? [];
              if (list.length === 0) return null;
              return (
                <section key={kind} aria-labelledby={`pend-${kind}`}>
                  <h2
                    id={`pend-${kind}`}
                    className="mb-2 flex items-center gap-2 text-sm font-semibold"
                  >
                    <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
                    {PENDENCY_LABELS[kind]}
                    <Badge variant="destructive">{list.length}</Badge>
                    <HelpHint
                      text={`${HELP.pendencyPrefix}${PENDENCY_LABELS[kind]}`}
                      label={`Ajuda sobre a pendência ${PENDENCY_LABELS[kind]}`}
                    />
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {list.map((o) => (
                      <OrderCard
                        key={`${kind}-${o.id}`}
                        order={o}
                        channelName={channelName(o.channel_id)}
                        deadlines={deadlines}
                        now={now}
                        readOnly={readOnly}
                        isBusy={action.isPending && action.variables?.orderId === o.id}
                        onOpen={setSelected}
                        onPrimaryAction={setSelected}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}

      {/* Mobile: ação principal flutuante */}
      {isMobile && !readOnly && unit && (
        <Button
          size="lg"
          className="fixed bottom-20 right-4 z-30 h-14 rounded-full px-5 shadow-lg"
          onClick={() => setManualOpen(true)}
        >
          <Plus className="mr-2 h-5 w-5" aria-hidden="true" /> Pedido
        </Button>
      )}

      <OrderDetailsSheet
        order={selected}
        channelName={channelName(selected?.channel_id ?? null)}
        canSeeCustomerData={customerDataEnt.allowed && !customerDataEnt.read_only}
        readOnly={readOnly}
        isBusy={action.isPending}
        onClose={() => setSelected(null)}
        onAction={runAction}
      />

      <ManualOrderDialog open={manualOpen} unit={unit} onOpenChange={setManualOpen} />
    </div>
  );
}

export default function PedidosCentral() {
  return (
    <OrdersGuard operation="orders.dashboard">
      <PedidosCentralContent />
    </OrdersGuard>
  );
}
