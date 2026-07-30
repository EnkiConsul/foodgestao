import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  type LancamentoTransaction,
} from "./types";

function fmt(value: string | null | undefined, pattern: string, placeholder = "—") {
  return formatDate(value, pattern, { placeholder });
}

export interface LancamentoRowCallbacks {
  onToggleSelected: (id: string) => void;
  onOpenAttachments: (attachments: { id: string; file_name: string; file_url: string }[]) => void;
  onUpdateStatus: (id: string, status: "confirmado" | "pendente") => void;
  onRequestCancelStatus: (id: string) => void;
  onRegisterPayment: (tx: LancamentoTransaction) => void;
  onEdit: (tx: LancamentoTransaction) => void;
  onDuplicate: (tx: LancamentoTransaction) => void;
  onRequestDelete: (id: string) => void;
}

export interface LancamentoRowProps {
  row: LancamentoDisplayRow;
  isSelected: boolean;
  visibleColumns: Record<string, boolean>;
  formatBRL: (n: number) => string;
  callbacks: LancamentoRowCallbacks;
}

export function LancamentoRow({
  row: r, isSelected, visibleColumns, formatBRL, callbacks,
}: LancamentoRowProps) {
  const isInstallment = r.installmentNumber != null && r.installmentTotal != null;
  const isReceita = r.transactionType === "entrada";
  const isDespesa = r.transactionType === "saida";
  const isTransf = r.transactionType === "transferencia";
  const signedEffect = isReceita ? r.amount : isDespesa ? -r.amount : 0;
  const effectPositive = signedEffect > 0;
  const effectNegative = signedEffect < 0;
  const valueColorClass = isTransf ? "text-foreground" : amountColorClass(signedEffect);
  const hasDue = r.hasDueDate;

  return (
    <TableRow className={cn("group", hasDue && r.billStatus !== "pago" && "bg-accent/30", isSelected && "bg-primary/5")}>
      <TableCell className="py-2 px-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => callbacks.onToggleSelected(r.id)}
          aria-label="Selecionar lançamento"
        />
      </TableCell>

      {/* Data */}
      {visibleColumns.data !== false && (
        <TableCell className="text-xs py-2">{fmt(r.date, "dd/MM")}</TableCell>
      )}

      {/* Descrição */}
      <TableCell className="text-xs py-2">
        <div className="flex items-center gap-1 max-w-[280px]">
          {(r.isRecurring || r.isRecurrenceChild) && !isInstallment && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Repeat className={cn("h-3 w-3 shrink-0", r.isRecurring ? "text-primary" : "text-muted-foreground")} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {r.isRecurring ? "Lançamento recorrente (pai)" : "Gerado por recorrência"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isInstallment && (
            <span className="inline-flex items-center rounded-sm bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary shrink-0">
              {r.installmentNumber}/{r.installmentTotal}
            </span>
          )}
          {r.attachmentCount > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
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
                  >
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground hover:text-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {r.attachmentCount} anexo{r.attachmentCount > 1 ? "s" : ""}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="truncate">{r.description}</span>
        </div>
      </TableCell>

      {/* D/C */}
      {visibleColumns.dc && (
        <TableCell className="text-center py-2">
          {!isTransf && effectPositive && <span className="text-xs font-bold text-success">C</span>}
          {!isTransf && effectNegative && <span className="text-xs font-bold text-destructive">D</span>}
          {isTransf && <span className="text-xs font-bold text-primary">T</span>}
        </TableCell>
      )}

      {/* Categoria */}
      {visibleColumns.categoria && (
        <TableCell className="text-xs py-2 text-muted-foreground whitespace-nowrap">
          {r.categoryName || "—"}
        </TableCell>
      )}

      {/* Conta */}
      {visibleColumns.conta && (
        <TableCell className="text-xs py-2 text-muted-foreground whitespace-nowrap">
          {r.accountName || "—"}
        </TableCell>
      )}

      {/* Forma Pgto */}
      {visibleColumns.formaPagamento && (
        <TableCell className="text-xs py-2 text-muted-foreground whitespace-nowrap">
          {r.paymentMethodName || "—"}
        </TableCell>
      )}

      {/* Valor */}
      <TableCell className={`text-xs text-right py-2 font-medium whitespace-nowrap ${valueColorClass}`}>
        {r.amountPaid > 0 && r.amountPaid !== r.amount ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help underline decoration-dotted underline-offset-2">
                  {formatBRL(r.amountPaid)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                <p>Valor original: {formatBRL(r.amount)}</p>
                <p>Valor pago: {formatBRL(r.amountPaid)}</p>
                <p className="text-muted-foreground">{((r.amountPaid / r.amount) * 100).toFixed(0)}% pago</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          formatBRL(r.amount)
        )}
      </TableCell>

      {/* Status */}
      {visibleColumns.status && (
        <TableCell className="py-2">
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="cursor-pointer">
                <Badge
                  variant={displayStatusConfig[r.billStatus].variant}
                  className={cn(
                    "text-[10px] h-5 px-1.5 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity",
                    r.billStatus === "pago" && "bg-success text-success-foreground hover:bg-success/90"
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
                  className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent transition-colors text-left", r.original.status === "confirmado" && "bg-accent font-medium")}
                  onClick={() => callbacks.onUpdateStatus(r.id, "confirmado")}
                >
                  <Check className="h-3 w-3 text-success" />
                  Pago
                </button>
                <button
                  type="button"
                  className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent transition-colors text-left", r.original.status === "pendente" && "bg-accent font-medium")}
                  onClick={() => callbacks.onUpdateStatus(r.id, "pendente")}
                >
                  <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                  Pendente
                </button>
                <button
                  type="button"
                  className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent transition-colors text-left", r.original.status === "cancelado" && "bg-accent font-medium")}
                  onClick={() => callbacks.onRequestCancelStatus(r.id)}
                >
                  <X className="h-3 w-3 text-destructive" />
                  Cancelado
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </TableCell>
      )}

      {/* Vencimento */}
      {visibleColumns.vencimento && (
        <TableCell className="text-xs py-2 text-muted-foreground">{fmt(r.dueDate, "dd/MM")}</TableCell>
      )}

      {/* Data de Pagamento */}
      {visibleColumns.pagamento && (
        <TableCell className="text-xs py-2 text-muted-foreground">{fmt(r.paymentDate, "dd/MM")}</TableCell>
      )}

      {/* Saldo */}
      {visibleColumns.saldo && (
        <TableCell className={`text-xs text-right py-2 font-medium whitespace-nowrap ${r.runningBalance >= 0 ? "text-success" : "text-destructive"}`}>
          {formatBRL(r.runningBalance)}
        </TableCell>
      )}

      {/* Ações */}
      <TableCell className="py-2">
        <div className="flex items-center gap-0.5">
          {hasDue && r.billStatus !== "pago" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-success hover:text-success"
              onClick={() => callbacks.onRegisterPayment(r.original)}
              title="Registrar pagamento"
            >
              <DollarSign className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => callbacks.onEdit(r.original)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Duplicar lançamento"
            onClick={() => callbacks.onDuplicate(r.original)}
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => callbacks.onRequestDelete(r.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
