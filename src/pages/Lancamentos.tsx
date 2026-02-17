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
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TransactionFormDialog } from "@/components/transactions/TransactionFormDialog";
import { PaymentDialog } from "@/components/bills/PaymentDialog";
import {
  Plus, Search, ArrowLeftRight,
  Trash2, Pencil, ChevronLeft, ChevronRight, Filter, SlidersHorizontal,
  Download, DollarSign, CalendarIcon, CreditCard, HandCoins, X, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { format, endOfMonth, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";


type TransactionDisplayStatus = "pago" | "a_vencer" | "atrasado";

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
  due_date: string | null;
  amount_paid: number;
  bill_status: string | null;
  payment_date: string | null;
  contact_id: string | null;
  categories: { name: string } | null;
  accounts: { name: string } | null;
  payment_methods: { name: string } | null;
  notes: string | null;
  destination_account_id: string | null;
};

type DisplayRow = {
  id: string;
  description: string;
  amount: number;
  date: string;
  transactionType: "receita" | "despesa" | "transferencia";
  categoryName: string | null;
  accountName: string | null;
  paymentMethodName: string | null;
  txStatus: string;
  billStatus: TransactionDisplayStatus;
  amountPaid: number;
  dueDate: string | null;
  runningBalance: number;
  hasDueDate: boolean;
  original: Transaction;
};

type Account = { id: string; name: string };
type PaymentMethod = { id: string; name: string };

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const displayStatusConfig: Record<TransactionDisplayStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  pago: { label: "Pago", variant: "default" },
  a_vencer: { label: "A Vencer", variant: "secondary" },
  atrasado: { label: "Atrasado", variant: "destructive" },
};

