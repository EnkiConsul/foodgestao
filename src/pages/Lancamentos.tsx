import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Plus, Search, ArrowLeftRight,
  Trash2, Pencil, ChevronLeft, ChevronRight, ChevronDown, Filter, SlidersHorizontal,
  Download, DollarSign, CalendarIcon, CreditCard, HandCoins, X, Settings2, Repeat, Paperclip, Check,
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
  is_recurring: boolean;
  parent_transaction_id: string | null;
  attachment_url: string | null; // legacy, kept for query compat
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
  isRecurring: boolean;
  isRecurrenceChild: boolean;
  attachmentCount: number;
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
  const [dialogInitialType, setDialogInitialType] = useState<"receita" | "despesa" | "transferencia" | undefined>(undefined);
  const [filterCollapsed, setFilterCollapsed] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const [paymentTx, setPaymentTx] = useState<Transaction | null>(null);
  const [previewAttachments, setPreviewAttachments] = useState<{ id: string; file_name: string; file_url: string }[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [attachmentCounts, setAttachmentCounts] = useState<Map<string, number>>(new Map());
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
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
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
    supabase.from("categories").select("id, name").eq("user_id", user.id).order("name")
      .then(({ data }) => setCategories(data ?? []));
  }, [user, contextType, selectedCompanyId]);

  // Fetch transactions (includes bills now via due_date)
  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // We need transactions that fall in the month by transaction_date OR by due_date
    let q = supabase
      .from("transactions")
      .select("id, description, amount, transaction_type, transaction_date, status, category_id, account_id, payment_method_id, due_date, amount_paid, bill_status, payment_date, contact_id, notes, destination_account_id, is_recurring, parent_transaction_id, attachment_url, categories!fk_transactions_category(name), accounts!fk_transactions_account(name), payment_methods!fk_transactions_payment_method(name)")
      .eq("user_id", user.id)
      .eq("context", contextType)
      .or(`and(transaction_date.gte.${monthStart},transaction_date.lte.${monthEnd}),and(due_date.gte.${monthStart},due_date.lte.${monthEnd})`)
      .order("transaction_date", { ascending: true });

    if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);

    const { data, error } = await q;

    if (error) {
      toast.error("Erro ao carregar lançamentos");
    } else {
      const txs = (data as unknown as Transaction[]) ?? [];
      setTransactions(txs);
      // Fetch attachment counts for these transactions
      if (txs.length > 0) {
        const txIds = txs.map(t => t.id);
        const { data: attData } = await supabase
          .from("transaction_attachments")
          .select("transaction_id")
          .in("transaction_id", txIds);
        const countMap = new Map<string, number>();
        (attData ?? []).forEach(a => {
          countMap.set(a.transaction_id, (countMap.get(a.transaction_id) || 0) + 1);
        });
        setAttachmentCounts(countMap);
      } else {
        setAttachmentCounts(new Map());
      }
    }
    setLoading(false);
  }, [user, monthStart, monthEnd, contextType, selectedCompanyId]);

  // Fetch previous balance via RPC agregada (1 número em vez de N linhas)
  const fetchPreviousBalance = useCallback(async () => {
    if (!user) return;
    const companyId = contextType === "pj" && selectedCompanyId ? selectedCompanyId : null;
    const { data, error } = await supabase.rpc("get_balance_before", {
      _user_id: user.id,
      _context: contextType,
      _company_id: companyId,
      _before_date: monthStart,
    });
    if (!error && data !== null && data !== undefined) {
      setPreviousBalance(Number(data));
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
  const [deleteWithChildren, setDeleteWithChildren] = useState(false);
  const [cancelStatusId, setCancelStatusId] = useState<string | null>(null);

  const deletingTx = deleteId ? transactions.find((t) => t.id === deleteId) : null;
  const isDeleteTargetRecurringParent = deletingTx?.is_recurring === true;

  const confirmDelete = async () => {
    if (!deleteId) return;
    const tx = transactions.find((t) => t.id === deleteId);

    // If deleting children too, delete them first
    if (deleteWithChildren && isDeleteTargetRecurringParent) {
      const { error: childErr } = await supabase
        .from("transactions")
        .delete()
        .eq("parent_transaction_id", deleteId)
        .neq("status", "confirmado");
      if (childErr) {
        toast.error("Erro ao excluir recorrências", { description: childErr.message });
        return;
      }
    }

    const { error } = await supabase.from("transactions").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir");
    else {
      await supabase.rpc("insert_audit_log", {
        _action: "transaction_deleted",
        _entity_type: "transaction",
        _entity_id: deleteId,
        _details: { target_name: tx?.description || "—", deleted_children: deleteWithChildren },
      });
      toast.success(deleteWithChildren ? "Lançamento e recorrências excluídos" : "Lançamento excluído");
      refreshAll();
    }
    setDeleteId(null);
    setDeleteWithChildren(false);
  };

  const updateTransactionStatus = async (txId: string, newStatus: string) => {
    const updateData: any = { status: newStatus };
    const tx = transactions.find(t => t.id === txId);
    if (newStatus === "confirmado") {
      if (tx && !tx.payment_date) {
        updateData.payment_date = format(new Date(), "yyyy-MM-dd");
      }
      if (tx && tx.amount_paid === 0) {
        updateData.amount_paid = tx.amount;
      }
      updateData.bill_status = "pago";
    } else if (newStatus === "pendente") {
      updateData.amount_paid = 0;
      updateData.payment_date = null;
      updateData.bill_status = null;
    } else if (newStatus === "cancelado") {
      updateData.amount_paid = 0;
      updateData.payment_date = null;
      updateData.bill_status = null;
    }
    const { error } = await supabase.from("transactions").update(updateData).eq("id", txId);
    if (error) {
      toast.error("Erro ao atualizar status");
    } else {
      toast.success(`Status alterado para ${newStatus === "confirmado" ? "Pago" : newStatus === "pendente" ? "Pendente" : "Cancelado"}`);
      refreshAll();
    }
  };

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
      if (filterCategory !== "all" && t.category_id !== filterCategory) return;

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
        isRecurring: t.is_recurring,
        isRecurrenceChild: !!t.parent_transaction_id,
        attachmentCount: attachmentCounts.get(t.id) || 0,
        original: t,
      });
    });

    // Sort
    if (sortBy === "date") rows.sort((a, b) => a.date.localeCompare(b.date));
    else if (sortBy === "value") rows.sort((a, b) => b.amount - a.amount);
    else if (sortBy === "description") rows.sort((a, b) => a.description.localeCompare(b.description));

    // Running balance: count confirmed transactions OR paid bills (amount_paid >= amount)
    let running = previousBalance;
    rows.forEach((r) => {
      const isPaid = r.hasDueDate && r.amountPaid >= r.amount;
      if (r.txStatus === "confirmado" || isPaid) {
        if (r.transactionType === "receita") running += r.amount;
        else if (r.transactionType === "despesa") running -= r.amount;
      }
      r.runningBalance = running;
    });

    return rows;
  }, [transactions, search, filterCredito, filterDebito, filterTransferencia, filterPago, filterAVencer, filterAtrasado, filterAccount, filterPaymentMethod, filterCategory, dateFrom, dateTo, sortBy, previousBalance]);

  // Totals
  const totals = useMemo(() => {
    const effectiveRows = displayRows.filter((r) => r.txStatus === "confirmado" || (r.hasDueDate && r.amountPaid >= r.amount));
    const receitas = effectiveRows.filter((r) => r.transactionType === "receita").reduce((s, r) => s + r.amount, 0);
    const despesas = effectiveRows.filter((r) => r.transactionType === "despesa").reduce((s, r) => s + r.amount, 0);

    const withDue = displayRows.filter((r) => r.hasDueDate && r.billStatus !== "pago");
    const aPagar = withDue.filter((r) => r.transactionType === "despesa").reduce((s, r) => s + r.amount - r.amountPaid, 0);
    const aReceber = withDue.filter((r) => r.transactionType === "receita").reduce((s, r) => s + r.amount - r.amountPaid, 0);
    const atrasadas = displayRows.filter((r) => r.billStatus === "atrasado").length;

    const allReceitas = displayRows.filter((r) => r.transactionType === "receita").reduce((s, r) => s + r.amount, 0);
    const allDespesas = displayRows.filter((r) => r.transactionType === "despesa").reduce((s, r) => s + r.amount, 0);
    const saldoPeriodo = allReceitas - allDespesas;
    const saldoAcumulado = previousBalance + saldoPeriodo;

    return { receitas, despesas, aPagar, aReceber, atrasadas, allReceitas, allDespesas, saldoPeriodo, saldoAcumulado };
  }, [displayRows, previousBalance]);

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
    setFilterCategory("all");
    setFilterCredito(true);
    setFilterDebito(true);
    setFilterTransferencia(true);
    setFilterPago(true);
    setFilterAVencer(true);
    setFilterAtrasado(true);
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const FilterSection = ({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
      <div className="border rounded">
        <button
          onClick={() => setOpen(prev => !prev)}
          className="flex items-center justify-between w-full px-1.5 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/50 transition-colors"
        >
          {title}
          <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", open && "rotate-180")} />
        </button>
        {open && <div className="px-1.5 pb-1.5">{children}</div>}
      </div>
    );
  };

  const saldoDates = useMemo(() => {
    const prevMonthEnd = new Date(selectedYear, selectedMonth, 0);
    const curMonthStart = new Date(selectedYear, selectedMonth, 1);
    const curMonthEnd = endOfMonth(new Date(selectedYear, selectedMonth, 1));
    return {
      prevEnd: format(prevMonthEnd, "dd/MM/yyyy"),
      curStart: format(curMonthStart, "dd/MM/yyyy"),
      curEnd: format(curMonthEnd, "dd/MM/yyyy"),
      curRange: `${format(curMonthStart, "dd")} a ${format(curMonthEnd, "dd/MM/yyyy")}`,
    };
  }, [selectedYear, selectedMonth]);

  const SaldosCard = () => {
    const [open, setOpen] = useState(true);
    const rows = [
      { label: "Saldo Anterior", date: saldoDates.prevEnd, value: previousBalance },
      { label: "Saldo do Período", date: saldoDates.curRange, value: totals.saldoPeriodo },
      { label: "Saldo Acumulado", date: saldoDates.curEnd, value: totals.saldoAcumulado },
    ];
    return (
      <Card className="shadow-sm mb-3">
        <button
          onClick={() => setOpen(prev => !prev)}
          className="flex items-center justify-between w-full px-1.5 py-1.5"
        >
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-semibold">Saldos</span>
          </div>
          <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div className="px-1.5 pb-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-end justify-between py-1 border-b last:border-b-0">
                <div>
                  <p className="text-[10px] text-muted-foreground leading-tight">{r.label}</p>
                  <p className="text-[9px] text-muted-foreground/70 leading-tight">{r.date}</p>
                </div>
                <span className={cn("text-[11px] font-medium", r.value >= 0 ? "text-success" : "text-destructive")}>
                  {formatBRL(r.value)}
                </span>
              </div>
            ))}
            <div className="mt-1.5 rounded-md bg-success/10 p-2 flex items-end justify-between">
              <p className="text-[10px] text-muted-foreground">Saldo Atual</p>
              <span className={cn("text-[12px] font-bold", totals.saldoAcumulado >= 0 ? "text-success" : "text-destructive")}>
                {formatBRL(totals.saldoAcumulado)}
              </span>
            </div>
          </div>
        )}
      </Card>
    );
  };

  const FilterPanel = () => (
    <div className="space-y-1">
      <FilterSection title="Conta">
        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="mt-0.5 h-6 text-[11px]"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterSection>

      <FilterSection title="Forma de Pagamento">
        <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
          <SelectTrigger className="mt-0.5 h-6 text-[11px]"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {paymentMethods.map((pm) => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterSection>

      <FilterSection title="Categoria">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="mt-0.5 h-6 text-[11px]"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterSection>

      <FilterSection title="Lançamentos">
        <div className="space-y-0.5 mt-0.5">
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterCredito} onCheckedChange={(v) => setFilterCredito(!!v)} className="h-3 w-3" />
            Crédito (Receita)
          </label>
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterDebito} onCheckedChange={(v) => setFilterDebito(!!v)} className="h-3 w-3" />
            Débito (Despesa)
          </label>
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterTransferencia} onCheckedChange={(v) => setFilterTransferencia(!!v)} className="h-3 w-3" />
            Transferências
          </label>
        </div>
      </FilterSection>

      <FilterSection title="Status">
        <div className="space-y-0.5 mt-0.5">
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterPago} onCheckedChange={(v) => setFilterPago(!!v)} className="h-3 w-3" />
            Pago
          </label>
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterAVencer} onCheckedChange={(v) => setFilterAVencer(!!v)} className="h-3 w-3" />
            A Vencer
          </label>
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={filterAtrasado} onCheckedChange={(v) => setFilterAtrasado(!!v)} className="h-3 w-3" />
            Atrasado
          </label>
        </div>
      </FilterSection>

      <FilterSection title="Período (Vencimento)" defaultOpen={false}>
        <div className="space-y-1 mt-0.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal text-[10px] h-6", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-2.5 w-2.5" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data início"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal text-[10px] h-6", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-2.5 w-2.5" />
                {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data fim"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} />
            </PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="w-full text-[10px] h-6" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
              <X className="h-2.5 w-2.5 mr-1" /> Limpar período
            </Button>
          )}
        </div>
      </FilterSection>

      <div className="flex gap-1 pt-1">
        <Button size="sm" className="flex-1 h-6 text-[11px]" onClick={() => {}}>Filtrar</Button>
        <Button size="sm" variant="outline" className="flex-1 h-6 text-[11px]" onClick={clearFilters}>Limpar</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button onClick={() => { setEditTransaction(null); setDialogInitialType(undefined); setDialogOpen(true); }} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Lançamento
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setEditTransaction(null); setDialogInitialType("transferencia"); setDialogOpen(true); }}>
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
                  <SaldosCard />
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
      <div className={`gap-3 ${isMobile ? "" : "grid grid-cols-[1fr_185px]"}`}>
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
                    {visibleColumns.data !== false && <TableHead className="text-xs w-[75px]">Data</TableHead>}
                    <TableHead className="text-xs">Descrição</TableHead>
                    {visibleColumns.dc && <TableHead className="text-xs w-[40px] text-center">D/C</TableHead>}
                    {visibleColumns.categoria && <TableHead className="text-xs w-[110px]">Categoria</TableHead>}
                    {visibleColumns.conta && <TableHead className="text-xs w-[110px]">Conta</TableHead>}
                    {visibleColumns.formaPagamento && <TableHead className="text-xs w-[100px]">Forma Pgto</TableHead>}
                    <TableHead className="text-xs w-[110px] text-right">Valor</TableHead>
                    {visibleColumns.status && <TableHead className="text-xs w-[85px]">Status</TableHead>}
                    {visibleColumns.vencimento && <TableHead className="text-xs w-[75px]">Vencimento</TableHead>}
                    {visibleColumns.saldo && <TableHead className="text-xs w-[115px] text-right">Saldo</TableHead>}
                    <TableHead className="text-xs w-[90px]" />
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
                            <div className="flex items-center gap-1 max-w-[280px]">
                              {(r.isRecurring || r.isRecurrenceChild) && (
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
                                          setPreviewAttachments(data ?? []);
                                          setPreviewOpen(true);
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
                            {isReceita && <span className="text-xs font-bold text-success">C</span>}
                            {isDespesa && <span className="text-xs font-bold text-destructive">D</span>}
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
                          <TableCell className={`text-xs text-right py-2 font-medium whitespace-nowrap ${isReceita ? "text-success" : isDespesa ? "text-destructive" : "text-foreground"}`}>
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
                                  <Badge variant={displayStatusConfig[r.billStatus].variant} className="text-[10px] h-5 px-1.5 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity">
                                    {displayStatusConfig[r.billStatus].label}
                                  </Badge>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-40 p-1" align="start">
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    type="button"
                                    className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent transition-colors text-left", r.original.status === "confirmado" && "bg-accent font-medium")}
                                    onClick={() => updateTransactionStatus(r.id, "confirmado")}
                                  >
                                    <Check className="h-3 w-3 text-success" />
                                    Pago
                                  </button>
                                  <button
                                    type="button"
                                    className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent transition-colors text-left", r.original.status === "pendente" && "bg-accent font-medium")}
                                    onClick={() => updateTransactionStatus(r.id, "pendente")}
                                  >
                                    <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                                    Pendente
                                  </button>
                                  <button
                                    type="button"
                                    className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent transition-colors text-left", r.original.status === "cancelado" && "bg-accent font-medium")}
                                    onClick={() => setCancelStatusId(r.id)}
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
                          <TableCell className="text-xs py-2 text-muted-foreground">
                            {r.dueDate ? format(new Date(r.dueDate + "T12:00:00"), "dd/MM", { locale: ptBR }) : "—"}
                          </TableCell>
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
                                onClick={() => { setEditTransaction(r.original); setDialogInitialType(undefined); setDialogOpen(true); }}
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
          <div>
            <Card className="shadow-sm h-fit mb-3">
              <CardContent className="p-2">
                <h3 className="text-[11px] font-semibold mb-1.5">Filtro Rápido</h3>
                <FilterPanel />
              </CardContent>
            </Card>
            <SaldosCard />
          </div>
        )}
      </div>

      {/* FAB mobile */}
      <button
        onClick={() => { setEditTransaction(null); setDialogInitialType(undefined); setDialogOpen(true); }}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={refreshAll}
        transaction={editTransaction}
        initialType={dialogInitialType}
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

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) { setDeleteId(null); setDeleteWithChildren(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O registro será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isDeleteTargetRecurringParent && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                id="delete-children"
                checked={deleteWithChildren}
                onCheckedChange={(v) => setDeleteWithChildren(!!v)}
              />
              <label htmlFor="delete-children" className="text-sm cursor-pointer">
                Excluir também todas as ocorrências futuras pendentes
              </label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir{deleteWithChildren ? " tudo" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelStatusId} onOpenChange={(o) => { if (!o) setCancelStatusId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O lançamento será marcado como cancelado, o valor pago será zerado e não será mais considerado nos saldos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (cancelStatusId) { updateTransactionStatus(cancelStatusId, "cancelado"); setCancelStatusId(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-sm font-medium text-foreground">
                Anexos ({previewAttachments.length})
              </span>
            </div>
            <div className="flex-1 overflow-auto p-4 pt-0 space-y-4">
              {previewAttachments.map((att) => (
                <div key={att.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">{att.file_name}</span>
                    <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline shrink-0">
                      Abrir em nova aba
                    </a>
                  </div>
                  {/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(att.file_url) ? (
                    <img src={att.file_url} alt={att.file_name} className="max-w-full h-auto rounded-md mx-auto" />
                  ) : /\.pdf(\?.*)?$/i.test(att.file_url) ? (
                    <iframe src={att.file_url} className="w-full h-[50vh] rounded-md border" title={att.file_name} />
                  ) : (
                    <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
                      <Paperclip className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Pré-visualização não disponível</span>
                      <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline ml-auto">
                        Baixar
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
