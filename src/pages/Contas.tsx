import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePrivacy } from "@/hooks/usePrivacy";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BillFormDialog } from "@/components/bills/BillFormDialog";
import { PaymentDialog } from "@/components/bills/PaymentDialog";
import { Plus, Search, CreditCard, HandCoins, Trash2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format, isPast, addDays, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";

type BillStatus = Database["public"]["Enums"]["bill_status"];

type Bill = {
  id: string;
  description: string;
  amount: number;
  amount_paid: number;
  bill_type: "receita" | "despesa";
  due_date: string;
  payment_date: string | null;
  status: BillStatus;
  category_id: string | null;
  categories: { name: string } | null;
  accounts: { name: string } | null;
};

const statusConfig: Record<BillStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  em_dia: { label: "Em dia", variant: "secondary" },
  vence_em_breve: { label: "Vence em breve", variant: "outline" },
  atrasado: { label: "Atrasado", variant: "destructive" },
  pago: { label: "Pago", variant: "default" },
  parcial: { label: "Parcial", variant: "outline" },
};

function computeStatus(bill: Bill): BillStatus {
  if (bill.status === "pago") return "pago";
  if (bill.amount_paid > 0 && bill.amount_paid < bill.amount) return "parcial";
  const due = new Date(bill.due_date + "T23:59:59");
  const now = new Date();
  if (isPast(due) && now > due) return "atrasado";
  if (isAfter(due, now) && !isAfter(due, addDays(now, 7))) return "vence_em_breve";
  return "em_dia";
}

export default function Contas() {
  const { user } = useAuth();
  const { maskBRL } = usePrivacy();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const fetchBills = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("bills")
      .select("id, description, amount, amount_paid, bill_type, due_date, payment_date, status, category_id, categories(name), accounts!bills_account_id_fkey(name)")
      .eq("user_id", user.id)
      .order("due_date", { ascending: true })
      .limit(200);

    if (error) {
      toast.error("Erro ao carregar contas");
    } else {
      setBills((data as unknown as Bill[]) ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("bills").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Conta excluída"); fetchBills(); }
  };

  const filtered = useMemo(() => {
    return bills
      .map((b) => ({ ...b, computedStatus: computeStatus(b) }))
      .filter((b) => {
        const matchSearch = !search || b.description.toLowerCase().includes(search.toLowerCase());
        const matchType = filterType === "all" || b.bill_type === filterType;
        const matchStatus = filterStatus === "all" || b.computedStatus === filterStatus;
        return matchSearch && matchType && matchStatus;
      });
  }, [bills, search, filterType, filterStatus]);

  const totals = useMemo(() => {
    const aPagar = filtered.filter((b) => b.bill_type === "despesa").reduce((s, b) => s + b.amount - b.amount_paid, 0);
    const aReceber = filtered.filter((b) => b.bill_type === "receita").reduce((s, b) => s + b.amount - b.amount_paid, 0);
    const atrasadas = filtered.filter((b) => b.computedStatus === "atrasado").length;
    return { aPagar, aReceber, atrasadas };
  }, [filtered]);

  const formatBRL = maskBRL;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contas a Pagar e Receber</h1>
          <p className="text-sm text-muted-foreground">Controle seus pagamentos e recebimentos</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="hidden md:flex">
          <Plus className="h-4 w-4 mr-2" /> Nova Conta
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">A Pagar</p>
            <p className="text-sm font-bold text-destructive">{formatBRL(totals.aPagar)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">A Receber</p>
            <p className="text-sm font-bold text-success">{formatBRL(totals.aReceber)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Atrasadas</p>
            <p className={`text-sm font-bold ${totals.atrasadas > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {totals.atrasadas}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar conta..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" maxLength={100} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="despesa">A Pagar</SelectItem>
            <SelectItem value="receita">A Receber</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="em_dia">Em dia</SelectItem>
            <SelectItem value="vence_em_breve">Vence em breve</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
            <SelectItem value="pago">Pago</SelectItem>
            <SelectItem value="parcial">Parcial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bill list */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
              <CreditCard className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Nenhuma conta encontrada</p>
              <Button variant="link" onClick={() => setDialogOpen(true)} className="mt-2">
                Criar primeira conta
              </Button>
            </CardContent>
          </Card>
        ) : (
          filtered.map((b) => {
            const st = statusConfig[b.computedStatus];
            const isPagar = b.bill_type === "despesa";
            const Icon = isPagar ? CreditCard : HandCoins;
            const paidPercent = b.amount > 0 ? Math.min((b.amount_paid / b.amount) * 100, 100) : 0;

            return (
              <Card key={b.id} className="shadow-sm hover:shadow transition-shadow">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isPagar ? "bg-destructive/10" : "bg-success/10"}`}>
                    <Icon className={`h-4 w-4 ${isPagar ? "text-destructive" : "text-success"}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{b.description}</p>
                      <Badge variant={st.variant} className="text-[10px] h-4 px-1.5 shrink-0">
                        {st.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        Venc: {format(new Date(b.due_date + "T12:00:00"), "dd MMM yyyy", { locale: ptBR })}
                      </span>
                      {b.categories?.name && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{b.categories.name}</Badge>
                      )}
                    </div>
                    {/* Progress bar for partial payments */}
                    {b.amount_paid > 0 && b.computedStatus !== "pago" && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-success rounded-full transition-all" style={{ width: `${paidPercent}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{paidPercent.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${isPagar ? "text-destructive" : "text-success"}`}>
                      {formatBRL(b.amount)}
                    </p>
                    {b.amount_paid > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Pago: {formatBRL(b.amount_paid)}
                      </p>
                    )}
                  </div>

                  {b.computedStatus !== "pago" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-success hover:text-success shrink-0"
                      onClick={() => setPaymentBill(b)}
                      title="Registrar pagamento"
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleDelete(b.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* FAB mobile */}
      <button
        onClick={() => setDialogOpen(true)}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      <BillFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={fetchBills} />
      <PaymentDialog
        open={!!paymentBill}
        onOpenChange={(open) => { if (!open) setPaymentBill(null); }}
        bill={paymentBill}
        onPaid={fetchBills}
      />
    </div>
  );
}
