import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2, ExternalLink, FileText, ArrowRight,
  Clock, CheckCircle2, AlertTriangle, QrCode,
} from "lucide-react";
import { formatCents, INVOICE_STATUS_LABELS, INVOICE_STATUS_VARIANT } from "@/lib/billing";
import { FreshnessIndicator } from "@/components/billing/FreshnessIndicator";
import { Logo } from "@/components/Logo";

type StatusFilter = "all" | "pending" | "paid" | "overdue";

export default function Faturas() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const onlyPix = false;
  

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["my-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, subscription:subscriptions(plan:plans(name, slug))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (inv: any) =>
    (inv.status === "open" || inv.status === "overdue") && inv.due_date && inv.due_date < today;
  const isPending = (inv: any) =>
    (inv.status === "open" || inv.status === "overdue") && !isOverdue(inv);

  const summary = useMemo(() => {
    const base = (invoices ?? []).filter((i: any) => !onlyPix || i.payment_method === "pix");
    const total = (arr: any[]) =>
      arr.reduce((s, i) => s + ((i.amount_cents ?? 0) - (i.discount_cents ?? 0)), 0);
    const pendentes = base.filter(isPending);
    const pagas = base.filter((i: any) => i.status === "paid");
    const atrasadas = base.filter(isOverdue);
    return {
      pendentes: { count: pendentes.length, total: total(pendentes) },
      pagas: { count: pagas.length, total: total(pagas) },
      atrasadas: { count: atrasadas.length, total: total(atrasadas) },
    };
  }, [invoices, onlyPix]);

  const filtered = useMemo(() => {
    let arr = (invoices ?? []) as any[];
    if (onlyPix) arr = arr.filter((i) => i.payment_method === "pix");
    if (filter === "paid") arr = arr.filter((i) => i.status === "paid");
    else if (filter === "pending") arr = arr.filter(isPending);
    else if (filter === "overdue") arr = arr.filter(isOverdue);
    return arr;
  }, [invoices, filter, onlyPix]);

  const fmtDate = (d?: string | null) =>
    d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("pt-BR") : "—";

  const statusOf = (inv: any) =>
    isOverdue(inv) ? "overdue" : inv.status;

  const cards: Array<{
    key: StatusFilter;
    label: string;
    icon: typeof Clock;
    color: string;
    bg: string;
    border: string;
    data: { count: number; total: number };
  }> = [
    {
      key: "pending", label: "Pendentes", icon: Clock,
      color: "text-amber-600", bg: "bg-amber-500/10", border: "border-amber-500/30",
      data: summary.pendentes,
    },
    {
      key: "paid", label: "Pagas", icon: CheckCircle2,
      color: "text-emerald-600", bg: "bg-emerald-500/10", border: "border-emerald-500/30",
      data: summary.pagas,
    },
    {
      key: "overdue", label: "Atrasadas", icon: AlertTriangle,
      color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30",
      data: summary.atrasadas,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo size="sm" linkTo="/" />
          <Button variant="ghost" onClick={() => navigate("/")}>Voltar ao app</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Minhas faturas</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-muted-foreground text-sm">
                Acompanhe suas cobranças{onlyPix ? " via Pix" : ""} — pendentes, pagas e atrasadas
              </p>
              <FreshnessIndicator freshnessKey="invoices" label="Faturas" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/planos")}>
              Ver planos
            </Button>
          </div>
        </div>


        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {cards.map(({ key, label, icon: Icon, color, bg, border, data }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(active ? "all" : key)}
                className={`text-left rounded-lg border ${border} ${bg} p-4 transition-all hover:shadow-sm ${
                  active ? "ring-2 ring-primary/40" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`flex items-center gap-2 text-sm font-medium ${color}`}>
                    <Icon className="h-4 w-4" /> {label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {data.count} {data.count === 1 ? "fatura" : "faturas"}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums">
                  {formatCents(data.total)}
                </div>
              </button>
            );
          })}
        </div>

        {/* Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)} className="mb-4">
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="paid">Pagas</TabsTrigger>
            <TabsTrigger value="overdue">Atrasadas</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !filtered || filtered.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-center px-4">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {invoices && invoices.length > 0
                    ? "Nenhuma fatura nesta categoria."
                    : "Você ainda não possui faturas."}
                </p>
                {(!invoices || invoices.length === 0) && (
                  <Button onClick={() => navigate("/planos")}>Conhecer planos</Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plano</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv: any) => {
                    const total = (inv.amount_cents ?? 0) - (inv.discount_cents ?? 0);
                    const status = statusOf(inv);
                    const pending = status === "open" || status === "overdue";
                    const isPix = inv.payment_method === "pix";
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          {inv.subscription?.plan?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          {inv.payment_method ? (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              {isPix && <QrCode className="h-3.5 w-3.5 text-primary" />}
                              {inv.payment_method === "pix" ? "Pix"
                                : inv.payment_method === "boleto" ? "Boleto"
                                : inv.payment_method === "card" ? "Cartão"
                                : inv.payment_method}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>{fmtDate(inv.due_date)}</TableCell>
                        <TableCell>{fmtDate(inv.paid_at)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCents(total)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={INVOICE_STATUS_VARIANT[status] ?? "secondary"}>
                            {INVOICE_STATUS_LABELS[status] ?? status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {pending && (
                              <Button
                                size="sm"
                                onClick={() => navigate(`/checkout/pagamento/${inv.id}`)}
                              >
                                {isPix ? "Ver Pix" : "Pagar"}
                                <ArrowRight className="h-3.5 w-3.5 ml-1" />
                              </Button>
                            )}
                            {inv.external_payment_url && (
                              <Button size="sm" variant="outline" asChild>
                                <a
                                  href={inv.external_payment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
