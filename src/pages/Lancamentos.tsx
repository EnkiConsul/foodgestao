import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { usePrivacy } from "@/hooks/usePrivacy";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TransactionFormDialog } from "@/components/transactions/TransactionFormDialog";
import { BillFormDialog } from "@/components/bills/BillFormDialog";
import { PaymentDialog } from "@/components/bills/PaymentDialog";
import {
  Plus, Search, ArrowLeftRight,
  Trash2, Pencil, ChevronLeft, ChevronRight, Filter, SlidersHorizontal,
  Download, DollarSign, CalendarIcon, CreditCard, HandCoins, X,
} from "lucide-react";
import { toast } from "sonner";
import { format, endOfMonth, isPast, addDays, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Database } from "@/integrations/supabase/types";

type BillStatus = Database["public"]["Enums"]["bill_status"];

type Transaction = {
  id: string;
  description: string;
  amount: number;
  transaction_type: "receita" | "despesa" | "transferencia";
  transaction_date: string;
  status: string;
  category_id: string | null;
  account_id: string;
  payment_method_id: string | null;
  categories: { name: string } | null;
  accounts: { name: string } | null;
  payment_methods: { name: string } | null;
};

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
  account_id: string | null;
  contact_id: string | null;
  categories: { name: string } | null;
  accounts: { name: string } | null;
  payment_methods: { name: string } | null;
};

type UnifiedRow = {
  id: string;
  description: string;
  amount: number;
  date: string;
  rowType: "transaction" | "bill";
  transactionType: "receita" | "despesa" | "transferencia";
  categoryName: string | null;
  accountName: string | null;
  paymentMethodName: string | null;
  txStatus: string | null;
  billStatus: BillStatus | null;
  amountPaid: number;
  dueDate: string | null;
  runningBalance: number;
  original: Transaction | Bill;
};

type Account = { id: string; name: string };
type PaymentMethod = { id: string; name: string };

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const billStatusConfig: Record<BillStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  em_dia: { label: "Em dia", variant: "secondary" },
  vence_em_breve: { label: "Vence em breve", variant: "outline" },
  atrasado: { label: "Atrasado", variant: "destructive" },
  pago: { label: "Pago", variant: "default" },
  parcial: { label: "Parcial", variant: "outline" },
};

function computeBillStatus(bill: Bill): BillStatus {
  if (bill.status === "pago") return "pago";
  if (bill.amount_paid > 0 && bill.amount_paid < bill.amount) return "parcial";
  const due = new Date(bill.due_date + "T23:59:59");
  const now = new Date();
  if (isPast(due) && now > due) return "atrasado";
  if (isAfter(due, now) && !isAfter(due, addDays(now, 7))) return "vence_em_breve";
  return "em_dia";
}

