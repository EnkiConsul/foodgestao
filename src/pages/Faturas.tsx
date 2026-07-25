import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, ExternalLink, FileText, ArrowRight,
  Clock, CheckCircle2, AlertTriangle, QrCode,
} from "lucide-react";
import { formatCents, INVOICE_STATUS_LABELS, INVOICE_STATUS_VARIANT } from "@/lib/billing";
import { FreshnessIndicator } from "@/components/billing/FreshnessIndicator";
import { Logo } from "@/components/Logo";
import { ResponsiveDataTable, type ResponsiveColumn } from "@/components/ui/responsive-data-table";

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

  const statusOf = (inv: any) => (isOverdue(inv) ? "overdue" : inv.status);

  const methodLabel = (m?: string | null) =>
    m === "pix" ? "Pix" : m === "boleto" ? "Boleto" : m === "card" ? "Cartão" : m ?? "—";

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

  const renderActions = (inv: any) => {
    const status = statusOf(inv);
    const pending = status === "open" || status === "overdue";
    const isPix = inv.payment_method === "pix";
    return (
      <div className="flex justify-end gap-2">
        {pending && (
          <Button
            size="sm"
            className="min-h-[40px]"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/checkout/pagamento/${inv.id}`);
            }}
          >
            {isPix ? "Ver Pix" : "Pagar"}
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        )}
        {inv.external_payment_url && (
          <Button size="sm" variant="outline" className="min-h-[40px]" asChild>
            <a
              href={inv.external_payment_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    );
  };

  const columns: ResponsiveColumn<any>[] = [
    {
      key: "plan",
      header: "Plano",
      cell: (inv) => <span className="font-medium">{inv.subscription?.plan?.name ?? "—"}</span>,
    },
    {
      key: "method",
      header: "Método",
      cell: (inv) => (
        <span className="inline-flex items-center gap-1.5 text-xs">
          {inv.payment_method === "pix" && <QrCode className="h-3.5 w-3.5 text-primary" />}
          {methodLabel(inv.payment_method)}
        </span>
      ),
    },
    { key: "due", header: "Vencimento", cell: (inv) => fmtDate(inv.due_date) },
    { key: "paid_at", header: "Pagamento", cell: (inv) => fmtDate(inv.paid_at), hideOnMobile: true },
    {
      key: "amount",
      header: <div className="text-right">Valor</div>,
      className: "text-right tabular-nums",
      cell: (inv) => formatCents((inv.amount_cents ?? 0) - (inv.discount_cents ?? 0)),
    },
    {
      key: "status",
      header: "Status",
      cell: (inv) => {
        const s = statusOf(inv);
        return (
          <Badge variant={INVOICE_STATUS_VARIANT[s] ?? "secondary"}>
            {INVOICE_STATUS_LABELS[s] ?? s}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: <div className="text-right">Ações</div>,
      className: "text-right",
      cell: renderActions,
    },
  ];

  const renderMobileCard = (inv: any) => {
    const total = (inv.amount_cents ?? 0) - (inv.discount_cents ?? 0);
    const s = statusOf(inv);
    const isPix = inv.payment_method === "pix";
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{inv.subscription?.plan?.name ?? "—"}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {isPix && <QrCode className="h-3.5 w-3.5 text-primary" />}
              {methodLabel(inv.payment_method)}
            </div>
          </div>
          <Badge variant={INVOICE_STATUS_VARIANT[s] ?? "secondary"}>
            {INVOICE_STATUS_LABELS[s] ?? s}
          </Badge>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>Venc.: <span className="tabular-nums">{fmtDate(inv.due_date)}</span></div>
            {inv.paid_at && (
              <div>Pago em: <span className="tabular-nums">{fmtDate(inv.paid_at)}</span></div>
            )}
          </div>
          <div className="text-lg font-bold tabular-nums">{formatCents(total)}</div>
        </div>
        <div className="pt-1">{renderActions(inv)}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Logo size="sm" linkTo="/" />
          <Button variant="ghost" size="sm" className="min-h-[40px]" onClick={() => navigate("/")}>
            Voltar ao App
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 md:py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Minhas Faturas</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-muted-foreground text-sm">
                Acompanhe suas cobranças — pendentes, pagas e atrasadas
              </p>
              <FreshnessIndicator freshnessKey="invoices" label="Faturas" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="min-h-[40px]" onClick={() => navigate("/planos")}>
              Ver Planos
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
                className={`text-left rounded-lg border ${border} ${bg} p-4 transition-all hover:shadow-sm min-h-[88px] ${
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
          <TabsList className="w-full sm:w-auto overflow-x-auto flex justify-start">
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="paid">Pagas</TabsTrigger>
            <TabsTrigger value="overdue">Atrasadas</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="rounded-2xl border bg-card py-16 flex flex-col items-center gap-3 text-center px-4">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              {invoices && invoices.length > 0
                ? "Nenhuma fatura nesta categoria."
                : "Você ainda não possui faturas."}
            </p>
            {(!invoices || invoices.length === 0) && (
              <Button className="min-h-[44px]" onClick={() => navigate("/planos")}>
                Conhecer Planos
              </Button>
            )}
          </div>
        ) : (
          <ResponsiveDataTable
            columns={columns}
            rows={filtered}
            rowKey={(inv) => inv.id}
            renderMobileCard={renderMobileCard}
          />
        )}
      </main>
    </div>
  );
}
