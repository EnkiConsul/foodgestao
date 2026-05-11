import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TreePine, Loader2, ExternalLink, FileText, ArrowRight } from "lucide-react";
import { formatCents, INVOICE_STATUS_LABELS, INVOICE_STATUS_VARIANT } from "@/lib/billing";

export default function Faturas() {
  const navigate = useNavigate();

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

  const fmtDate = (d?: string | null) =>
    d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("pt-BR") : "—";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TreePine className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">Gestor <span className="text-primary">Plin</span></span>
          </div>
          <Button variant="ghost" onClick={() => navigate("/")}>Voltar ao app</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Minhas faturas</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Histórico de cobranças da sua assinatura
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/planos")}>
            Ver planos
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !invoices || invoices.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-center">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">Você ainda não possui faturas.</p>
                <Button onClick={() => navigate("/planos")}>Conhecer planos</Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plano</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv: any) => {
                    const total = (inv.amount_cents ?? 0) - (inv.discount_cents ?? 0);
                    const pending = inv.status === "open" || inv.status === "overdue";
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          {inv.subscription?.plan?.name ?? "—"}
                        </TableCell>
                        <TableCell>{fmtDate(inv.due_date)}</TableCell>
                        <TableCell>{fmtDate(inv.paid_at)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCents(total)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={INVOICE_STATUS_VARIANT[inv.status] ?? "secondary"}>
                            {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {pending && (
                              <Button
                                size="sm"
                                onClick={() => navigate(`/checkout/pagamento/${inv.id}`)}
                              >
                                Pagar <ArrowRight className="h-3.5 w-3.5 ml-1" />
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
