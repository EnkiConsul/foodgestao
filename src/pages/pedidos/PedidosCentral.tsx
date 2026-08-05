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
import { OrderCard } from "@/components/orders/board/OrderCard";
import { OrderDetailsSheet } from "@/components/orders/board/OrderDetailsSheet";
import { ManualOrderDialog } from "@/components/orders/board/ManualOrderDialog";
import { useOrdersEntitlement } from "@/hooks/useOrdersEntitlement";
import { useOrdersUnits } from "@/hooks/useOrdersUnits";
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
  type PendencyKind,
} from "@/lib/orders/board";

function PedidosCentralContent() {
  const { entitlement, readOnly } = useOrdersEntitlement("orders.dashboard");
  const { entitlement: customerDataEnt } = useOrdersEntitlement("orders.customer_data");
  const { data: units } = useOrdersUnits();
  const { data: channels } = useOrdersChannels();

  const [unitId, setUnitId] = useState<string | null>(null);
  const [view, setView] = useState<"quadros" | "pendencias">("quadros");
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

  return (
    <div className="mx-auto max-w-[1600px] pb-24 md:pb-6">
      <Helmet>
        <title>Central de Pedidos — 360°FOOD</title>
        <meta
          name="description"
          content="Central de Pedidos 360°FOOD: fila em tempo real, produção, entrega e pedidos manuais de balcão, telefone e WhatsApp."
        />
      </Helmet>

      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar ao módulo Pedidos">
          <Link to="/pedidos">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold md:text-2xl">Central de Pedidos</h1>
          <p className="text-xs text-muted-foreground">
            {unit ? unit.nome : "Selecione uma unidade"} · atualização em tempo real
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge variant={online ? "secondary" : "destructive"} className="gap-1">
            {online ? (
              <Wifi className="h-3 w-3" aria-hidden="true" />
            ) : (
              <CloudOff className="h-3 w-3" aria-hidden="true" />
            )}
            {online ? "Conectado" : "Offline — reconectando"}
          </Badge>
          <div className="flex items-center gap-2">
            <Switch id="sound" checked={soundOn} onCheckedChange={setSoundOn} />
            <Label htmlFor="sound" className="flex items-center gap-1 text-xs">
              {soundOn ? (
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Som
            </Label>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label="Atualizar fila de pedidos"
            onClick={() => refetch()}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          {!readOnly && (
            <Button className="min-h-11" onClick={() => setManualOpen(true)} disabled={!unit}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Pedido manual
            </Button>
          )}
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-48 space-y-1">
          <Label htmlFor="board-unit" className="text-xs">
            Unidade
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

        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="quadros">Quadros</TabsTrigger>
            <TabsTrigger value="pendencias" className="gap-1">
              Pendências
              {pendencyCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                  {pendencyCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {unit?.operational_state !== "open" && unit && (
          <Badge variant="outline" className="gap-1">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Unidade{" "}
            {unit.operational_state === "paused" ? "pausada" : unit.operational_state}
          </Badge>
        )}
      </div>

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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {BOARD_COLUMNS.map((col) => {
            const list = orders.filter((o) => columnForStatus(o.status) === col.id);
            return (
              <section key={col.id} aria-labelledby={`col-${col.id}`} className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 id={`col-${col.id}`} className="text-sm font-semibold">
                    {col.title}
                  </h2>
                  <Badge variant="secondary">{list.length}</Badge>
                </div>
                <p className="mb-2 text-[11px] text-muted-foreground">{col.hint}</p>
                <div className="space-y-2">
                  {isLoading ? (
                    <Card className="p-4 text-xs text-muted-foreground">Carregando…</Card>
                  ) : list.length === 0 ? (
                    <Card className="p-4 text-xs text-muted-foreground">Sem pedidos aqui.</Card>
                  ) : (
                    list.map((o) => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        channelName={channelName(o.channel_id)}
                        deadlines={deadlines}
                        now={now}
                        readOnly={readOnly}
                        isBusy={action.isPending && action.variables?.orderId === o.id}
                        onOpen={setSelected}
                        onPrimaryAction={(order) => {
                          const primary = primaryActionFor(order);
                          if (!primary || primary.action === "cancel") {
                            setSelected(order);
                            return;
                          }
                          runAction(order, primary.action);
                        }}

                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
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
                  <h2 id={`pend-${kind}`} className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
                    {PENDENCY_LABELS[kind]}
                    <Badge variant="destructive">{list.length}</Badge>
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