export default function Lancamentos() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { maskBRL } = usePrivacy();
  const isMobile = useIsMobile();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("date");
  const [previousBalance, setPreviousBalance] = useState(0);

  // Filters
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterCredito, setFilterCredito] = useState(true);
  const [filterDebito, setFilterDebito] = useState(true);
  const [filterTransferencia, setFilterTransferencia] = useState(true);
  const [filterRealizado, setFilterRealizado] = useState(true);
  const [filterPendente, setFilterPendente] = useState(true);
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");
  // Bill-specific filters
  const [filterBills, setFilterBills] = useState(true);
  const [filterBillEmDia, setFilterBillEmDia] = useState(true);
  const [filterBillAtrasado, setFilterBillAtrasado] = useState(true);
  const [filterBillPago, setFilterBillPago] = useState(true);
  const [filterBillParcial, setFilterBillParcial] = useState(true);
  const [filterBillVenceBreve, setFilterBillVenceBreve] = useState(true);
  // Date range filter for bills
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const monthStart = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth, 1);
    return format(d, "yyyy-MM-dd");
  }, [selectedYear, selectedMonth]);

  const monthEnd = useMemo(() => {
    const d = endOfMonth(new Date(selectedYear, selectedMonth, 1));
    return format(d, "yyyy-MM-dd");
  }, [selectedYear, selectedMonth]);

  // Fetch accounts & payment methods
  useEffect(() => {
    if (!user) return;
    let q = supabase.from("accounts").select("id, name").eq("user_id", user.id).eq("is_active", true).eq("context", contextType);
    if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);
    q.then(({ data }) => setAccounts(data ?? []));
    supabase.from("payment_methods").select("id, name").eq("user_id", user.id).eq("is_active", true)
      .then(({ data }) => setPaymentMethods(data ?? []));
  }, [user, contextType, selectedCompanyId]);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let q = supabase
      .from("transactions")
      .select("id, description, amount, transaction_type, transaction_date, status, category_id, account_id, payment_method_id, categories(name), accounts!transactions_account_id_fkey(name), payment_methods(name)")
      .eq("user_id", user.id)
      .eq("context", contextType)
      .gte("transaction_date", monthStart)
      .lte("transaction_date", monthEnd)
      .order("transaction_date", { ascending: true });

    if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);

    const { data, error } = await q;

    if (error) {
      toast.error("Erro ao carregar lançamentos");
    } else {
      setTransactions((data as unknown as Transaction[]) ?? []);
    }
    setLoading(false);
  }, [user, monthStart, monthEnd, contextType, selectedCompanyId]);

  // Fetch bills
  const fetchBills = useCallback(async () => {
    if (!user) return;
    let q = supabase
      .from("bills")
      .select("id, description, amount, amount_paid, bill_type, due_date, payment_date, status, category_id, account_id, contact_id, categories(name), accounts!bills_account_id_fkey(name), payment_methods(name)")
      .eq("user_id", user.id)
      .eq("context", contextType)
      .gte("due_date", monthStart)
      .lte("due_date", monthEnd)
      .order("due_date", { ascending: true })
      .limit(200);

    if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);

    const { data, error } = await q;

    if (!error) {
      setBills((data as unknown as Bill[]) ?? []);
    }
  }, [user, monthStart, monthEnd, contextType, selectedCompanyId]);

  // Fetch previous balance
  const fetchPreviousBalance = useCallback(async () => {
    if (!user) return;
    let q = supabase
      .from("transactions")
      .select("amount, transaction_type")
      .eq("user_id", user.id)
      .eq("context", contextType)
      .eq("status", "confirmado")
      .lt("transaction_date", monthStart);

    if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);

    const { data, error } = await q;

    if (!error && data) {
      const bal = data.reduce((acc, t) => {
        if (t.transaction_type === "receita") return acc + Number(t.amount);
        if (t.transaction_type === "despesa") return acc - Number(t.amount);
        return acc;
      }, 0);
      setPreviousBalance(bal);
    }
  }, [user, monthStart, contextType, selectedCompanyId]);

  useEffect(() => {
    fetchTransactions();
    fetchBills();
    fetchPreviousBalance();
  }, [fetchTransactions, fetchBills, fetchPreviousBalance]);

  const refreshAll = () => {
    fetchTransactions();
    fetchBills();
    fetchPreviousBalance();
  };

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<"transaction" | "bill">("transaction");

  const confirmDelete = async () => {
    if (!deleteId) return;
    if (deleteType === "transaction") {
      const tx = transactions.find((t) => t.id === deleteId);
      const { error } = await supabase.from("transactions").delete().eq("id", deleteId);
      if (error) toast.error("Erro ao excluir");
      else {
        await supabase.rpc("insert_audit_log", {
          _action: "transaction_deleted",
          _entity_type: "transaction",
          _entity_id: deleteId,
          _details: { target_name: tx?.description || "—" },
        });
        toast.success("Lançamento excluído");
        refreshAll();
      }
    } else {
      const { error } = await supabase.from("bills").delete().eq("id", deleteId);
      if (error) toast.error("Erro ao excluir");
      else {
        toast.success("Conta excluída");
        refreshAll();
      }
    }
    setDeleteId(null);
  };

  // Unified rows
  const unifiedRows = useMemo(() => {
    const rows: UnifiedRow[] = [];

    // Add transactions
    transactions.forEach((t) => {
      const matchSearch = !search || t.description.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return;
      if (t.transaction_type === "receita" && !filterCredito) return;
      if (t.transaction_type === "despesa" && !filterDebito) return;
      if (t.transaction_type === "transferencia" && !filterTransferencia) return;
      if (t.status === "confirmado" && !filterRealizado) return;
      if (t.status === "pendente" && !filterPendente) return;
      if (filterAccount !== "all" && t.account_id !== filterAccount) return;
      if (filterPaymentMethod !== "all" && t.payment_method_id !== filterPaymentMethod) return;

      rows.push({
        id: t.id,
        description: t.description,
        amount: t.amount,
        date: t.transaction_date,
        rowType: "transaction",
        transactionType: t.transaction_type,
        categoryName: t.categories?.name || null,
        accountName: t.accounts?.name || null,
        paymentMethodName: t.payment_methods?.name || null,
        txStatus: t.status,
        billStatus: null,
        amountPaid: 0,
        dueDate: null,
        runningBalance: 0,
        original: t,
      });
    });

    // Add bills
    if (filterBills) {
      bills.forEach((b) => {
        const matchSearch = !search || b.description.toLowerCase().includes(search.toLowerCase());
        if (!matchSearch) return;
        const computed = computeBillStatus(b);
        if (computed === "em_dia" && !filterBillEmDia) return;
        if (computed === "atrasado" && !filterBillAtrasado) return;
        if (computed === "pago" && !filterBillPago) return;
        if (computed === "parcial" && !filterBillParcial) return;
        if (computed === "vence_em_breve" && !filterBillVenceBreve) return;
        // Date range filter
        if (dateFrom) {
          const dueD = new Date(b.due_date + "T12:00:00");
          if (dueD < dateFrom) return;
        }
        if (dateTo) {
          const dueD = new Date(b.due_date + "T12:00:00");
          if (dueD > dateTo) return;
        }

        rows.push({
          id: b.id,
          description: b.description,
          amount: b.amount,
          date: b.due_date,
          rowType: "bill",
          transactionType: b.bill_type as "receita" | "despesa",
          categoryName: b.categories?.name || null,
          accountName: b.accounts?.name || null,
          paymentMethodName: b.payment_methods?.name || null,
          txStatus: null,
          billStatus: computed,
          amountPaid: b.amount_paid,
          dueDate: b.due_date,
          runningBalance: 0,
          original: b,
        });
      });
    }

    // Sort
    if (sortBy === "date") rows.sort((a, b) => a.date.localeCompare(b.date));
    else if (sortBy === "value") rows.sort((a, b) => b.amount - a.amount);
    else if (sortBy === "description") rows.sort((a, b) => a.description.localeCompare(b.description));

    // Running balance (only for transactions)
    let running = previousBalance;
    rows.forEach((r) => {
      if (r.rowType === "transaction") {
        if (r.transactionType === "receita") running += r.amount;
        else if (r.transactionType === "despesa") running -= r.amount;
        r.runningBalance = running;
      }
    });

    return rows;
  }, [transactions, bills, search, filterCredito, filterDebito, filterTransferencia, filterRealizado, filterPendente, filterAccount, filterPaymentMethod, filterBills, filterBillEmDia, filterBillAtrasado, filterBillPago, filterBillParcial, filterBillVenceBreve, dateFrom, dateTo, sortBy, previousBalance]);

  // Totals
  const totals = useMemo(() => {
    const txRows = unifiedRows.filter((r) => r.rowType === "transaction");
    const receitas = txRows.filter((r) => r.transactionType === "receita").reduce((s, r) => s + r.amount, 0);
    const despesas = txRows.filter((r) => r.transactionType === "despesa").reduce((s, r) => s + r.amount, 0);

    const billRows = unifiedRows.filter((r) => r.rowType === "bill");
    const aPagar = billRows.filter((r) => r.transactionType === "despesa").reduce((s, r) => s + r.amount - r.amountPaid, 0);
    const aReceber = billRows.filter((r) => r.transactionType === "receita").reduce((s, r) => s + r.amount - r.amountPaid, 0);
    const atrasadas = billRows.filter((r) => r.billStatus === "atrasado").length;

    return { receitas, despesas, aPagar, aReceber, atrasadas };
  }, [unifiedRows]);

  const formatBRL = maskBRL;

  const exportCSV = () => {
    const headers = ["Origem", "Data", "Descrição", "Tipo", "Valor", "Status", "Vencimento", "Valor Pago", "Categoria", "Conta", "Forma Pgto", "Saldo"];
    const rows = unifiedRows.map((r) => [
      r.rowType === "transaction" ? "Lançamento" : "Conta",
      format(new Date(r.date + "T12:00:00"), "dd/MM/yyyy"),
      `"${r.description.replace(/"/g, '""')}"`,
      r.transactionType === "receita" ? "Crédito" : r.transactionType === "despesa" ? "Débito" : "Transferência",
      r.amount.toFixed(2).replace(".", ","),
      r.rowType === "transaction" ? (r.txStatus === "confirmado" ? "Realizado" : "Pendente") : (r.billStatus ? billStatusConfig[r.billStatus].label : ""),
      r.dueDate ? format(new Date(r.dueDate + "T12:00:00"), "dd/MM/yyyy") : "",
      r.rowType === "bill" ? r.amountPaid.toFixed(2).replace(".", ",") : "",
      r.categoryName || "",
      r.accountName || "",
      r.paymentMethodName || "",
      r.rowType === "transaction" ? r.runningBalance.toFixed(2).replace(".", ",") : "",
    ]);
    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lancamentos_${format(new Date(selectedYear, selectedMonth, 1), "yyyy-MM")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  };

  const clearFilters = () => {
    setFilterAccount("all");
    setFilterPaymentMethod("all");
    setFilterCredito(true);
    setFilterDebito(true);
    setFilterTransferencia(true);
    setFilterRealizado(true);
    setFilterPendente(true);
    setFilterBills(true);
    setFilterBillEmDia(true);
    setFilterBillAtrasado(true);
    setFilterBillPago(true);
    setFilterBillParcial(true);
    setFilterBillVenceBreve(true);
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const FilterPanel = () => (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conta</label>
        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Todas as contas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as contas</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Forma de Pagamento</label>
        <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {paymentMethods.map((pm) => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo (Lançamentos)</label>
        <div className="space-y-2 mt-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={filterCredito} onCheckedChange={(v) => setFilterCredito(!!v)} />
            Crédito (Receita)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={filterDebito} onCheckedChange={(v) => setFilterDebito(!!v)} />
            Débito (Despesa)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={filterTransferencia} onCheckedChange={(v) => setFilterTransferencia(!!v)} />
            Transferências
          </label>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status (Lançamentos)</label>
        <div className="space-y-2 mt-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={filterRealizado} onCheckedChange={(v) => setFilterRealizado(!!v)} />
            Realizado
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={filterPendente} onCheckedChange={(v) => setFilterPendente(!!v)} />
            Pendente
          </label>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contas a Pagar/Receber</label>
        <div className="space-y-2 mt-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={filterBills} onCheckedChange={(v) => setFilterBills(!!v)} />
            Exibir contas
          </label>
          {filterBills && (
            <div className="pl-5 space-y-2 border-l-2 border-muted ml-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={filterBillEmDia} onCheckedChange={(v) => setFilterBillEmDia(!!v)} />
                Em dia
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={filterBillVenceBreve} onCheckedChange={(v) => setFilterBillVenceBreve(!!v)} />
                Vence em breve
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={filterBillAtrasado} onCheckedChange={(v) => setFilterBillAtrasado(!!v)} />
                Atrasado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={filterBillPago} onCheckedChange={(v) => setFilterBillPago(!!v)} />
                Pago
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={filterBillParcial} onCheckedChange={(v) => setFilterBillParcial(!!v)} />
                Parcial
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Date range filter */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Período (Vencimento)</label>
        <div className="space-y-2 mt-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal text-xs", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data início"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal text-xs", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data fim"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} />
            </PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
              <X className="h-3 w-3 mr-1" /> Limpar período
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => {}}>Filtrar</Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={clearFilters}>Limpar</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button onClick={() => { setEditTransaction(null); setDialogOpen(true); }} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Lançamento
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBillDialogOpen(true)}>
            <CreditCard className="h-4 w-4 mr-1" /> Nova Conta
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setEditTransaction(null); setDialogOpen(true); }}>
            <ArrowLeftRight className="h-4 w-4 mr-1" /> Transferência
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={unifiedRows.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Data</SelectItem>
              <SelectItem value="value">Valor</SelectItem>
              <SelectItem value="description">Descrição</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 w-[160px] text-xs" maxLength={100} />
          </div>
          {isMobile && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <Filter className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filtros</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <FilterPanel />
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      {/* Month navigation */}
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedYear((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[50px] text-center">{selectedYear}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedYear((y) => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => setSelectedMonth(i)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                i === selectedMonth
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Receitas</p>
            <p className="text-sm font-bold text-success">{formatBRL(totals.receitas)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Despesas</p>
            <p className="text-sm font-bold text-destructive">{formatBRL(totals.despesas)}</p>
          </CardContent>
        </Card>
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
        <Card className="shadow-sm col-span-2 md:col-span-1">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Atrasadas</p>
            <p className={`text-sm font-bold ${totals.atrasadas > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {totals.atrasadas}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main content grid */}
      <div className={`gap-4 ${isMobile ? "" : "grid grid-cols-[1fr_260px]"}`}>
        <Card className="shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs w-[35px]">Tipo</TableHead>
                    <TableHead className="text-xs w-[80px]">Data</TableHead>
                    <TableHead className="text-xs">Descrição</TableHead>
                    <TableHead className="text-xs w-[40px] text-center">D/C</TableHead>
                    <TableHead className="text-xs w-[100px] text-right">Valor</TableHead>
                    <TableHead className="text-xs w-[90px]">Status</TableHead>
                    <TableHead className="text-xs w-[80px]">Vencimento</TableHead>
                    <TableHead className="text-xs w-[100px] text-right">Saldo</TableHead>
                    <TableHead className="text-xs w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell colSpan={7} className="text-xs py-2">
                      SALDO ANTERIOR REALIZADO
                    </TableCell>
                    <TableCell className={`text-xs text-right py-2 ${previousBalance >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatBRL(previousBalance)}
                    </TableCell>
                    <TableCell className="py-2" />
                  </TableRow>

                  {unifiedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                        Nenhum registro neste mês
                      </TableCell>
                    </TableRow>
                  ) : (
                    unifiedRows.map((r) => {
                      const isReceita = r.transactionType === "receita";
                      const isDespesa = r.transactionType === "despesa";
                      const isTransf = r.transactionType === "transferencia";
                      const isBill = r.rowType === "bill";
                      const paidPercent = isBill && r.amount > 0 ? Math.min((r.amountPaid / r.amount) * 100, 100) : 0;

                      return (
                        <TableRow key={`${r.rowType}-${r.id}`} className={cn("group", isBill && "bg-accent/30")}>
                          {/* Tipo indicator */}
                          <TableCell className="py-2">
                            {isBill ? (
                              <div className={`flex h-6 w-6 items-center justify-center rounded ${isDespesa ? "bg-destructive/10" : "bg-success/10"}`}>
                                {isDespesa ? <CreditCard className="h-3 w-3 text-destructive" /> : <HandCoins className="h-3 w-3 text-success" />}
                              </div>
                            ) : (
                              <Badge variant="secondary" className="text-[9px] px-1 h-5">Lnç</Badge>
                            )}
                          </TableCell>

                          {/* Data */}
                          <TableCell className="text-xs py-2">
                            {format(new Date(r.date + "T12:00:00"), "dd/MM", { locale: ptBR })}
                          </TableCell>

                          {/* Descrição */}
                          <TableCell className="text-xs py-2">
                            <div className="truncate max-w-[200px]">{r.description}</div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {r.accountName && <span className="text-[10px] text-muted-foreground">{r.accountName}</span>}
                              {r.categoryName && <span className="text-[10px] text-muted-foreground">• {r.categoryName}</span>}
                              {r.paymentMethodName && <span className="text-[10px] text-muted-foreground">• {r.paymentMethodName}</span>}
                              {isBill && r.amountPaid > 0 && r.billStatus !== "pago" && (
                                <span className="text-[10px] text-success font-medium">({paidPercent.toFixed(0)}% pago)</span>
                              )}
                            </div>
                          </TableCell>

                          {/* D/C */}
                          <TableCell className="text-center py-2">
                            {isReceita && <span className="text-xs font-bold text-success">C</span>}
                            {isDespesa && <span className="text-xs font-bold text-destructive">D</span>}
                            {isTransf && <span className="text-xs font-bold text-primary">T</span>}
                          </TableCell>

                          {/* Valor */}
                          <TableCell className={`text-xs text-right py-2 font-medium ${isReceita ? "text-success" : isDespesa ? "text-destructive" : "text-foreground"}`}>
                            {formatBRL(r.amount)}
                            {isBill && r.amountPaid > 0 && (
                              <div className="text-[10px] text-muted-foreground">Pago: {formatBRL(r.amountPaid)}</div>
                            )}
                          </TableCell>

                          {/* Status */}
                          <TableCell className="py-2">
                            {isBill && r.billStatus ? (
                              <Badge variant={billStatusConfig[r.billStatus].variant} className="text-[10px] h-5 px-1.5">
                                {billStatusConfig[r.billStatus].label}
                              </Badge>
                            ) : r.txStatus ? (
                              <Badge variant={r.txStatus === "confirmado" ? "default" : "secondary"} className="text-[10px] h-5 px-1.5">
                                {r.txStatus === "confirmado" ? "Realizado" : "Pendente"}
                              </Badge>
                            ) : null}
                          </TableCell>

                          {/* Vencimento */}
                          <TableCell className="text-xs py-2 text-muted-foreground">
                            {r.dueDate ? format(new Date(r.dueDate + "T12:00:00"), "dd/MM", { locale: ptBR }) : "—"}
                          </TableCell>

                          {/* Saldo */}
                          <TableCell className={`text-xs text-right py-2 font-medium ${!isBill ? (r.runningBalance >= 0 ? "text-success" : "text-destructive") : "text-muted-foreground"}`}>
                            {isBill ? "—" : formatBRL(r.runningBalance)}
                          </TableCell>

                          {/* Ações */}
                          <TableCell className="py-2">
                            <div className="flex items-center gap-0.5">
                              {isBill && r.billStatus !== "pago" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-success hover:text-success"
                                  onClick={() => setPaymentBill(r.original as Bill)}
                                  title="Registrar pagamento"
                                >
                                  <DollarSign className="h-3 w-3" />
                                </Button>
                              )}
                              {!isBill && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => { setEditTransaction(r.original as Transaction); setDialogOpen(true); }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => { setDeleteId(r.id); setDeleteType(r.rowType); }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {!isMobile && (
          <Card className="shadow-sm h-fit">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-4">Filtro Rápido</h3>
              <FilterPanel />
            </CardContent>
          </Card>
        )}
      </div>

      {/* FAB mobile */}
      <button
        onClick={() => { setEditTransaction(null); setDialogOpen(true); }}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={refreshAll}
        transaction={editTransaction}
      />

      <BillFormDialog open={billDialogOpen} onOpenChange={setBillDialogOpen} onCreated={refreshAll} />

      <PaymentDialog
        open={!!paymentBill}
        onOpenChange={(open) => { if (!open) setPaymentBill(null); }}
        bill={paymentBill}
        onPaid={refreshAll}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteType === "transaction" ? "lançamento" : "conta"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O registro será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
