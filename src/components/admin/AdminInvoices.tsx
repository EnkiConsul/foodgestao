import { useState } from "react";
import { useAdminInvoices, useUpdateInvoice } from "@/hooks/useBilling";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCents, INVOICE_STATUS_LABELS, INVOICE_STATUS_VARIANT } from "@/lib/billing";
import { useUserNames } from "@/hooks/useUserNames";

export function AdminInvoices() {
  const [status, setStatus] = useState<string>("all");
  const { data: invoices = [], isLoading } = useAdminInvoices(
    status === "all" ? undefined : { status }
  );
  const { displayName } = useUserNames();
  const update = useUpdateInvoice();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{invoices.length} faturas</p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Pago em</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
              ))
            ) : invoices.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma fatura</TableCell></TableRow>
            ) : (
              invoices.map((inv: any) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{displayName(inv.user_id)}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{inv.user_id.slice(0, 8)}…</span>
                    </div>
                  </TableCell>
                  <TableCell>{inv.subscription?.plan?.name ?? "—"}</TableCell>
                  <TableCell className="font-medium">{formatCents(inv.amount_cents - (inv.discount_cents || 0))}</TableCell>
                  <TableCell className="text-xs">{format(new Date(inv.due_date), "dd/MM/yy", { locale: ptBR })}</TableCell>
                  <TableCell className="text-xs">
                    {inv.paid_at ? format(new Date(inv.paid_at), "dd/MM/yy", { locale: ptBR }) : "—"}
                  </TableCell>
                  <TableCell className="capitalize text-xs">{inv.payment_method ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={INVOICE_STATUS_VARIANT[inv.status]}>
                      {INVOICE_STATUS_LABELS[inv.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {inv.status !== "paid" && (
                        <Button size="sm" variant="ghost"
                          onClick={() => update.mutate({
                            id: inv.id,
                            status: "paid",
                            paid_at: new Date().toISOString(),
                            payment_method: inv.payment_method ?? "manual",
                          })}>
                          Marcar paga
                        </Button>
                      )}
                      {inv.status === "open" && (
                        <Button size="sm" variant="ghost"
                          onClick={() => update.mutate({ id: inv.id, status: "canceled" })}>
                          Cancelar
                        </Button>
                      )}
                      {inv.status === "paid" && (
                        <Button size="sm" variant="ghost"
                          onClick={() => update.mutate({ id: inv.id, status: "refunded" })}>
                          Reembolsar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
