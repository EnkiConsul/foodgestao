import { useState, useMemo } from "react";
import { useAdminInvoices, useUpdateInvoice } from "@/hooks/useBilling";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/date-utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCents, INVOICE_STATUS_LABELS, INVOICE_STATUS_VARIANT } from "@/lib/billing";
import { useUserNames } from "@/hooks/useUserNames";
import { ClientCell } from "./ClientCell";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useSearchParams } from "react-router-dom";
import { resumirFaturas } from "@/lib/admin/faturasResumo";

export function AdminInvoices() {
  const [status, setStatus] = useState<string>("all");
  const [clientSortDir, setClientSortDir] = useState<"asc" | "desc" | null>(null);
  const [params, setParams] = useSearchParams();
  const showTest = params.get("faturas_teste") === "1";
  const setShowTest = (v: boolean) => {
    const next = new URLSearchParams(params);
    if (v) next.set("faturas_teste", "1"); else next.delete("faturas_teste");
    setParams(next, { replace: true });
  };
  const statusFiltro = status === "all" ? undefined : status;
  const { data: invoices = [], isLoading } = useAdminInvoices({
    status: statusFiltro, escopo: showTest ? "todas" : "reais",
  });
  const { data: testes = [] } = useAdminInvoices({ status: statusFiltro, escopo: "teste" });
  const resumo = useMemo(() => resumirFaturas(invoices as any[]), [invoices]);
  const semReais = !isLoading && (invoices as any[]).every((i) => i.is_test);
  const vazioMsg = showTest && invoices.length > 0 ? null : "Nenhuma fatura real encontrada para este filtro.";
  const { displayName } = useUserNames();
  
  const update = useUpdateInvoice();

  const sortedInvoices = useMemo(() => {
    if (!clientSortDir) return invoices;
    const key = (inv: any) => {
      const name = displayName(inv.user_id);
      return name || inv.user_id?.slice(0, 8) || "";
    };
    return [...invoices].sort((a, b) => {
      const cmp = key(a).localeCompare(key(b), "pt-BR", { sensitivity: "base" });
      return clientSortDir === "asc" ? cmp : -cmp;
    });
  }, [invoices, clientSortDir, displayName]);

  const toggleClientSort = () => {
    setClientSortDir((prev) => {
      if (prev === null) return "asc";
      if (prev === "asc") return "desc";
      return null;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div>
          <p className="text-sm text-muted-foreground">{invoices.length} faturas</p>
          {!showTest && testes.length > 0 && (
            <p className="text-xs text-muted-foreground">{testes.length} faturas de teste ocultas</p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm sm:ml-auto">
          <Switch checked={showTest} onCheckedChange={setShowTest} />
          Mostrar faturas de teste
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          ["Recebido", formatCents(resumo.recebidoCents)],
          ["A receber", formatCents(resumo.aReceberCents)],
          ["Vencido", formatCents(resumo.vencidoCents)],
          ["Canceladas", String(resumo.canceladas)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-base font-semibold">{v}</div>
          </div>
        ))}
        <p className="col-span-2 md:col-span-4 text-[11px] text-muted-foreground">Resumo considera apenas faturas reais.</p>
      </div>

      {/* Desktop */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={toggleClientSort}>
                <span className="inline-flex items-center gap-1">
                  Cliente
                  {clientSortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : clientSortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                </span>
              </TableHead>
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
            ) : invoices.length === 0 || (semReais && !showTest) ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{vazioMsg ?? "Nenhuma fatura"}</TableCell></TableRow>
            ) : (
              sortedInvoices.map((inv: any) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <ClientCell userId={inv.user_id} />
                      {inv.is_test && <Badge variant="outline" className="text-[10px]">Teste</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>{inv.subscription?.plan?.name ?? "—"}</TableCell>
                  <TableCell className="font-medium">{formatCents(inv.amount_cents - (inv.discount_cents || 0))}</TableCell>
                  <TableCell className="text-xs">{formatDate(inv.due_date, "dd/MM/yy")}</TableCell>
                  <TableCell className="text-xs">
                    {formatDate(inv.paid_at, "dd/MM/yy")}
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

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border p-3"><Skeleton className="h-20 w-full" /></div>
          ))
        ) : invoices.length === 0 || (semReais && !showTest) ? (
          <p className="text-center text-sm text-muted-foreground py-8">{vazioMsg ?? "Nenhuma fatura"}</p>
        ) : (
          sortedInvoices.map((inv: any) => (
            <div key={inv.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2"><ClientCell userId={inv.user_id} />{inv.is_test && <Badge variant="outline" className="text-[10px]">Teste</Badge>}</div>
                  <p className="text-[11px] text-muted-foreground truncate">{inv.subscription?.plan?.name ?? "—"}</p>
                </div>
                <Badge variant={INVOICE_STATUS_VARIANT[inv.status]} className="shrink-0 text-[10px]">
                  {INVOICE_STATUS_LABELS[inv.status]}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-[10px] text-muted-foreground">Valor</div>
                  <div className="font-semibold">{formatCents(inv.amount_cents - (inv.discount_cents || 0))}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Vencimento</div>
                  <div>{formatDate(inv.due_date, "dd/MM/yy")}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Pago em</div>
                  <div>{formatDate(inv.paid_at, "dd/MM/yy")}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Método</div>
                  <div className="capitalize">{inv.payment_method ?? "—"}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 pt-1 border-t">
                {inv.status !== "paid" && (
                  <Button size="sm" variant="outline" className="flex-1 min-h-9"
                    onClick={() => update.mutate({
                      id: inv.id, status: "paid",
                      paid_at: new Date().toISOString(),
                      payment_method: inv.payment_method ?? "manual",
                    })}>Marcar paga</Button>
                )}
                {inv.status === "open" && (
                  <Button size="sm" variant="outline" className="flex-1 min-h-9"
                    onClick={() => update.mutate({ id: inv.id, status: "canceled" })}>Cancelar</Button>
                )}
                {inv.status === "paid" && (
                  <Button size="sm" variant="outline" className="flex-1 min-h-9"
                    onClick={() => update.mutate({ id: inv.id, status: "refunded" })}>Reembolsar</Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
