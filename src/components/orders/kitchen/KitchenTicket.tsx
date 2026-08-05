import { Check, Clock, FlaskConical, Printer, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  allItemsPrepared,
  elapsedPrepMinutes,
  kitchenPriority,
  pendingItemsCount,
  type KitchenTicketData,
} from "@/lib/orders/kitchen";
import { FULFILLMENT_LABELS, statusLabel } from "@/lib/orders/board";

interface Props {
  ticket: KitchenTicketData;
  prepMinutes: number;
  now: number;
  readOnly?: boolean;
  canMarkItems?: boolean;
  isBusy?: boolean;
  onToggleItem?: (itemId: string, prepared: boolean) => void;
  onStart?: (ticket: KitchenTicketData) => void;
  onReady?: (ticket: KitchenTicketData) => void;
  onPrint?: (ticket: KitchenTicketData) => void;
}

const PRIORITY_CLASS = {
  normal: "border-border",
  attention: "border-amber-500/70",
  late: "border-destructive",
} as const;

export function KitchenTicket({
  ticket,
  prepMinutes,
  now,
  readOnly,
  canMarkItems,
  isBusy,
  onToggleItem,
  onStart,
  onReady,
  onPrint,
}: Props) {
  const priority = kitchenPriority(ticket, prepMinutes, now);
  const elapsed = elapsedPrepMinutes(ticket, now);
  const pending = pendingItemsCount(ticket.items);
  const ready = allItemsPrepared(ticket.items);

  return (
    <Card className={cn("flex h-full flex-col gap-2 border-2 p-3", PRIORITY_CLASS[priority])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold leading-none">#{ticket.displayNumber}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(ticket.placedAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {FULFILLMENT_LABELS[ticket.orderType] ?? ticket.orderType}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={priority === "late" ? "destructive" : "secondary"} className="gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {elapsed} min
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {statusLabel(ticket.status)}
          </Badge>
          {ticket.isTest && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <FlaskConical className="h-3 w-3" aria-hidden="true" /> Teste
            </Badge>
          )}
        </div>
      </div>

      <ul className="flex-1 space-y-2 text-sm">
        {ticket.items.map((item) => (
          <li key={item.id} className={cn("rounded-md p-1", item.preparedAt && "opacity-60")}>
            <div className="flex items-start gap-2">
              {canMarkItems && !readOnly && (
                <Button
                  variant={item.preparedAt ? "secondary" : "outline"}
                  size="icon"
                  className="min-h-11 min-w-11 shrink-0"
                  disabled={isBusy}
                  aria-label={
                    item.preparedAt
                      ? `Reabrir item ${item.name}`
                      : `Marcar item ${item.name} como pronto`
                  }
                  onClick={() => onToggleItem?.(item.id, !item.preparedAt)}
                >
                  {item.preparedAt ? (
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              )}
              <div className="min-w-0">
                <p className={cn("font-semibold", item.preparedAt && "line-through")}>
                  {item.quantity}× {item.name}
                  {item.variantName ? ` (${item.variantName})` : ""}
                </p>
                {(item.options ?? []).map((o) => (
                  <p key={o.id} className="text-xs text-muted-foreground">
                    + {o.quantity}× {o.name}
                  </p>
                ))}
                {item.notes && <p className="text-xs font-medium text-amber-600">Obs.: {item.notes}</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {ticket.notes && (
        <p className="rounded-md bg-muted p-2 text-xs font-medium">Observação: {ticket.notes}</p>
      )}

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {ticket.status === "accepted" && onStart && (
            <Button className="min-h-11 flex-1" disabled={isBusy} onClick={() => onStart(ticket)}>
              Iniciar preparo
            </Button>
          )}
          {ticket.status === "preparation_started" && onReady && (
            <Button
              className="min-h-11 flex-1"
              disabled={isBusy}
              variant={ready ? "default" : "secondary"}
              onClick={() => onReady(ticket)}
            >
              {pending > 0 ? `Marcar pronto (${pending} pendente${pending > 1 ? "s" : ""})` : "Marcar pronto"}
            </Button>
          )}
          {onPrint && (
            <Button
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11"
              aria-label={`Imprimir comanda do pedido ${ticket.displayNumber}`}
              onClick={() => onPrint(ticket)}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