function computeDisplayStatus(tx: Transaction): TransactionDisplayStatus {
  // Has due_date: check payment
  if (tx.due_date) {
    if (tx.amount_paid >= tx.amount) return "pago";
    const due = new Date(tx.due_date + "T23:59:59");
    if (isPast(due)) return "atrasado";
    return "a_vencer";
  }
  // No due_date: use transaction status + date
  if (tx.status === "confirmado") return "pago";
  // Pending without due_date: check if transaction_date is in the past
  const txDate = new Date(tx.transaction_date + "T23:59:59");
  if (isPast(txDate)) return "atrasado";
  return "a_vencer";
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const [paymentTx, setPaymentTx] = useState<Transaction | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("date");
  const [previousBalance, setPreviousBalance] = useState(0);

  // Filters
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterCredito, setFilterCredito] = useState(true);
  const [filterDebito, setFilterDebito] = useState(true);
  const [filterTransferencia, setFilterTransferencia] = useState(true);
  const [filterPago, setFilterPago] = useState(true);
  const [filterAVencer, setFilterAVencer] = useState(true);
  const [filterAtrasado, setFilterAtrasado] = useState(true);
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");
  // Date range filter
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("lancamentos_columns");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { data: true, dc: true, categoria: true, conta: true, formaPagamento: true, status: true, vencimento: true, saldo: true };
  });

  useEffect(() => {
    localStorage.setItem("lancamentos_columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (col: string) => {
    setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const visibleOptionalCount = Object.values(visibleColumns).filter(Boolean).length;
  // 3 fixed columns (Descrição, Valor, Ações) + optional
  const totalColumns = 3 + visibleOptionalCount;

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

  // Fetch transactions (includes bills now via due_date)
  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // We need transactions that fall in the month by transaction_date OR by due_date
    let q = supabase
      .from("transactions")
      .select("id, description, amount, transaction_type, transaction_date, status, category_id, account_id, payment_method_id, due_date, amount_paid, bill_status, payment_date, contact_id, notes, destination_account_id, categories(name), accounts!transactions_account_id_fkey(name), payment_methods(name)")
      .eq("user_id", user.id)
      .eq("context", contextType)
      .or(`and(transaction_date.gte.${monthStart},transaction_date.lte.${monthEnd}),and(due_date.gte.${monthStart},due_date.lte.${monthEnd})`)
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
    fetchPreviousBalance();
  }, [fetchTransactions, fetchPreviousBalance]);

  const refreshAll = () => {
    fetchTransactions();
    fetchPreviousBalance();
  };

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleteId) return;
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
    setDeleteId(null);
  };

  // Display rows
  const displayRows = useMemo(() => {
    const rows: DisplayRow[] = [];

    transactions.forEach((t) => {
      const matchSearch = !search || t.description.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return;
      if (t.transaction_type === "receita" && !filterCredito) return;
      if (t.transaction_type === "despesa" && !filterDebito) return;
      if (t.transaction_type === "transferencia" && !filterTransferencia) return;
      if (filterAccount !== "all" && t.account_id !== filterAccount) return;
      if (filterPaymentMethod !== "all" && t.payment_method_id !== filterPaymentMethod) return;

      const computed = computeDisplayStatus(t);

      // Status filter
      if (computed === "pago" && !filterPago) return;
      if (computed === "a_vencer" && !filterAVencer) return;
      if (computed === "atrasado" && !filterAtrasado) return;

      // Date range filter for due_date
      if (t.due_date) {
        if (dateFrom) {
          const dueD = new Date(t.due_date + "T12:00:00");
          if (dueD < dateFrom) return;
        }
        if (dateTo) {
          const dueD = new Date(t.due_date + "T12:00:00");
          if (dueD > dateTo) return;
        }
      }

      rows.push({
        id: t.id,
        description: t.description,
        amount: t.amount,
        date: t.transaction_date,
        transactionType: t.transaction_type,
        categoryName: t.categories?.name || null,
        accountName: t.accounts?.name || null,
        paymentMethodName: t.payment_methods?.name || null,
        txStatus: t.status,
        billStatus: computed,
        amountPaid: t.amount_paid,
        dueDate: t.due_date,
        runningBalance: 0,
        hasDueDate: !!t.due_date,
        original: t,
      });
    });

    // Sort
    if (sortBy === "date") rows.sort((a, b) => a.date.localeCompare(b.date));
    else if (sortBy === "value") rows.sort((a, b) => b.amount - a.amount);
    else if (sortBy === "description") rows.sort((a, b) => a.description.localeCompare(b.description));

    // Running balance (only confirmed transactions without due_date, or paid)
    let running = previousBalance;
    rows.forEach((r) => {
      if (r.txStatus === "confirmado") {
        if (r.transactionType === "receita") running += r.amount;
        else if (r.transactionType === "despesa") running -= r.amount;
      }
      r.runningBalance = running;
    });

    return rows;
  }, [transactions, search, filterCredito, filterDebito, filterTransferencia, filterPago, filterAVencer, filterAtrasado, filterAccount, filterPaymentMethod, dateFrom, dateTo, sortBy, previousBalance]);

  // Totals
  const totals = useMemo(() => {
    const confirmed = displayRows.filter((r) => r.txStatus === "confirmado");
    const receitas = confirmed.filter((r) => r.transactionType === "receita").reduce((s, r) => s + r.amount, 0);
    const despesas = confirmed.filter((r) => r.transactionType === "despesa").reduce((s, r) => s + r.amount, 0);

    const withDue = displayRows.filter((r) => r.hasDueDate && r.billStatus !== "pago");
    const aPagar = withDue.filter((r) => r.transactionType === "despesa").reduce((s, r) => s + r.amount - r.amountPaid, 0);
    const aReceber = withDue.filter((r) => r.transactionType === "receita").reduce((s, r) => s + r.amount - r.amountPaid, 0);
    const atrasadas = displayRows.filter((r) => r.billStatus === "atrasado").length;

    const allReceitas = displayRows.filter((r) => r.transactionType === "receita").reduce((s, r) => s + r.amount, 0);
    const allDespesas = displayRows.filter((r) => r.transactionType === "despesa").reduce((s, r) => s + r.amount, 0);

    return { receitas, despesas, aPagar, aReceber, atrasadas, allReceitas, allDespesas };
  }, [displayRows]);

  const formatBRL = maskBRL;

  const exportCSV = () => {
    const headers = ["Data", "Descrição", "Tipo", "Valor", "Status", "Vencimento", "Valor Pago", "Categoria", "Conta", "Forma Pgto", "Saldo"];
    const csvRows = displayRows.map((r) => [
      format(new Date(r.date + "T12:00:00"), "dd/MM/yyyy"),
      `"${r.description.replace(/"/g, '""')}"`,
      r.transactionType === "receita" ? "Crédito" : r.transactionType === "despesa" ? "Débito" : "Transferência",
      r.amount.toFixed(2).replace(".", ","),
      displayStatusConfig[r.billStatus].label,
      r.dueDate ? format(new Date(r.dueDate + "T12:00:00"), "dd/MM/yyyy") : "",
      r.amountPaid > 0 ? r.amountPaid.toFixed(2).replace(".", ",") : "",
      r.categoryName || "",
      r.accountName || "",
      r.paymentMethodName || "",
      r.runningBalance.toFixed(2).replace(".", ","),
    ]);
    const csv = [headers.join(";"), ...csvRows.map((r) => r.join(";"))].join("\n");
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
    setFilterPago(true);
    setFilterAVencer(true);
    setFilterAtrasado(true);
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
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo</label>
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
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
        <div className="space-y-2 mt-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={filterPago} onCheckedChange={(v) => setFilterPago(!!v)} />
            Pago
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={filterAVencer} onCheckedChange={(v) => setFilterAVencer(!!v)} />
            A Vencer
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={filterAtrasado} onCheckedChange={(v) => setFilterAtrasado(!!v)} />
            Atrasado
          </label>
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
          <Button variant="outline" size="sm" onClick={() => { setEditTransaction(null); setDialogOpen(true); }}>
            <ArrowLeftRight className="h-4 w-4 mr-1" /> Transferência
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={displayRows.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="h-4 w-4 mr-1" /> Colunas
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="end">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Colunas visíveis</p>
              <div className="space-y-2">
                {[
                  { key: "data", label: "Data", fixed: false },
                  { key: "descricao", label: "Descrição", fixed: true },
                  { key: "dc", label: "D/C", fixed: false },
                  { key: "categoria", label: "Categoria", fixed: false },
                  { key: "conta", label: "Conta", fixed: false },
                  { key: "formaPagamento", label: "Forma Pgto", fixed: false },
                  { key: "valor", label: "Valor", fixed: true },
                  { key: "status", label: "Status", fixed: false },
                  { key: "vencimento", label: "Vencimento", fixed: false },
                  { key: "saldo", label: "Saldo", fixed: false },
                  { key: "acoes", label: "Ações", fixed: true },
                ].map((col) => (
                  <label key={col.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={col.fixed ? true : !!visibleColumns[col.key]}
                      disabled={col.fixed}
                      onCheckedChange={() => !col.fixed && toggleColumn(col.key)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
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
                    {visibleColumns.data !== false && <TableHead className="text-xs w-[80px]">Data</TableHead>}
                    <TableHead className="text-xs">Descrição</TableHead>
                    {visibleColumns.dc && <TableHead className="text-xs w-[40px] text-center">D/C</TableHead>}
                    {visibleColumns.categoria && <TableHead className="text-xs w-[100px]">Categoria</TableHead>}
                    {visibleColumns.conta && <TableHead className="text-xs w-[100px]">Conta</TableHead>}
                    {visibleColumns.formaPagamento && <TableHead className="text-xs w-[100px]">Forma Pgto</TableHead>}
                    <TableHead className="text-xs w-[100px] text-right">Valor</TableHead>
                    {visibleColumns.status && <TableHead className="text-xs w-[90px]">Status</TableHead>}
                    {visibleColumns.vencimento && <TableHead className="text-xs w-[80px]">Vencimento</TableHead>}
                    {visibleColumns.saldo && <TableHead className="text-xs w-[100px] text-right">Saldo</TableHead>}
                    <TableHead className="text-xs w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell colSpan={totalColumns - (visibleColumns.saldo ? 2 : 1)} className="text-xs py-2">
                      SALDO ANTERIOR
                    </TableCell>
                    {visibleColumns.saldo && (
                      <TableCell className={`text-xs text-right py-2 ${previousBalance >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatBRL(previousBalance)}
                      </TableCell>
                    )}
                    <TableCell className="py-2" />
                  </TableRow>

                  {displayRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={totalColumns} className="text-center py-8 text-muted-foreground text-sm">
                        Nenhum registro neste mês
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayRows.map((r) => {
                      const isReceita = r.transactionType === "receita";
                      const isDespesa = r.transactionType === "despesa";
                      const isTransf = r.transactionType === "transferencia";
                      const hasDue = r.hasDueDate;
                      const paidPercent = hasDue && r.amount > 0 ? Math.min((r.amountPaid / r.amount) * 100, 100) : 0;

                      return (
                        <TableRow key={r.id} className={cn("group", hasDue && r.billStatus !== "pago" && "bg-accent/30")}>
                          {/* Data */}
                          {visibleColumns.data !== false && (
                          <TableCell className="text-xs py-2">
                            {format(new Date(r.date + "T12:00:00"), "dd/MM", { locale: ptBR })}
                          </TableCell>
                          )}

                          {/* Descrição */}
                          <TableCell className="text-xs py-2">
                            <div className="truncate max-w-[200px]">{r.description}</div>
                          </TableCell>

                          {/* D/C */}
                          {visibleColumns.dc && (
                          <TableCell className="text-center py-2">
                            {isReceita && <span className="text-xs font-bold text-success">C</span>}
                            {isDespesa && <span className="text-xs font-bold text-destructive">D</span>}
                            {isTransf && <span className="text-xs font-bold text-primary">T</span>}
                          </TableCell>
                          )}

                          {/* Categoria */}
                          {visibleColumns.categoria && (
                          <TableCell className="text-xs py-2 text-muted-foreground truncate max-w-[100px]">
                            {r.categoryName || "—"}
                          </TableCell>
                          )}

                          {/* Conta */}
                          {visibleColumns.conta && (
                          <TableCell className="text-xs py-2 text-muted-foreground truncate max-w-[100px]">
                            {r.accountName || "—"}
                          </TableCell>
                          )}

                          {/* Forma Pgto */}
                          {visibleColumns.formaPagamento && (
                          <TableCell className="text-xs py-2 text-muted-foreground truncate max-w-[100px]">
                            {r.paymentMethodName || "—"}
                          </TableCell>
                          )}

                          {/* Valor */}
                          <TableCell className={`text-xs text-right py-2 font-medium ${isReceita ? "text-success" : isDespesa ? "text-destructive" : "text-foreground"}`}>
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
                            <Badge variant={displayStatusConfig[r.billStatus].variant} className="text-[10px] h-5 px-1.5">
                              {displayStatusConfig[r.billStatus].label}
                            </Badge>
                          </TableCell>
                          )}

                          {/* Vencimento */}
                          {visibleColumns.vencimento && (
                          <TableCell className="text-xs py-2 text-muted-foreground">
                            {r.dueDate ? format(new Date(r.dueDate + "T12:00:00"), "dd/MM", { locale: ptBR }) : "—"}
                          </TableCell>
                          )}

                          {/* Saldo */}
                          {visibleColumns.saldo && (
                          <TableCell className={`text-xs text-right py-2 font-medium ${r.runningBalance >= 0 ? "text-success" : "text-destructive"}`}>
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
                                  onClick={() => setPaymentTx(r.original)}
                                  title="Registrar pagamento"
                                >
                                  <DollarSign className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => { setEditTransaction(r.original); setDialogOpen(true); }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteId(r.id)}
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

      <PaymentDialog
        open={!!paymentTx}
        onOpenChange={(open) => { if (!open) setPaymentTx(null); }}
        bill={paymentTx ? {
          id: paymentTx.id,
          description: paymentTx.description,
          amount: paymentTx.amount,
          amount_paid: paymentTx.amount_paid,
          transaction_type: paymentTx.transaction_type as "receita" | "despesa",
          account_id: paymentTx.account_id,
          category_id: paymentTx.category_id,
          contact_id: paymentTx.contact_id,
        } : null}
        onPaid={refreshAll}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
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
