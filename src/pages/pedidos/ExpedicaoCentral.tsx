import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft, PackageCheck, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { OrdersGuard } from "@/components/orders/OrdersGuard";
import { AlertsControl } from "@/components/orders/alerts/AlertsControl";
import { useOrdersAlerts } from "@/hooks/useOrdersAlerts";
import { useOrdersEntitlement } from "@/hooks/useOrdersEntitlement";
import { useOrdersUnits } from "@/hooks/useOrdersUnits";
import { useOrderAction } from "@/hooks/useOrdersBoard";
import {
  useEnqueuePrintJob,
  useKitchenQueue,
  usePrintPreferences,
  useUpdatePrintJob,
} from "@/hooks/useOrdersKitchen";
import {
  EXPEDITION_CHECKS,
  EXPEDITION_CHECK_LABELS,
  canReleaseExpedition,
  elapsedPrepMinutes,
  expeditionPrimaryLabel,
  pendingItemsCount,
  pickupCode,
  type ExpeditionChecklistState,
  type KitchenTicketData,
} from "@/lib/orders/kitchen";
import { FULFILLMENT_LABELS, statusLabel } from "@/lib/orders/board";
import { detectConnector, printTickets, type PrintTicketInput } from "@/lib/orders/print";

const EMPTY_CHECK: ExpeditionChecklistState = {
  itemsChecked: false,
  packagingChecked: false,
  drinksChecked: false,
};

