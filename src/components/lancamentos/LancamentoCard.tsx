import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CalendarIcon, Check, Copy, DollarSign, Paperclip, Pencil, Repeat, Trash2, X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { resolveAttachments } from "@/lib/attachments";
import { amountColorClass } from "@/lib/transaction-sign";
import { formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
  displayStatusConfig,
  type LancamentoDisplayRow,
} from "./types";
import type { LancamentoRowCallbacks } from "./LancamentoRow";

export interface LancamentoCardProps {
  row: LancamentoDisplayRow;
  isSelected: boolean;
  formatBRL: (n: number) => string;
  callbacks: LancamentoRowCallbacks;
}

export function LancamentoCard({ row: r, isSelected, formatBRL, callbacks }: LancamentoCardProps) {
  const isInstallment = r.installmentNumber != null && r.installmentTotal != null;
  const isReceita = r.transactionType === "entrada";
  const isDespesa = r.transactionType === "saida";
  const isTransf = r.transactionType === "transferencia";
  const signedEffect = isReceita ? r.amount : isDespesa ? -r.amount : 0;
  const valueColorClass = isTransf ? "text-foreground" : amountColorClass(signedEffect);
  const hasDue = r.hasDueDate;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 space-y-2",
        hasDue && r.billStatus !== "pago" && "bg-accent/30",
        isSelected && "ring-1 ring-primary",
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => callbacks.onToggleSelected(r.id)}
          aria-label="Selecionar lançamento"
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {(r.isRecurring || r.isRecurrenceChild) && !isInstallment && (
              <Repeat className={cn("h-3 w-3 shrink-0", r.isRecurring ? "text-primary" : "text-muted-foreground")} />
            )}
            {isInstallment && (
              <span className="inline-flex items-center rounded-sm bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary shrink-0">
                {r.installmentNumber}/{r.installmentTotal}
              </span>
            )}
            {r.attachmentCount > 0 && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const { data } = await supabase
                    .from("transaction_attachments")
                    .select("id, file_name, file_url")
                    .eq("transaction_id", r.id);
                  const resolved = await resolveAttachments(data ?? []);
                  callbacks.onOpenAttachments(resolved);
                }}
                className="inline-flex"
                aria-label="Ver anexos"
              >
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            )}
            <span className="text-sm font-medium truncate">{r.description}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {[r.categoryName, r.accountName].filter(Boolean).join(" • ") || "—"}
          </div>
        </div>
        <div className={cn("text-right font-semibold text-sm whitespace-nowrap", valueColorClass)}>
          {formatBRL(r.amountPaid > 0 && r.amountPaid !== r.amount ? r.amountPaid : r.amount)}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2 flex-wrap">
          <span>{formatDate(r.date, "dd/MM/yyyy", { placeholder: "—" })}</span>
          {hasDue && (
            <span>Venc. {formatDate(r.dueDate, "dd/MM", { placeholder: "—" })}</span>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button">
                <Badge
                  variant={displayStatusConfig[r.billStatus].variant}
                  className={cn(
                    "text-[10px] h-5 px-1.5",
                    r.billStatus === "pago" && "bg-success text-success-foreground hover:bg-success/90",
                  )}
                >
                  {displayStatusConfig[r.billStatus].label}
                </Badge>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="start">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent text-left", r.original.status === "confirmado" && "bg-accent font-medium")}
                  onClick={() => callbacks.onUpdateStatus(r.id, "confirmado")}
                >
                  <Check className="h-3 w-3 text-success" /> Pago
                </button>
                <button
                  type="button"
                  className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent text-left", r.original.status === "pendente" && "bg-accent font-medium")}
                  onClick={() => callbacks.onUpdateStatus(r.id, "pendente")}
                >
                  <CalendarIcon className="h-3 w-3 text-muted-foreground" /> Pendente
                </button>
                <button
                  type="button"
                  className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent text-left", r.original.status === "cancelado" && "bg-accent font-medium")}
                  onClick={() => callbacks.onRequestCancelStatus(r.id)}
                >
                  <X className="h-3 w-3 text-destructive" /> Cancelado
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-0.5">
          {hasDue && r.billStatus !== "pago" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-success hover:text-success"
              onClick={() => callbacks.onRegisterPayment(r.original)}
              aria-label="Registrar pagamento"
            >
              <DollarSign className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={() => callbacks.onEdit(r.original)}
            aria-label="Editar"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={() => callbacks.onDuplicate(r.original)}
            aria-label="Duplicar"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 hover:text-destructive"
            onClick={() => callbacks.onRequestDelete(r.id)}
            aria-label="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
