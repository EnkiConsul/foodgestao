import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TransactionFormDialog } from "@/components/transactions/TransactionFormDialog";
import { Plus, Search, TrendingUp, TrendingDown, ArrowLeftRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
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

const typeConfig = {
  receita: { label: "Receita", icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
  despesa: { label: "Despesa", icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10" },
  transferencia: { label: "Transferência", icon: ArrowLeftRight, color: "text-primary", bg: "bg-primary/10" },
};

export default function Lancamentos() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const query = supabase
      .from("transactions")
      .select("id, description, amount, transaction_type, transaction_date, status, category_id, account_id, categories(name), accounts!transactions_account_id_fkey(name)")
      .eq("user_id", user.id)
      .order("transaction_date", { ascending: false })
      .limit(100);

    const { data, error } = await query;
    if (error) {
      toast.error("Erro ao carregar lançamentos");
    } else {
      setTransactions((data as unknown as Transaction[]) ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else {
      toast.success("Lançamento excluído");
      fetchTransactions();
    }
  };

  const filtered = transactions.filter((t) => {
    const matchesSearch = !search || t.description.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || t.transaction_type === filterType;
    return matchesSearch && matchesType;
  });

  const totals = filtered.reduce(
    (acc, t) => {
      if (t.transaction_type === "receita") acc.receitas += t.amount;
      else if (t.transaction_type === "despesa") acc.despesas += t.amount;
      return acc;
    },
    { receitas: 0, despesas: 0 }
  );

  const formatBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lançamentos</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas receitas e despesas</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="hidden md:flex">
          <Plus className="h-4 w-4 mr-2" /> Novo Lançamento
        </Button>
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

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lançamento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            maxLength={100}
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="receita">Receitas</SelectItem>
            <SelectItem value="despesa">Despesas</SelectItem>
            <SelectItem value="transferencia">Transferências</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transaction list */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
              <ArrowLeftRight className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Nenhum lançamento encontrado</p>
              <Button variant="link" onClick={() => setDialogOpen(true)} className="mt-2">
                Criar primeiro lançamento
              </Button>
            </CardContent>
          </Card>
        ) : (
          filtered.map((t) => {
            const config = typeConfig[t.transaction_type];
            const Icon = config.icon;
            return (
              <Card key={t.id} className="shadow-sm hover:shadow transition-shadow">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(t.transaction_date + "T12:00:00"), "dd MMM yyyy", { locale: ptBR })}
                      </span>
                      {t.categories?.name && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {t.categories.name}
                        </Badge>
                      )}
                      {t.accounts?.name && (
                        <span className="text-[10px] text-muted-foreground">{t.accounts.name}</span>
                      )}
                    </div>
                  </div>
                  <p className={`text-sm font-semibold whitespace-nowrap ${config.color}`}>
                    {t.transaction_type === "despesa" ? "- " : t.transaction_type === "receita" ? "+ " : ""}
                    {formatBRL(t.amount)}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleDelete(t.id)}
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

      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={fetchTransactions}
      />
    </div>
  );
}
