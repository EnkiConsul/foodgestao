import { useState } from "react";
import { Bike, ClipboardList, History, Loader2, Ban, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatCents } from "@/lib/orders/catalog";
import { ORDER_TRANSITIONS } from "@/lib/orders/orders";
import {
  CHANNEL_LABELS,
  FULFILLMENT_LABELS,
  PAYMENT_STATUS_LABELS,
  maskAddress,
  maskPhone,
  primaryActionFor,
  shortCustomerName,
  statusLabel,
} from "@/lib/orders/board";
import type { BoardOrder, OrderAction } from "@/hooks/useOrdersBoard";
import { useOrderDetail } from "@/hooks/useOrdersBoard";

interface Props {
  order: BoardOrder | null;
  channelName?: string | null;
  canSeeCustomerData: boolean;
  readOnly?: boolean;
  isBusy?: boolean;
  onClose: () => void;
  onAction: (order: BoardOrder, action: OrderAction, reason?: string) => void;
}

export function OrderDetailsSheet({
  order,
  channelName,
  canSeeCustomerData,
  readOnly,
  isBusy,
  onClose,
  onAction,
}: Props) {
  const { data, isLoading } = useOrderDetail(order?.id ?? null);
  const [reason, setReason] = useState("");

  if (!order) return null;

  const primary = primaryActionFor(order);
  const canRequestCancel = ORDER_TRANSITIONS[order.status].includes("cancellation_requested");
  const canCancel = ORDER_TRANSITIONS[order.status].includes("cancelled");

  return (
    <Sheet open={!!order} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            Pedido #{order.display_number}
            <Badge variant="secondary">{statusLabel(order.status)}</Badge>
          </SheetTitle>
          <SheetDescription>
            {channelName ?? CHANNEL_LABELS.balcao} ·{" "}
            {FULFILLMENT_LABELS[order.order_type] ?? order.order_type} ·{" "}
            {new Date(order.placed_at).toLocaleString("pt-BR")}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando detalhes…
          </div>
        ) : (
          <div className="space-y-5 py-4 text-sm">
            <section aria-labelledby="detalhe-itens">
              <h3 id="detalhe-itens" className="mb-2 flex items-center gap-2 font-semibold">
                <ClipboardList className="h-4 w-4" aria-hidden="true" /> Itens
              </h3>
              <ul className="space-y-3">
                {(data?.items ?? []).map((item) => (
                  <li key={item.id}>
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">
                        {item.quantity}× {item.name_snapshot}
                        {item.variant_name_snapshot ? ` (${item.variant_name_snapshot})` : ""}
                      </span>
                      <span>{formatCents(item.total_price)}</span>
                    </div>
                    {(data?.options ?? [])
                      .filter((o) => o.item_id === item.id)
                      .map((o) => (
                        <p key={o.id} className="pl-4 text-xs text-muted-foreground">
                          + {o.quantity}× {o.name_snapshot}
                          {o.group_name_snapshot ? ` — ${o.group_name_snapshot}` : ""}
                          {o.total_price ? ` (${formatCents(o.total_price)})` : ""}
                        </p>
                      ))}
                    {item.notes && (
                      <p className="pl-4 text-xs italic text-muted-foreground">Obs.: {item.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
              {order.notes && (
                <p className="mt-3 rounded-md bg-muted p-2 text-xs">
                  <strong>Observações do pedido:</strong> {order.notes}
                </p>
              )}
            </section>

            <Separator />

            <section aria-labelledby="detalhe-valores">
              <h3 id="detalhe-valores" className="mb-2 font-semibold">
                Valores e pagamento
              </h3>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>{formatCents(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Desconto</dt>
                  <dd>-{formatCents(order.discount_amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Taxa de entrega</dt>
                  <dd>{formatCents(order.delivery_fee)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Taxa de serviço</dt>
                  <dd>{formatCents(order.service_fee)}</dd>
                </div>
                <div className="flex justify-between font-semibold text-foreground">
                  <dt>Total</dt>
                  <dd>{formatCents(order.total_amount)}</dd>
                </div>
                {order.total_amount !== order.original_total_amount && (
                  <div className="flex justify-between text-muted-foreground">
                    <dt>Valor original</dt>
                    <dd>{formatCents(order.original_total_amount)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>Situação</dt>
                  <dd>{PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}</dd>
                </div>
              </dl>
              {(data?.adjustments ?? []).length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {data!.adjustments.map((a) => (
                    <li key={a.id}>
                      Ajuste {a.kind}: {formatCents(a.amount)} {a.reason ? `— ${a.reason}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Separator />

            <section aria-labelledby="detalhe-cliente">
              <h3 id="detalhe-cliente" className="mb-2 flex items-center gap-2 font-semibold">
                <User className="h-4 w-4" aria-hidden="true" /> Cliente
              </h3>
              <p>
                {canSeeCustomerData
                  ? (order.customer_name ?? "Cliente não identificado")
                  : shortCustomerName(order.customer_name)}
              </p>
              <p className="text-xs text-muted-foreground">
                {maskPhone(order.customer_phone, canSeeCustomerData)}
              </p>
              {data?.delivery && (
                <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                  <Bike className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {maskAddress(
                      data.delivery.address as Record<string, unknown> | null,
                      canSeeCustomerData,
                    )}
                    {data.delivery.courier_name ? ` · Entregador: ${data.delivery.courier_name}` : ""}
                  </span>
                </p>
              )}
              {!canSeeCustomerData && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Dados pessoais parcialmente ocultos conforme seu perfil de acesso.
                </p>
              )}
            </section>

            <Separator />

            <section aria-labelledby="detalhe-historico">
              <h3 id="detalhe-historico" className="mb-2 flex items-center gap-2 font-semibold">
                <History className="h-4 w-4" aria-hidden="true" /> Histórico
              </h3>
              <ol className="space-y-1 text-xs text-muted-foreground">
                {(data?.history ?? []).map((h) => (
                  <li key={h.id}>
                    {new Date(h.created_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    — {h.from_status ? `${statusLabel(h.from_status)} → ` : ""}
                    {statusLabel(h.to_status)}
                    {h.reason ? ` (${h.reason})` : ""}
                  </li>
                ))}
              </ol>
            </section>

            {!readOnly && (
              <>
                <Separator />
                <section aria-labelledby="detalhe-acoes" className="space-y-3">
                  <h3 id="detalhe-acoes" className="font-semibold">
                    Ações permitidas
                  </h3>
                  {primary && (
                    <Button
                      className="min-h-11 w-full"
                      disabled={isBusy}
                      onClick={() => onAction(order, primary.action as OrderAction)}
                    >
                      {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                      {primary.label}
                    </Button>
                  )}
                  {(canRequestCancel || canCancel) && (
                    <div className="space-y-2">
                      <Label htmlFor={`cancel-reason-${order.id}`} className="text-xs">
                        Motivo do cancelamento
                      </Label>
                      <Textarea
                        id={`cancel-reason-${order.id}`}
                        value={reason}
                        maxLength={500}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ex.: cliente desistiu, item sem estoque…"
                      />
                      <div className="flex flex-col gap-2 sm:flex-row">
                        {canRequestCancel && (
                          <Button
                            variant="outline"
                            className="min-h-11 flex-1"
                            disabled={isBusy || reason.trim().length < 3}
                            onClick={() => onAction(order, "request_cancel", reason.trim())}
                          >
                            Solicitar cancelamento
                          </Button>
                        )}
                        {canCancel && (
                          <Button
                            variant="destructive"
                            className="min-h-11 flex-1"
                            disabled={isBusy || reason.trim().length < 3}
                            onClick={() => onAction(order, "cancel", reason.trim())}
                          >
                            <Ban className="mr-2 h-4 w-4" aria-hidden="true" /> Cancelar pedido
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