function ExpedicaoContent() {
  const { entitlement, readOnly } = useOrdersEntitlement("orders.expedition");
  const { entitlement: printEnt } = useOrdersEntitlement("orders.print");
  const { data: units } = useOrdersUnits();

  const [unitId, setUnitId] = useState<string | null>(null);
  const [requireChecklist, setRequireChecklist] = useState(true);
  const [checks, setChecks] = useState<Record<string, ExpeditionChecklistState>>({});
  const [couriers, setCouriers] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  const unit = useMemo(
    () => (units ?? []).find((u) => u.id === unitId) ?? (units ?? [])[0] ?? null,
    [units, unitId],
  );
  const { data: tickets, isLoading, refetch, isFetching } = useKitchenQueue(unit?.id ?? null, "expedition");
  const action = useOrderAction();
  const enqueue = useEnqueuePrintJob();
  const updateJob = useUpdatePrintJob();
  const prefs = usePrintPreferences();
  const alerts = useOrdersAlerts();
  const connector = useMemo(() => detectConnector(), []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  const queue = useMemo(
    () =>
      [...(tickets ?? [])].sort(
        (a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime(),
      ),
    [tickets],
  );

  const waiting = useMemo(
    () => queue.filter((t) => t.status === "ready" || t.status === "awaiting_pickup"),
    [queue],
  );

  // alerta de pedido parado aguardando retirada/saída
  const pickupLimit = unit?.pickup_deadline_minutes ?? 15;
  const stalled = useMemo(
    () => waiting.filter((t) => elapsedPrepMinutes(t, now) > pickupLimit),
    [waiting, now, pickupLimit],
  );
  useEffect(() => {
    stalled.forEach((t) => {
      void alerts.alertOrder(
        `pickup:${t.id}`,
        `Pedido #${t.displayNumber} aguardando saída`,
        "Pronto há mais tempo que o previsto para retirada.",
      );
    });
  }, [stalled, alerts]);

  const checkOf = (id: string) => checks[id] ?? EMPTY_CHECK;

  function toggleCheck(id: string, key: keyof ExpeditionChecklistState, value: boolean) {
    setChecks((prev) => ({ ...prev, [id]: { ...checkOf(id), [key]: value } }));
  }

  const handlePrint = useCallback(
    async (ticket: KitchenTicketData) => {
      if (!printEnt.allowed) {
        toast.error("Você não tem permissão para imprimir comandas.");
        return;
      }
      const job = await enqueue.mutateAsync({
        orderId: ticket.id,
        station: "expedicao",
        status: ticket.status,
        copies: prefs.copies,
        printerName: prefs.printerName || null,
      });
      if (!job?.success || !job.job_id) return;

      const inputs: PrintTicketInput[] = Array.from({ length: prefs.copies }, (_, index) => ({
        station: "expedicao",
        unitName: unit?.nome ?? "Unidade",
        displayNumber: ticket.displayNumber,
        orderTypeLabel: FULFILLMENT_LABELS[ticket.orderType] ?? ticket.orderType,
        placedAt: ticket.placedAt,
        items: ticket.items,
        notes: ticket.notes,
        pickupCode: pickupCode(ticket.id, ticket.displayNumber),
        courierName: couriers[ticket.id] ?? null,
        copyIndex: index + 1,
        copies: prefs.copies,
      }));
      const outcome = await printTickets(inputs, {
        printer: prefs.printerName || null,
        connector,
      });
      const errorMessage = "error" in outcome ? outcome.error : null;
      await updateJob.mutateAsync({
        jobId: job.job_id,
        status: outcome.ok ? "printed" : "failed",
        error: errorMessage,
        printerName: prefs.printerName || null,
      });
      if (errorMessage) toast.error(errorMessage);
    },
    [printEnt.allowed, enqueue, prefs.copies, prefs.printerName, unit?.nome, couriers, connector, updateJob],
  );

  function release(ticket: KitchenTicketData) {
    if (!canReleaseExpedition(checkOf(ticket.id), requireChecklist)) {
      toast.warning("Conclua a conferência antes de liberar o pedido.");
      return;
    }
    if (pendingItemsCount(ticket.items) > 0) {
      toast.warning("Ainda há itens não marcados como prontos pela produção.");
    }
    const isDelivery = ticket.orderType === "delivery";
    if (ticket.status === "ready") {
      action.mutate({
        orderId: ticket.id,
        action: isDelivery ? "dispatch" : "await_pickup",
        version: 0,
        courierName: isDelivery ? couriers[ticket.id]?.trim() || undefined : undefined,
      });
      return;
    }
    action.mutate({ orderId: ticket.id, action: isDelivery ? "deliver" : "complete", version: 0 });
  }

  return (
    <div className="mx-auto max-w-[1400px] px-3 pb-24 pt-4 md:pb-6">
      <Helmet>
        <title>Expedição — Conferência e Saída de Pedidos | 360°FOOD</title>
        <meta
          name="description"
          content="Conferência de pedidos prontos, código de retirada, entregador e liberação para saída."
        />
        <link rel="canonical" href="/pedidos/expedicao" />
      </Helmet>

      <OrdersPageHeader
        backTo="/pedidos/central"
        backLabel="Voltar para a central de pedidos"
        title="Expedição"
        icon={<PackageCheck className="h-6 w-6 text-primary" aria-hidden="true" />}
        subtitle={`${queue.length} pedido${queue.length === 1 ? "" : "s"} na conferência${
          stalled.length > 0 ? ` · ${stalled.length} aguardando saída` : ""
        }`}
        actions={
          <>
            <div className="hidden items-center gap-2 md:flex">
              <Switch id="require-check" checked={requireChecklist} onCheckedChange={setRequireChecklist} />
              <Label htmlFor="require-check" className="text-xs">
                Exigir conferência
              </Label>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 md:min-h-11 md:min-w-11"
              aria-label="Atualizar fila de expedição"
              onClick={() => void refetch()}
            >
              <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          {(units ?? []).length > 1 && (
            <div className="min-w-40 flex-1 space-y-1 md:max-w-64 md:flex-none">
              <Label htmlFor="exp-unit" className="text-[11px] text-muted-foreground">
                Unidade
              </Label>
              <Select value={unit?.id ?? ""} onValueChange={setUnitId}>
                <SelectTrigger id="exp-unit" className="min-h-11">
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
          )}
          <div className="flex items-center gap-2 md:hidden">
            <Switch
              id="require-check-mobile"
              checked={requireChecklist}
              onCheckedChange={setRequireChecklist}
            />
            <Label htmlFor="require-check-mobile" className="text-xs">
              Exigir conferência
            </Label>
          </div>
        </div>
      </OrdersPageHeader>

      <div className="mb-4">
        <AlertsControl
          alerts={alerts}
          pendingCount={stalled.length}
          onAcknowledgeAll={() => alerts.acknowledgeAll(stalled.map((t) => `pickup:${t.id}`))}
        />
      </div>


      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando fila de expedição…</p>
      ) : queue.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum pedido aguardando conferência.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {queue.map((ticket) => {
            const state = checkOf(ticket.id);
            const isDelivery = ticket.orderType === "delivery";
            return (
              <Card key={ticket.id}>
                <CardHeader className="flex-row items-start justify-between gap-2 pb-2">
                  <div>
                    <CardTitle className="text-lg">#{ticket.displayNumber}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {FULFILLMENT_LABELS[ticket.orderType] ?? ticket.orderType} ·{" "}
                      {statusLabel(ticket.status)} · {elapsedPrepMinutes(ticket, now)} min
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono">
                    {pickupCode(ticket.id, ticket.displayNumber)}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1 text-sm">
                    {ticket.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-2">
                        <span className={item.preparedAt ? "" : "text-amber-600"}>
                          {item.quantity}× {item.name}
                          {item.variantName ? ` (${item.variantName})` : ""}
                        </span>
                        {!item.preparedAt && (
                          <Badge variant="outline" className="text-[10px]">
                            em produção
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>

                  {!readOnly && (
                    <>
                      <div className="space-y-2 rounded-md border p-2">
                        {EXPEDITION_CHECKS.map((key) => (
                          <div key={key} className="flex items-center gap-2">
                            <Checkbox
                              id={`${ticket.id}-${key}`}
                              checked={state[key]}
                              onCheckedChange={(v) => toggleCheck(ticket.id, key, v === true)}
                            />
                            <Label htmlFor={`${ticket.id}-${key}`} className="text-xs">
                              {EXPEDITION_CHECK_LABELS[key]}
                            </Label>
                          </div>
                        ))}
                      </div>

                      {isDelivery && (
                        <div className="space-y-1">
                          <Label htmlFor={`courier-${ticket.id}`} className="text-xs">
                            Entregador
                          </Label>
                          <Input
                            id={`courier-${ticket.id}`}
                            className="min-h-11"
                            maxLength={120}
                            value={couriers[ticket.id] ?? ""}
                            placeholder="Nome de quem vai levar"
                            onChange={(e) =>
                              setCouriers((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                            }
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="min-h-11 flex-1"
                          disabled={action.isPending || !canReleaseExpedition(state, requireChecklist)}
                          onClick={() => release(ticket)}
                        >
                          {isDelivery && <Truck className="mr-2 h-4 w-4" aria-hidden="true" />}
                          {ticket.status === "ready"
                            ? expeditionPrimaryLabel(ticket.orderType)
                            : isDelivery
                              ? "Confirmar entrega"
                              : "Concluir pedido"}
                        </Button>
                        {printEnt.allowed && (
                          <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={enqueue.isPending || updateJob.isPending}
                            onClick={() => void handlePrint(ticket)}
                          >
                            Imprimir via
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ExpedicaoCentral() {
  return (
    <OrdersGuard operation="orders.expedition">
      <ExpedicaoContent />
    </OrdersGuard>
  );
}
