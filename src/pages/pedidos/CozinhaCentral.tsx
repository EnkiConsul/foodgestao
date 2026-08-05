import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft, ChefHat, Moon, RefreshCw, Sun } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrdersGuard } from "@/components/orders/OrdersGuard";
import { AlertsControl } from "@/components/orders/alerts/AlertsControl";
import { KitchenTicket } from "@/components/orders/kitchen/KitchenTicket";
import { PrintQueuePanel } from "@/components/orders/print/PrintQueuePanel";
import { useOrdersAlerts } from "@/hooks/useOrdersAlerts";
import { useOrdersEntitlement } from "@/hooks/useOrdersEntitlement";
import { useOrdersUnits } from "@/hooks/useOrdersUnits";
import { useOrderAction } from "@/hooks/useOrdersBoard";
import {
  useEnqueuePrintJob,
  useKitchenQueue,
  usePrintJobs,
  usePrintPreferences,
  useSetItemPrepared,
  useUpdatePrintJob,
  type PrintJob,
} from "@/hooks/useOrdersKitchen";
import {
  PRINT_STATIONS,
  STATION_LABELS,
  allItemsPrepared,
  kitchenPriority,
  pickupCode,
  sortKitchenQueue,
  ticketsForStation,
  type KitchenTicketData,
  type PrintStation,
} from "@/lib/orders/kitchen";
import { FULFILLMENT_LABELS } from "@/lib/orders/board";
import { detectConnector, printTickets, type PrintTicketInput } from "@/lib/orders/print";
import { cn } from "@/lib/utils";

