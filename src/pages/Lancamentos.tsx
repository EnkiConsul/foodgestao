import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { resolveAttachments } from "@/lib/attachments";
import { amountColorClass } from "@/lib/transaction-sign";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { usePrivacy } from "@/hooks/usePrivacy";
import { useIsMobile } from "@/hooks/use-mobile";

import { supabase } from "@/integrations/supabase/client";
import { applyFinancialScope, assertFinancialScope, isFinancialScopeReady } from "@/lib/financialScope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TransactionFormDialog } from "@/components/transactions/TransactionFormDialog";
const ImportStatementDialog = lazy(() =>
  import("@/components/transactions/ImportStatementDialog").then((m) => ({ default: m.ImportStatementDialog })),
);
import { PaymentDialog } from "@/components/bills/PaymentDialog";
import { BulkEditDialog } from "@/components/lancamentos/BulkEditDialog";
import { FilterPanel, SaldosCard } from "@/components/lancamentos/LancamentosSidebar";
import { LancamentoRow } from "@/components/lancamentos/LancamentoRow";
import { LancamentoCard } from "@/components/lancamentos/LancamentoCard";
import { SummaryCards } from "@/components/lancamentos/SummaryCards";
import { RecurringEditScopeDialog } from "@/components/lancamentos/RecurringEditScopeDialog";
import { DeleteTransactionDialog } from "@/components/lancamentos/DeleteTransactionDialog";
import { CancelTransactionDialog } from "@/components/lancamentos/CancelTransactionDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, ArrowLeftRight,
  Trash2, Pencil, Copy, ChevronLeft, ChevronRight, ChevronDown, Filter, SlidersHorizontal,
  Download, DollarSign, CalendarIcon, CreditCard, HandCoins, X, Settings2, Repeat, Paperclip, Check, Upload, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format, endOfMonth, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDate, parseFlexibleDate } from "@/lib/date-utils";
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
  transaction_type: "entrada" | "saida" | "transferencia";
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
  installment_number: number | null;
  installment_total: number | null;
};

