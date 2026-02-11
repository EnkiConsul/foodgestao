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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TransactionFormDialog } from "@/components/transactions/TransactionFormDialog";
import {
  Plus, Search, TrendingUp, TrendingDown, ArrowLeftRight,
  Trash2, Pencil, ChevronLeft, ChevronRight, Filter, SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ptBR } from "date-fns/locale";

type Transaction = {
  id: string;
  description: string;
  amount: number;
  transaction_type: "receita" | "despesa" | "transferencia";
  transaction_date: string;
  status: string;
  category_id: string | null;
  account_id: string;
  categories: { name: string } | null;
  accounts: { name: string } | null;
};

type Account = { id: string; name: string };

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

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
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
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

  const monthStart = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth, 1);
    return format(d, "yyyy-MM-dd");
  }, [selectedYear, selectedMonth]);

  const monthEnd = useMemo(() => {
    const d = endOfMonth(new Date(selectedYear, selectedMonth, 1));
    return format(d, "yyyy-MM-dd");
  }, [selectedYear, selectedMonth]);

  // Fetch accounts
  useEffect(() => {
    if (!user) return;
    let q = supabase.from("accounts").select("id, name").eq("user_id", user.id).eq("is_active", true).eq("context", contextType);
    if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);
    q.then(({ data }) => setAccounts(data ?? []));
  }, [user, contextType, selectedCompanyId]);

  // Fetch transactions for selected month
  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let q = supabase
      .from("transactions")
      .select("id, description, amount, transaction_type, transaction_date, status, category_id, account_id, categories(name), accounts!transactions_account_id_fkey(name)")
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

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("transactions").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir");
    else {
      toast.success("Lançamento excluído");
      fetchTransactions();
      fetchPreviousBalance();
    }
    setDeleteId(null);
  };

  // Apply filters & search
  const filtered = useMemo(() => {
    let list = transactions.filter((t) => {
      if (!search || t.description.toLowerCase().includes(search.toLowerCase())) {
        // type filter
        if (t.transaction_type === "receita" && !filterCredito) return false;
        if (t.transaction_type === "despesa" && !filterDebito) return false;
        if (t.transaction_type === "transferencia" && !filterTransferencia) return false;
        // status filter
        if (t.status === "confirmado" && !filterRealizado) return false;
        if (t.status === "pendente" && !filterPendente) return false;
        // account filter
        if (filterAccount !== "all" && t.account_id !== filterAccount) return false;
        return true;
      }
      return false;
    });

    // Sort
    if (sortBy === "date") list.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    else if (sortBy === "value") list.sort((a, b) => b.amount - a.amount);
    else if (sortBy === "description") list.sort((a, b) => a.description.localeCompare(b.description));

    return list;
  }, [transactions, search, filterCredito, filterDebito, filterTransferencia, filterRealizado, filterPendente, filterAccount, sortBy]);

  // Totals
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, t) => {
        if (t.transaction_type === "receita") acc.receitas += t.amount;
        else if (t.transaction_type === "despesa") acc.despesas += t.amount;
        return acc;
      },
      { receitas: 0, despesas: 0 }
    );
  }, [filtered]);

  // Running balance per row
  const rowsWithBalance = useMemo(() => {
    let running = previousBalance;
    return filtered.map((t) => {
      if (t.transaction_type === "receita") running += t.amount;
      else if (t.transaction_type === "despesa") running -= t.amount;
      return { ...t, runningBalance: running };
    });
  }, [filtered, previousBalance]);

  const formatBRL = maskBRL;

  const clearFilters = () => {
    setFilterAccount("all");
    setFilterCredito(true);
    setFilterDebito(true);
    setFilterTransferencia(true);
    setFilterRealizado(true);
    setFilterPendente(true);
  };

  const FilterPanel = () => (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conta</label>
        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="mt-1.5">
            <SelectValue placeholder="Todas as contas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as contas</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
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
            <Checkbox checked={filterRealizado} onCheckedChange={(v) => setFilterRealizado(!!v)} />
            Realizado
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={filterPendente} onCheckedChange={(v) => setFilterPendente(!!v)} />
            Pendente
          </label>
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
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setEditTransaction(null); setDialogOpen(true); }}>
            <ArrowLeftRight className="h-4 w-4 mr-1" /> Transferência
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
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 w-[160px] text-xs"
              maxLength={100}
            />
          </div>
          {isMobile && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <Filter className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px]">
                <SheetHeader>
                  <SheetTitle>Filtro Rápido</SheetTitle>
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
      <div className="grid grid-cols-3 gap-3">
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
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p className={`text-sm font-bold ${totals.receitas - totals.despesas >= 0 ? "text-success" : "text-destructive"}`}>
              {formatBRL(totals.receitas - totals.despesas)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main content grid */}
      <div className={`gap-4 ${isMobile ? "" : "grid grid-cols-[1fr_260px]"}`}>
        {/* Table */}
        <Card className="shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs w-[90px]">Data</TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="text-xs w-[40px] text-center">D/C</TableHead>
                  <TableHead className="text-xs w-[110px] text-right">Valor</TableHead>
                  <TableHead className="text-xs w-[110px] text-right">Saldo</TableHead>
                  <TableHead className="text-xs w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Previous balance row */}
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell colSpan={4} className="text-xs py-2">
                    SALDO ANTERIOR REALIZADO
                  </TableCell>
                  <TableCell className={`text-xs text-right py-2 ${previousBalance >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatBRL(previousBalance)}
                  </TableCell>
                  <TableCell className="py-2" />
                </TableRow>

                {rowsWithBalance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                      Nenhum lançamento neste mês
                    </TableCell>
                  </TableRow>
                ) : (
                  rowsWithBalance.map((t) => {
                    const isReceita = t.transaction_type === "receita";
                    const isDespesa = t.transaction_type === "despesa";
                    const isTransf = t.transaction_type === "transferencia";
                    return (
                      <TableRow key={t.id} className="group">
                        <TableCell className="text-xs py-2">
                          {format(new Date(t.transaction_date + "T12:00:00"), "dd/MM", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <div className="truncate max-w-[200px]">{t.description}</div>
                          {t.categories?.name && (
                            <span className="text-[10px] text-muted-foreground">{t.categories.name}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center py-2">
                          {isReceita && <span className="text-xs font-bold text-success">C</span>}
                          {isDespesa && <span className="text-xs font-bold text-destructive">D</span>}
                          {isTransf && <span className="text-xs font-bold text-primary">T</span>}
                        </TableCell>
                        <TableCell className={`text-xs text-right py-2 font-medium ${isReceita ? "text-success" : isDespesa ? "text-destructive" : "text-foreground"}`}>
                          {formatBRL(t.amount)}
                        </TableCell>
                        <TableCell className={`text-xs text-right py-2 font-medium ${t.runningBalance >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatBRL(t.runningBalance)}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditTransaction(t); setDialogOpen(true); }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteId(t.id)}
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
          )}
        </Card>

        {/* Filter sidebar (desktop) */}
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
        onCreated={() => { fetchTransactions(); fetchPreviousBalance(); }}
        transaction={editTransaction}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O lançamento será removido permanentemente.
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