function CozinhaContent() {
  const { entitlement, readOnly } = useOrdersEntitlement("orders.kitchen");
  const { entitlement: printEnt } = useOrdersEntitlement("orders.print");
  const { data: units } = useOrdersUnits();

  const [unitId, setUnitId] = useState<string | null>(null);
  const [station, setStation] = useState<PrintStation | "all">("all");
  const [dark, setDark] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const unit = useMemo(
    () => (units ?? []).find((u) => u.id === unitId) ?? (units ?? [])[0] ?? null,
    [units, unitId],
  );
  const prepMinutes = unit?.prep_time_minutes ?? 20;

  const { data: tickets, isLoading, refetch, isFetching } = useKitchenQueue(unit?.id ?? null, "kitchen");
  const { data: printJobs, isLoading: loadingJobs, refetch: refetchJobs } = usePrintJobs(unit?.id ?? null);
  const action = useOrderAction();
  const setPrepared = useSetItemPrepared();
  const enqueue = useEnqueuePrintJob();
  const updateJob = useUpdatePrintJob();
  const prefs = usePrintPreferences({ autoPrint: false });
  const alerts = useOrdersAlerts();
  const connector = useMemo(() => detectConnector(), []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  const queue = useMemo(() => {
    const filtered = ticketsForStation(tickets ?? [], station);
    return sortKitchenQueue(filtered as KitchenTicketData[], prepMinutes, now);
  }, [tickets, station, prepMinutes, now]);

  const lateTickets = useMemo(
    () => queue.filter((t) => kitchenPriority(t, prepMinutes, now) === "late"),
    [queue, prepMinutes, now],
  );

  // alerta de atraso na produção
  useEffect(() => {
    lateTickets.forEach((t) => {
      void alerts.alertOrder(
        `late:${t.id}`,
        `Pedido #${t.displayNumber} atrasado`,
        "A produção passou do tempo previsto.",
      );
    });
  }, [lateTickets, alerts]);

  const buildTicketInputs = useCallback(
    (ticket: KitchenTicketData, target: PrintStation, copies: number, isReprint: boolean): PrintTicketInput[] =>
      Array.from({ length: copies }, (_, index) => ({
        station: target,
        unitName: unit?.nome ?? "Unidade",
        displayNumber: ticket.displayNumber,
        orderTypeLabel: FULFILLMENT_LABELS[ticket.orderType] ?? ticket.orderType,
        placedAt: ticket.placedAt,
        items: ticket.items,
        notes: ticket.notes,
        pickupCode: pickupCode(ticket.id, ticket.displayNumber),
        isReprint,
        copyIndex: index + 1,
        copies,
      })),
    [unit?.nome],
  );

  const handlePrint = useCallback(
    async (ticket: KitchenTicketData, options?: { isReprint?: boolean; reason?: string; reprintOf?: string }) => {
      if (!printEnt.allowed) {
        toast.error("Você não tem permissão para imprimir comandas.");
        return;
      }
      const target: PrintStation = station === "all" ? "cozinha" : station;
      const copies = prefs.copies;
      const job = await enqueue.mutateAsync({
        orderId: ticket.id,
        station: target,
        status: ticket.status,
        copies,
        printerName: prefs.printerName || null,
        isReprint: options?.isReprint,
        reason: options?.reason ?? null,
        reprintOf: options?.reprintOf ?? null,
        reprintSeq: options?.isReprint ? Date.now() : undefined,
      });
      if (!job?.success || !job.job_id) return;

      const outcome = await printTickets(buildTicketInputs(ticket, target, copies, !!options?.isReprint), {
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
    [printEnt.allowed, station, prefs.copies, prefs.printerName, enqueue, buildTicketInputs, connector, updateJob],
  );

  // impressão automática das novas comandas aceitas
  const [autoPrinted, setAutoPrinted] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!prefs.autoPrint || readOnly || !printEnt.allowed) return;
    const pending = queue.filter((t) => t.status === "accepted" && !autoPrinted.has(t.id));
    if (pending.length === 0) return;
    setAutoPrinted((prev) => new Set([...prev, ...pending.map((t) => t.id)]));
    pending.forEach((t) => void handlePrint(t));
  }, [prefs.autoPrint, queue, readOnly, printEnt.allowed, autoPrinted, handlePrint]);

  function retryJob(job: PrintJob) {
    const ticket = (tickets ?? []).find((t) => t.id === job.order_id);
    if (!ticket) {
      toast.error("O pedido saiu da fila de produção.");
      return;
    }
    void handlePrint(ticket, { isReprint: true, reason: "Nova tentativa após falha", reprintOf: job.id });
  }

  function reprintJob(job: PrintJob, reason: string) {
    const ticket = (tickets ?? []).find((t) => t.id === job.order_id);
    if (!ticket) {
      toast.error("O pedido saiu da fila de produção.");
      return;
    }
    void handlePrint(ticket, { isReprint: true, reason, reprintOf: job.id });
  }

  function runAction(ticket: KitchenTicketData, act: "start" | "ready") {
    if (act === "ready" && !allItemsPrepared(ticket.items)) {
      toast.warning("Ainda há itens pendentes nesta comanda.");
    }
    action.mutate({ orderId: ticket.id, action: act, version: 0 });
  }

  return (
    <div className={cn("min-h-screen", dark && "bg-slate-950 text-slate-50")}>
      <div className="mx-auto max-w-[1600px] px-3 pb-24 pt-4 md:pb-6">
        <Helmet>
          <title>Cozinha — Produção de Pedidos | 360°FOOD</title>
          <meta
            name="description"
            content="Painel de produção da cozinha: fila por estação, itens prontos e impressão de comandas."
          />
          <link rel="canonical" href="/pedidos/cozinha" />
        </Helmet>

        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="min-h-11 min-w-11">
              <Link to="/pedidos/central" aria-label="Voltar para a central de pedidos">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <ChefHat className="h-6 w-6 text-primary" aria-hidden="true" /> Cozinha
              </h1>
              <p className="text-sm text-muted-foreground">
                {queue.length} comanda{queue.length === 1 ? "" : "s"} em produção
                {lateTickets.length > 0 ? ` · ${lateTickets.length} atrasada(s)` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(units ?? []).length > 1 && (
              <div className="flex items-center gap-2">
                <Label htmlFor="kitchen-unit" className="text-xs">
                  Unidade
                </Label>
                <Select value={unit?.id ?? ""} onValueChange={setUnitId}>
                  <SelectTrigger id="kitchen-unit" className="min-h-11 w-48">
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
            <Button
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11"
              aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
              onClick={() => setDark((v) => !v)}
            >
              {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11"
              aria-label="Atualizar fila"
              onClick={() => void refetch()}
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="mb-4 space-y-3">
          <Tabs value={station} onValueChange={(v) => setStation(v as PrintStation | "all")}>
            <TabsList>
              <TabsTrigger value="all">Todas</TabsTrigger>
              {PRINT_STATIONS.filter((s) => s !== "expedicao").map((s) => (
                <TabsTrigger key={s} value={s}>
                  {STATION_LABELS[s]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <AlertsControl
            alerts={alerts}
            pendingCount={lateTickets.length}
            onAcknowledgeAll={() => alerts.acknowledgeAll(lateTickets.map((t) => `late:${t.id}`))}
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando fila de produção…</p>
        ) : queue.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma comanda em produção nesta estação.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {queue.map((ticket) => (
              <KitchenTicket
                key={ticket.id}
                ticket={ticket}
                prepMinutes={prepMinutes}
                now={now}
                readOnly={readOnly}
                canMarkItems
                isBusy={setPrepared.isPending || action.isPending}
                onToggleItem={(itemId, prepared) => setPrepared.mutate({ itemId, prepared })}
                onStart={(t) => runAction(t, "start")}
                onReady={(t) => runAction(t, "ready")}
                onPrint={(t) => void handlePrint(t)}
              />
            ))}
          </div>
        )}

        <div className="mt-6">
          {printEnt.allowed ? (
            <PrintQueuePanel
              jobs={printJobs ?? []}
              isLoading={loadingJobs}
              readOnly={readOnly}
              copies={prefs.copies}
              onCopiesChange={prefs.setCopies}
              autoPrint={prefs.autoPrint}
              onAutoPrintChange={prefs.setAutoPrint}
              printerName={prefs.printerName}
              onPrinterNameChange={prefs.setPrinterName}
              connectorName={connector?.name ?? null}
              onRetry={retryJob}
              onReprint={reprintJob}
              onRefresh={() => void refetchJobs()}
              isBusy={enqueue.isPending || updateJob.isPending}
            />
          ) : (
            <Badge variant="outline">Impressão de comandas indisponível para o seu perfil</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CozinhaCentral() {
  return (
    <OrdersGuard operation="orders.kitchen">
      <CozinhaContent />
    </OrdersGuard>
  );
}