type DisplayRow = {
  id: string;
  description: string;
  amount: number;
  date: string;
  transactionType: "entrada" | "saida" | "transferencia";
  installmentNumber: number | null;
  installmentTotal: number | null;
  categoryName: string | null;
  accountName: string | null;
  paymentMethodName: string | null;
  txStatus: string;
  billStatus: TransactionDisplayStatus;
  amountPaid: number;
  dueDate: string | null;
  paymentDate: string | null;
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

const parseTransactionDate = parseFlexibleDate;

function formatTransactionDate(value: string | null | undefined, pattern: string, placeholder = "—") {
  return formatDate(value, pattern, { placeholder });
}

function computeDisplayStatus(tx: Transaction): TransactionDisplayStatus {
  // Has due_date: check payment
  if (tx.due_date) {
    if (tx.amount_paid >= tx.amount) return "pago";
    const due = parseTransactionDate(tx.due_date, "end");
    if (due && isPast(due)) return "atrasado";
    return "a_vencer";
  }
  // No due_date: use transaction status + date
  if (tx.status === "confirmado") return "pago";
  // Pending without due_date: check if transaction_date is in the past
  const txDate = parseTransactionDate(tx.transaction_date, "end");
  if (txDate && isPast(txDate)) return "atrasado";
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
  const [importOpen, setImportOpen] = useState(false);
  const [dialogInitialType, setDialogInitialType] = useState<"entrada" | "saida" | "transferencia" | undefined>(undefined);
  const [batchCategorizing, setBatchCategorizing] = useState(false);

  const handleBatchCategorize = useCallback(async () => {
    if (batchCategorizing) return;
    setBatchCategorizing(true);
    try {
      const ctx = contextType ?? null;
      const companyId = contextType === "pj" ? selectedCompanyId : null;

      // Camadas 1+2 (determinístico + similaridade)
      const { data, error } = await supabase.rpc("categorize_transactions_batch", {
        p_limit: 500,
        p_min_confidence: 0.7,
        p_context: ctx,
        p_company_id: companyId,
        p_only_uncategorized: true,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const scanned = Number(row?.scanned ?? 0);
      const updated = Number(row?.updated ?? 0);
      const low = Number(row?.skipped_low_confidence ?? 0);
      const none = Number(row?.skipped_no_match ?? 0);

      let aiApplied = 0;
      // Camada 3 (IA em lote) para os que sobraram sem match
      if (none + low > 0) {
        toast.message("Enviando restantes para a IA...", { description: `${none + low} lançamentos` });
        const { data: enq } = await supabase.rpc("enqueue_uncategorized_for_ai", {
          p_limit: 200,
          p_context: ctx,
          p_company_id: companyId,
        });
        const enqueued = Number((Array.isArray(enq) ? enq[0]?.enqueued : (enq as any)?.enqueued) ?? 0);
        if (enqueued > 0) {
          // Processa em rodadas de até 25 até esvaziar (máx 8 rodadas)
          for (let i = 0; i < 8; i++) {
            const { data: res, error: fnErr } = await supabase.functions.invoke("ai-categorize-transactions", {
              body: { batch: 25 },
            });
            if (fnErr) break;
            const applied = Number((res as any)?.applied ?? 0);
            aiApplied += applied;
            if ((res as any)?.empty || Number((res as any)?.processed ?? 0) === 0) break;
          }
        }
      }

      toast.success(`Categorização concluída`, {
        description: `${updated}/${scanned} por regras · ${aiApplied} pela IA · ${none - aiApplied} sem match`,
      });
      if (updated + aiApplied > 0) {
        setSelectedMonth((m) => m);
        window.dispatchEvent(new Event("transactions:refresh"));
      }
    } catch (err: any) {
      toast.error("Erro ao categorizar em lote", { description: err?.message });
    } finally {
      setBatchCategorizing(false);
    }
  }, [batchCategorizing, contextType, selectedCompanyId]);
  const [filterCollapsed, setFilterCollapsed] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<Transaction | null>(null);
  const [editScopePrompt, setEditScopePrompt] = useState<Transaction | null>(null);
  const [editScopeChoice, setEditScopeChoice] = useState<"single" | "forward" | "all">("single");
  const [pendingEditScope, setPendingEditScope] = useState<"single" | "forward" | "all">("single");
  const [paymentTx, setPaymentTx] = useState<Transaction | null>(null);
  const [previewAttachments, setPreviewAttachments] = useState<{ id: string; file_name: string; file_url: string }[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [attachmentCounts, setAttachmentCounts] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("date");
  const [previousBalance, setPreviousBalance] = useState(0);

  // Filters
  const [filterAccount, setFilterAccount] = useState<string[]>([]);
  const [filterCredito, setFilterCredito] = useState(true);
  const [filterDebito, setFilterDebito] = useState(true);
  const [filterTransferencia, setFilterTransferencia] = useState(true);
  const [filterPago, setFilterPago] = useState(true);
  const [filterAVencer, setFilterAVencer] = useState(true);
  const [filterAtrasado, setFilterAtrasado] = useState(true);
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string[]>([]);
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
    return { data: true, dc: true, categoria: true, conta: true, formaPagamento: true, status: true, vencimento: true, pagamento: true, saldo: true };
  });

  useEffect(() => {
    localStorage.setItem("lancamentos_columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (col: string) => {
    setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const visibleOptionalCount = Object.values(visibleColumns).filter(Boolean).length;
  // 1 checkbox + 3 fixed columns (Descrição, Valor, Ações) + optional
  const totalColumns = 4 + visibleOptionalCount;

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteScope, setBulkDeleteScope] = useState<"single" | "forward" | "all">("single");
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  // Clear selection when context/month/filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [contextType, selectedCompanyId, selectedYear, selectedMonth, filterAccount, filterPaymentMethod, filterCategory, filterCredito, filterDebito, filterTransferencia, filterPago, filterAVencer, filterAtrasado]);


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
    if (contextType === "pj" && !selectedCompanyId) { setAccounts([]); }
    else {
      supabase.rpc("get_accessible_accounts", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      }).then(({ data }) => setAccounts((data ?? []).map((a: any) => ({ id: a.id, name: a.name }))));
    }
    if (contextType === "pj" && !selectedCompanyId) { setPaymentMethods([]); }
    else {
      supabase.rpc("get_accessible_payment_methods", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      }).then(({ data }) => setPaymentMethods((data ?? []).map((pm: any) => ({ id: pm.id, name: pm.name }))));
    }
    if (contextType === "pj" && !selectedCompanyId) {
      setCategories([]);
    } else {
      supabase
        .rpc("get_accessible_categories", {
          _context: contextType,
          _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
        })
        .then(({ data }) => setCategories((data ?? []).map((c: any) => ({ id: c.id, name: c.name }))));
    }
  }, [user, contextType, selectedCompanyId]);

  // Fetch transactions (includes bills now via due_date)
  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    if (!isFinancialScopeReady(contextType, user.id, selectedCompanyId)) {
      setTransactions([]); setLoading(false); return;
    }
    setLoading(true);

    const scope = assertFinancialScope({ context: contextType, userId: user.id, companyId: selectedCompanyId });

    // We need transactions that fall in the month by transaction_date OR by due_date
    const q = applyFinancialScope(
      supabase
        .from("transactions")
        .select("id, description, amount, transaction_type, transaction_date, status, category_id, account_id, payment_method_id, due_date, amount_paid, bill_status, payment_date, contact_id, notes, destination_account_id, is_recurring, parent_transaction_id, attachment_url, installment_number, installment_total, categories!fk_transactions_category(name), accounts!fk_transactions_account(name), payment_methods!fk_transactions_payment_method(name)"),
      scope,
    )
      .or(`and(due_date.is.null,transaction_date.gte.${monthStart},transaction_date.lte.${monthEnd}),and(due_date.gte.${monthStart},due_date.lte.${monthEnd})`)
      .order("transaction_date", { ascending: true });

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
    const companyId = contextType === "pj" && selectedCompanyId ? selectedCompanyId : undefined;
    const { data, error } = await supabase.rpc("get_balance_before", {
      _user_id: user.id,
      _context: contextType,
      _company_id: companyId as string,
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

  const refreshAll = useCallback(() => {
    fetchTransactions();
    fetchPreviousBalance();
  }, [fetchTransactions, fetchPreviousBalance]);

  // Sincronização em tempo real — recarrega quando qualquer lançamento
  // (incluindo os criados via recorrência, transferências ou por outro membro)
  // ou conta relacionada é alterado, sem precisar de F5.
  useRealtimeSync({
    tables: ["transactions", "accounts", "categories", "payment_methods"],
    onChange: refreshAll,
    debounceMs: 250,
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteScope, setDeleteScope] = useState<"single" | "forward" | "all">("single");
  const [cancelStatusId, setCancelStatusId] = useState<string | null>(null);

  const deletingTx = deleteId ? transactions.find((t) => t.id === deleteId) : null;
  const isPartOfRecurringSeries = !!(deletingTx && (deletingTx.is_recurring || deletingTx.parent_transaction_id));

  const confirmDelete = async () => {
    if (!deleteId || !deletingTx) return;
    const tx = deletingTx;
    const seriesParentId = tx.parent_transaction_id ?? tx.id;
    const scope = isPartOfRecurringSeries ? deleteScope : "single";

    try {
      if (scope === "all") {
        // Delete all children + the parent
        const { error: cErr } = await supabase
          .from("transactions")
          .delete()
          .eq("parent_transaction_id", seriesParentId);
        if (cErr) throw cErr;
        const { error: pErr } = await supabase
          .from("transactions")
          .delete()
          .eq("id", seriesParentId);
        if (pErr) throw pErr;
      } else if (scope === "forward") {
        // Delete future children of the series with date >= clicked tx date
        const { error: cErr } = await supabase
          .from("transactions")
          .delete()
          .eq("parent_transaction_id", seriesParentId)
          .gte("transaction_date", tx.transaction_date);
        if (cErr) throw cErr;
        // Delete the clicked transaction itself (could be the parent or a child)
        const { error: sErr } = await supabase
          .from("transactions")
          .delete()
          .eq("id", tx.id);
        if (sErr) throw sErr;
      } else {
        // single
        const { error } = await supabase.from("transactions").delete().eq("id", deleteId);
        if (error) throw error;
      }

      await supabase.rpc("insert_audit_log", {
        _action: "transaction_deleted",
        _entity_type: "transaction",
        _entity_id: deleteId,
        _details: { target_name: tx?.description || "—", delete_scope: scope },
      });

      const successMsg =
        scope === "all"
          ? "Série de lançamentos excluída"
          : scope === "forward"
            ? "Lançamento e ocorrências futuras excluídos"
            : "Lançamento excluído";
      toast.success(successMsg);
      refreshAll();
    } catch (err: any) {
      toast.error("Erro ao excluir", { description: err?.message });
    }

    setDeleteId(null);
    setDeleteScope("single");
  };

  // Bulk actions
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTxs = transactions.filter((t) => selectedIds.has(t.id));
  const bulkHasRecurring = selectedTxs.some((t) => t.is_recurring || !!t.parent_transaction_id);

  const confirmBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const scope = bulkHasRecurring ? bulkDeleteScope : "single";

    try {
      if (scope === "single") {
        const { error } = await supabase.from("transactions").delete().in("id", ids);
        if (error) throw error;
      } else if (scope === "all") {
        const recurringSel = selectedTxs.filter((t) => t.is_recurring || !!t.parent_transaction_id);
        const nonRecurringIds = selectedTxs
          .filter((t) => !t.is_recurring && !t.parent_transaction_id)
          .map((t) => t.id);
        const seriesParentIds = Array.from(
          new Set(recurringSel.map((t) => t.parent_transaction_id ?? t.id)),
        );
        if (seriesParentIds.length > 0) {
          const { error: cErr } = await supabase
            .from("transactions")
            .delete()
            .in("parent_transaction_id", seriesParentIds);
          if (cErr) throw cErr;
          const { error: pErr } = await supabase
            .from("transactions")
            .delete()
            .in("id", seriesParentIds);
          if (pErr) throw pErr;
        }
        if (nonRecurringIds.length > 0) {
          const { error } = await supabase.from("transactions").delete().in("id", nonRecurringIds);
          if (error) throw error;
        }
      } else {
        // forward
        const recurringSel = selectedTxs.filter((t) => t.is_recurring || !!t.parent_transaction_id);
        const nonRecurringIds = selectedTxs
          .filter((t) => !t.is_recurring && !t.parent_transaction_id)
          .map((t) => t.id);
        // For each series, take the earliest selected date as the cutoff
        const seriesMap = new Map<string, string>();
        recurringSel.forEach((t) => {
          const pid = t.parent_transaction_id ?? t.id;
          const existing = seriesMap.get(pid);
          if (!existing || t.transaction_date < existing) seriesMap.set(pid, t.transaction_date);
        });
        for (const [pid, fromDate] of seriesMap.entries()) {
          const { error: cErr } = await supabase
            .from("transactions")
            .delete()
            .eq("parent_transaction_id", pid)
            .gte("transaction_date", fromDate);
          if (cErr) throw cErr;
        }
        // Delete the selected recurring transactions themselves (parents or children)
        const recurringIds = recurringSel.map((t) => t.id);
        if (recurringIds.length > 0) {
          const { error } = await supabase.from("transactions").delete().in("id", recurringIds);
          if (error) throw error;
        }
        if (nonRecurringIds.length > 0) {
          const { error } = await supabase.from("transactions").delete().in("id", nonRecurringIds);
          if (error) throw error;
        }
      }

      await supabase.rpc("insert_audit_log", {
        _action: "transactions_bulk_deleted",
        _entity_type: "transaction",
        _entity_id: undefined,
        _details: { count: ids.length, ids, delete_scope: scope },
      });

      const successMsg =
        scope === "all"
          ? `Séries excluídas (${ids.length} selecionado(s))`
          : scope === "forward"
            ? `${ids.length} selecionado(s) + ocorrências futuras excluídos`
            : `${ids.length} lançamento(s) excluído(s)`;
      toast.success(successMsg);
      clearSelection();
      refreshAll();
    } catch (err: any) {
      toast.error("Erro ao excluir lançamentos", { description: err?.message });
    }

    setBulkDeleteOpen(false);
    setBulkDeleteScope("single");
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
      const eff = t.transaction_type;
      if (eff === "entrada" && !filterCredito) return;
      if (eff === "saida" && !filterDebito) return;
      if (eff === "transferencia" && !filterTransferencia) return;
      if (filterAccount.length > 0 && !filterAccount.includes(t.account_id)) return;
      if (filterPaymentMethod.length > 0 && (!t.payment_method_id || !filterPaymentMethod.includes(t.payment_method_id))) return;
      if (filterCategory !== "all" && t.category_id !== filterCategory) return;

      // Guarda: mês atual deve considerar due_date quando existe, senão transaction_date
      const refDate = t.due_date ?? t.transaction_date;
      if (refDate < monthStart || refDate > monthEnd) return;

      const computed = computeDisplayStatus(t);

      // Status filter
      if (computed === "pago" && !filterPago) return;
      if (computed === "a_vencer" && !filterAVencer) return;
      if (computed === "atrasado" && !filterAtrasado) return;

      // Date range filter for due_date
      if (t.due_date) {
        const dueD = parseTransactionDate(t.due_date);
        if (!dueD) return;
        if (dateFrom) {
          if (dueD < dateFrom) return;
        }
        if (dateTo) {
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
        paymentDate: t.payment_date,
        runningBalance: 0,
        hasDueDate: !!t.due_date,
        isRecurring: t.is_recurring,
        isRecurrenceChild: !!t.parent_transaction_id,
        attachmentCount: attachmentCounts.get(t.id) || 0,
        installmentNumber: t.installment_number,
        installmentTotal: t.installment_total,
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
        if (r.transactionType === "entrada") running += r.amount;
        else if (r.transactionType === "saida") running -= r.amount;
      }
      r.runningBalance = running;
    });

    return rows;
  }, [transactions, search, filterCredito, filterDebito, filterTransferencia, filterPago, filterAVencer, filterAtrasado, filterAccount, filterPaymentMethod, filterCategory, dateFrom, dateTo, sortBy, previousBalance, monthStart, monthEnd]);

  // Totals
  const totals = useMemo(() => {
    const effectiveRows = displayRows.filter((r) => r.txStatus === "confirmado" || (r.hasDueDate && r.amountPaid >= r.amount));
    const receitas = effectiveRows.filter((r) => r.transactionType === "entrada").reduce((s, r) => s + r.amount, 0);
    const despesas = effectiveRows.filter((r) => r.transactionType === "saida").reduce((s, r) => s + r.amount, 0);

    const pending = displayRows.filter((r) => r.billStatus !== "pago");
    const aPagar = pending.filter((r) => r.transactionType === "saida").reduce((s, r) => s + r.amount - r.amountPaid, 0);
    const aReceber = pending.filter((r) => r.transactionType === "entrada").reduce((s, r) => s + r.amount - r.amountPaid, 0);
    const atrasadas = displayRows.filter((r) => r.billStatus === "atrasado").length;

    const allReceitas = displayRows.filter((r) => r.transactionType === "entrada").reduce((s, r) => s + r.amount, 0);
    const allDespesas = displayRows.filter((r) => r.transactionType === "saida").reduce((s, r) => s + r.amount, 0);
    const saldoPeriodo = allReceitas - allDespesas;
    const saldoAcumulado = previousBalance + saldoPeriodo;

    return { receitas, despesas, aPagar, aReceber, atrasadas, allReceitas, allDespesas, saldoPeriodo, saldoAcumulado };
  }, [displayRows, previousBalance]);

  const formatBRL = maskBRL;

  const exportCSV = () => {
    const headers = ["Data", "Descrição", "Tipo", "Valor", "Status", "Vencimento", "Valor Pago", "Categoria", "Conta", "Forma Pgto", "Saldo"];
    const csvRows = displayRows.map((r) => [
      formatTransactionDate(r.date, "dd/MM/yyyy", ""),
      `"${r.description.replace(/"/g, '""')}"`,
      r.transactionType === "entrada" ? "Entrada" : r.transactionType === "saida" ? "Saída" : "Transferência",
      r.amount.toFixed(2).replace(".", ","),
      displayStatusConfig[r.billStatus].label,
      formatTransactionDate(r.dueDate, "dd/MM/yyyy", ""),
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
    setFilterAccount([]);
    setFilterPaymentMethod([]);
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

  const filterPanelProps = {
    accounts, paymentMethods, categories,
    filterAccount, setFilterAccount,
    filterPaymentMethod, setFilterPaymentMethod,
    filterCategory, setFilterCategory,
    filterCredito, setFilterCredito,
    filterDebito, setFilterDebito,
    filterTransferencia, setFilterTransferencia,
    filterPago, setFilterPago,
    filterAVencer, setFilterAVencer,
    filterAtrasado, setFilterAtrasado,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    clearFilters,
  };


  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => { setEditTransaction(null); setDuplicateSource(null); setDialogInitialType(undefined); setDialogOpen(true); }} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Lançamento
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setEditTransaction(null); setDuplicateSource(null); setDialogInitialType("transferencia"); setDialogOpen(true); }}>
            <ArrowLeftRight className="h-4 w-4 mr-1" /> Transferência
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={displayRows.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Importar Extrato
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBatchCategorize}
            disabled={batchCategorizing}
            title="Categorizar automaticamente lançamentos sem categoria"
          >
            <Sparkles className="h-4 w-4 mr-1" />
            {batchCategorizing ? "Categorizando..." : "Auto-categorizar"}
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
                  { key: "pagamento", label: "Data Pagamento", fixed: false },
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
        <div className="flex items-center gap-2 flex-wrap">
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
                  <FilterPanel {...filterPanelProps} />
                  <SaldosCard
                    previousBalance={previousBalance}
                    saldoPeriodo={totals.saldoPeriodo}
                    saldoAcumulado={totals.saldoAcumulado}
                    dates={saldoDates}
                    formatBRL={formatBRL}
                  />

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
      <SummaryCards totals={totals} formatBRL={formatBRL} />

      {/* Main content grid */}
      <div className={`gap-3 ${isMobile ? "" : "grid grid-cols-[1fr_185px]"}`}>
        <Card className="shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : isMobile ? (
            <div className="p-2 space-y-2">
              {displayRows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhum registro neste mês
                </div>
              ) : (
                displayRows.map((r) => (
                  <LancamentoCard
                    key={r.id}
                    row={r}
                    isSelected={selectedIds.has(r.id)}
                    formatBRL={formatBRL}
                    callbacks={{
                      onToggleSelected: toggleSelected,
                      onOpenAttachments: (attachments) => {
                        setPreviewAttachments(attachments);
                        setPreviewOpen(true);
                      },
                      onUpdateStatus: updateTransactionStatus,
                      onRequestCancelStatus: setCancelStatusId,
                      onRegisterPayment: setPaymentTx,
                      onEdit: (tx) => {
                        setDialogInitialType(undefined);
                        if (tx.is_recurring || tx.parent_transaction_id) {
                          setEditScopeChoice("single");
                          setEditScopePrompt(tx);
                        } else {
                          setPendingEditScope("single");
                          setEditTransaction(tx);
                          setDialogOpen(true);
                        }
                      },
                      onDuplicate: (tx) => {
                        setEditTransaction(null);
                        setDialogInitialType(undefined);
                        setDuplicateSource({
                          id: "",
                          description: `${tx.description} (cópia)`,
                          amount: tx.amount,
                          transaction_type: tx.transaction_type,
                          transaction_date: tx.transaction_date,
                          due_date: tx.due_date ?? null,
                          account_id: tx.account_id,
                          destination_account_id: tx.destination_account_id ?? null,
                          category_id: tx.category_id ?? null,
                          contact_id: tx.contact_id ?? null,
                          payment_method_id: tx.payment_method_id ?? null,
                          notes: tx.notes ?? null,
                          status: "pendente",
                          amount_paid: 0,
                          payment_date: null,
                          is_recurring: false,
                          parent_transaction_id: null,
                          attachment_url: null,
                        } as Transaction);
                        setDialogOpen(true);
                      },
                      onRequestDelete: setDeleteId,
                    }}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[36px] px-2">
                      <Checkbox
                        checked={displayRows.length > 0 && displayRows.every((r) => selectedIds.has(r.id))}
                        onCheckedChange={(v) => {
                          if (v) setSelectedIds(new Set(displayRows.map((r) => r.id)));
                          else clearSelection();
                        }}
                        aria-label="Selecionar todos"
                      />
                    </TableHead>
                    {visibleColumns.data !== false && <TableHead className="text-xs w-[75px]">Data</TableHead>}
                    <TableHead className="text-xs">Descrição</TableHead>
                    {visibleColumns.dc && <TableHead className="text-xs w-[40px] text-center">D/C</TableHead>}
                    {visibleColumns.categoria && <TableHead className="text-xs w-[110px]">Categoria</TableHead>}
                    {visibleColumns.conta && <TableHead className="text-xs w-[110px]">Conta</TableHead>}
                    {visibleColumns.formaPagamento && <TableHead className="text-xs w-[100px]">Forma Pgto</TableHead>}
                    <TableHead className="text-xs w-[110px] text-right">Valor</TableHead>
                    {visibleColumns.status && <TableHead className="text-xs w-[85px]">Status</TableHead>}
                    {visibleColumns.vencimento && <TableHead className="text-xs w-[75px]">Vencimento</TableHead>}
                    {visibleColumns.pagamento && <TableHead className="text-xs w-[80px]">Pagamento</TableHead>}
                    {visibleColumns.saldo && <TableHead className="text-xs w-[115px] text-right">Saldo</TableHead>}
                    <TableHead className="text-xs w-[90px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell className="py-2 px-2" />
                    <TableCell colSpan={totalColumns - (visibleColumns.saldo ? 3 : 2)} className="text-xs py-2">
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
                    displayRows.map((r) => (
                      <LancamentoRow
                        key={r.id}
                        row={r}
                        isSelected={selectedIds.has(r.id)}
                        visibleColumns={visibleColumns}
                        formatBRL={formatBRL}
                        callbacks={{
                          onToggleSelected: toggleSelected,
                          onOpenAttachments: (attachments) => {
                            setPreviewAttachments(attachments);
                            setPreviewOpen(true);
                          },
                          onUpdateStatus: updateTransactionStatus,
                          onRequestCancelStatus: setCancelStatusId,
                          onRegisterPayment: setPaymentTx,
                          onEdit: (tx) => {
                            setDialogInitialType(undefined);
                            if (tx.is_recurring || tx.parent_transaction_id) {
                              setEditScopeChoice("single");
                              setEditScopePrompt(tx);
                            } else {
                              setPendingEditScope("single");
                              setEditTransaction(tx);
                              setDialogOpen(true);
                            }
                          },
                          onDuplicate: (tx) => {
                            setEditTransaction(null);
                            setDialogInitialType(undefined);
                            // Regra de duplicação:
                            // COPIA (classificação/identificação do lançamento):
                            //   description (+ " (cópia)"), amount, transaction_type,
                            //   transaction_date, due_date, account_id, destination_account_id,
                            //   category_id, contact_id, payment_method_id, notes.
                            // NÃO COPIA (estado de execução — sempre reiniciado):
                            //   status → "pendente", amount_paid → 0, payment_date → null,
                            //   is_recurring/recurrence_* → false/null (duplicata é sempre 1 lançamento único),
                            //   parent_transaction_id → null (nunca herda vínculo de série),
                            //   anexos (attachment_url e transaction_attachments) → não copiados.
                            setDuplicateSource({
                              id: "",
                              description: `${tx.description} (cópia)`,
                              amount: tx.amount,
                              transaction_type: tx.transaction_type,
                              transaction_date: tx.transaction_date,
                              due_date: tx.due_date ?? null,
                              account_id: tx.account_id,
                              destination_account_id: tx.destination_account_id ?? null,
                              category_id: tx.category_id ?? null,
                              contact_id: tx.contact_id ?? null,
                              payment_method_id: tx.payment_method_id ?? null,
                              notes: tx.notes ?? null,
                              status: "pendente",
                              amount_paid: 0,
                              payment_date: null,
                              is_recurring: false,
                              parent_transaction_id: null,
                              attachment_url: null,
                            } as Transaction);
                            setDialogOpen(true);
                          },
                          onRequestDelete: setDeleteId,
                        }}
                      />
                    ))
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
                <FilterPanel {...filterPanelProps} />
              </CardContent>
            </Card>
            <SaldosCard
              previousBalance={previousBalance}
              saldoPeriodo={totals.saldoPeriodo}
              saldoAcumulado={totals.saldoAcumulado}
              dates={saldoDates}
              formatBRL={formatBRL}
            />
          </div>
        )}
      </div>

      {/* FAB mobile */}
      <button
        onClick={() => { setEditTransaction(null); setDuplicateSource(null); setDialogInitialType(undefined); setDialogOpen(true); }}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setDuplicateSource(null); }}
        onCreated={refreshAll}
        transaction={editTransaction}
        initialType={dialogInitialType}
        editScope={pendingEditScope}
        duplicateSource={duplicateSource}
      />


      {importOpen && (
        <Suspense fallback={null}>
          <ImportStatementDialog open={importOpen} onOpenChange={setImportOpen} onImported={refreshAll} />
        </Suspense>
      )}

      {/* Recurring edit scope prompt */}
      <RecurringEditScopeDialog
        open={!!editScopePrompt}
        value={editScopeChoice}
        onValueChange={setEditScopeChoice}
        onCancel={() => { setEditScopePrompt(null); setEditScopeChoice("single"); }}
        onConfirm={() => {
          const tx = editScopePrompt;
          if (!tx) return;
          setPendingEditScope(editScopeChoice);
          setEditTransaction(tx);
          setEditScopePrompt(null);
          setDialogOpen(true);
        }}
      />

      <PaymentDialog
        open={!!paymentTx}
        onOpenChange={(open) => { if (!open) setPaymentTx(null); }}
        bill={paymentTx ? {
          id: paymentTx.id,
          description: paymentTx.description,
          amount: paymentTx.amount,
          amount_paid: paymentTx.amount_paid,
          transaction_type: paymentTx.transaction_type as "entrada" | "saida",
          account_id: paymentTx.account_id,
          category_id: paymentTx.category_id,
          contact_id: paymentTx.contact_id,
        } : null}
        onPaid={refreshAll}
      />

      <DeleteTransactionDialog
        open={!!deleteId}
        isRecurring={isPartOfRecurringSeries}
        scope={deleteScope}
        onScopeChange={setDeleteScope}
        onCancel={() => { setDeleteId(null); setDeleteScope("single"); }}
        onConfirm={confirmDelete}
      />


      <CancelTransactionDialog
        open={!!cancelStatusId}
        onCancel={() => setCancelStatusId(null)}
        onConfirm={() => { if (cancelStatusId) { updateTransactionStatus(cancelStatusId, "cancelado"); setCancelStatusId(null); } }}
      />


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

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-card border border-border shadow-lg rounded-lg px-4 py-2 flex items-center gap-3">
          <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            <X className="h-4 w-4 mr-1" />Limpar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBulkEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" />Editar
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" />Excluir
          </Button>
        </div>
      )}

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(o) => { setBulkDeleteOpen(o); if (!o) setBulkDeleteScope("single"); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} lançamento(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkHasRecurring
                ? "Há lançamentos recorrentes entre os selecionados. Escolha o que deseja excluir:"
                : "Essa ação não pode ser desfeita. Todos os registros selecionados serão removidos permanentemente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkHasRecurring && (
            <RadioGroup value={bulkDeleteScope} onValueChange={(v) => setBulkDeleteScope(v as any)} className="gap-2 px-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="bulk-scope-single" />
                <label htmlFor="bulk-scope-single" className="text-sm cursor-pointer">Excluir apenas os selecionados</label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="forward" id="bulk-scope-forward" />
                <label htmlFor="bulk-scope-forward" className="text-sm cursor-pointer">Excluir os selecionados e as ocorrências futuras</label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="bulk-scope-all" />
                <label htmlFor="bulk-scope-all" className="text-sm cursor-pointer">Excluir todas as ocorrências da série (passadas e futuras)</label>
              </div>
            </RadioGroup>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk edit dialog */}
      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        count={selectedIds.size}
        accounts={accounts}
        paymentMethods={paymentMethods}
        categories={categories}
        onApply={async (updates) => {
          const ids = Array.from(selectedIds);
          if (ids.length === 0) return;
          const { error } = await supabase.from("transactions").update(updates as any).in("id", ids);
          if (error) {
            toast.error("Erro ao atualizar lançamentos", { description: error.message });
          } else {
            await supabase.rpc("insert_audit_log", {
              _action: "transactions_bulk_updated",
              _entity_type: "transaction",
              _entity_id: undefined,
              _details: { count: ids.length, fields: Object.keys(updates) },
            });
            toast.success(`${ids.length} lançamento(s) atualizado(s)`);
            clearSelection();
            refreshAll();
            setBulkEditOpen(false);
          }
        }}
      />
    </div>
  );
}

