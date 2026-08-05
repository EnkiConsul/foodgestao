import { AlertTriangle, Clock, CreditCard, FlaskConical, Loader2, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/orders/catalog";
import type { BoardOrder } from "@/hooks/useOrdersBoard";
import {
  CHANNEL_LABELS,
  FULFILLMENT_LABELS,
  PAYMENT_STATUS_LABELS,
  PENDENCY_LABELS,
  type Deadlines,
  orderUrgency,
  pendenciesFor,
  primaryActionFor,
  shortCustomerName,
  timerLabel,
} from "@/lib/orders/board";

interface Props {
  order: BoardOrder;
  channelName?: string | null;
  deadlines: Deadlines;
  now: number;
  isBusy?: boolean;
  readOnly?: boolean;
  onOpen: (order: BoardOrder) => void;
  onPrimaryAction: (order: BoardOrder) => void;
}

export function OrderCard({
  order,
  channelName,
  deadlines,
  now,
  isBusy,
  readOnly,
  onOpen,
  onPrimaryAction,
}: Props) {
  const urgency = orderUrgency(order, deadlines, now);
  const pendencies = pendenciesFor(order, deadlines, now);
  const primary = primaryActionFor(order);
  const placed = new Date(order.placed_at);

  return (
    <Card
      className={cn(
        "border-l-4 p-3 transition-colors",
        urgency === "critical" && "border-l-destructive bg-destructive/5",
        urgency === "attention" && "border-l-primary bg-primary/5",
        urgency === "ok" && "border-l-border",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(order)}
        className="w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Abrir detalhes do pedido número ${order.display_number}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-semibold leading-tight">
              #{order.display_number}
              {order.is_test && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <FlaskConical className="h-3 w-3" aria-hidden="true" /> Teste
                </Badge>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {channelName ?? CHANNEL_LABELS.balcao} ·{" "}
              {placed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {FULFILLMENT_LABELS[order.order_type] ?? order.order_type}
          </Badge>
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{timerLabel(order, deadlines, now)}</span>
        </p>

        <p className="mt-2 flex items-start gap-1.5 text-xs">
          <Utensils className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="line-clamp-2">
            {order.items_preview.length > 0
              ? order.items_preview.join(" · ")
              : `${order.items_count} item(ns)`}
          </span>
        </p>

        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold">{formatCents(order.total_amount)}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            {PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}
          </span>
        </div>

        <p className="mt-1 truncate text-xs text-muted-foreground">
          {shortCustomerName(order.customer_name)}
        </p>

        {pendencies.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {pendencies.map((p) => (
              <li key={p}>
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {PENDENCY_LABELS[p]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </button>

      {primary && !readOnly && (
        <Button
          className="mt-3 min-h-11 w-full"
          disabled={isBusy}
          onClick={() => onPrimaryAction(order)}
        >
          {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {primary.label}
        </Button>
      )}
    </Card>
  );
}
