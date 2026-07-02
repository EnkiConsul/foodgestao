import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { usePrivacy } from "@/hooks/usePrivacy";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AccountFormDialog } from "@/components/accounts/AccountFormDialog";
import { BankLogo } from "@/components/accounts/BankLogo";
import { Plus, Search, Landmark, Pencil, Trash2, Wallet, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AccountType = Database["public"]["Enums"]["account_type"];
type Account = Database["public"]["Tables"]["accounts"]["Row"];

const accountTypeLabels: Record<AccountType, string> = {
  corrente: "Corrente",
  poupanca: "Poupança",
  investimento: "Investimento",
  cartao_credito: "Cartão de Crédito",
  dinheiro: "Dinheiro",
  outro: "Outro",
};

export default function ContasBancarias() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId, companies } = useCompanyContext();
  const { maskBRL } = usePrivacy();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [staleBalance, setStaleBalance] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [lastTxAt, setLastTxAt] = useState<number>(0);
  const [lastAccountAt, setLastAccountAt] = useState<number>(0);

  const fetchAccounts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    if (contextType === "pj" && !selectedCompanyId) {
      setAccounts([]); setLoading(false); return;
    }
    const { data, error } = await supabase.rpc("get_accessible_accounts", {
      _context: contextType,
      _company_id: contextType === "pj" ? selectedCompanyId : null,
      _include_inactive: true,
    });
    if (error) toast.error("Erro ao carregar contas bancárias");
    else setAccounts((data ?? []) as any);
    setLoading(false);
  }, [user, contextType, selectedCompanyId]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // Reset detector quando muda o perfil de acesso
  useEffect(() => {
    setStaleBalance(false);
    setLastTxAt(0);
    setLastAccountAt(0);
  }, [contextType, selectedCompanyId]);

  // Realtime: acompanhamos separadamente eventos de `transactions` e `accounts`.
  // Se uma tx chega e nenhum update em `accounts` acontece em 6s, marcamos
  // como inconsistente (trigger de saldo pode ter falhado ou realtime atrasou).
  useRealtimeSync({
    tables: ["accounts"],
    onChange: () => { setLastAccountAt(Date.now()); fetchAccounts(); },
  });
  useRealtimeSync({
    tables: ["transactions"],
    onChange: () => { setLastTxAt(Date.now()); fetchAccounts(); },
  });

  useEffect(() => {
    if (!lastTxAt) return;
    if (lastAccountAt >= lastTxAt) { setStaleBalance(false); return; }
    const timer = setTimeout(() => {
      if (lastAccountAt < lastTxAt) setStaleBalance(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, [lastTxAt, lastAccountAt]);

  const handleResync = useCallback(async () => {
    setResyncing(true);
    const { error } = await supabase.rpc("recompute_all_account_balances");
    setResyncing(false);
    if (error) { toast.error("Erro ao recalcular saldos"); return; }
    toast.success("Saldos recalculados");
    setStaleBalance(false);
    setLastAccountAt(Date.now());
    fetchAccounts();
  }, [fetchAccounts]);

  const handleDelete = async () => {
    if (!deleteAccount) return;
    const deletedName = deleteAccount.name;
    const { error } = await supabase.from("accounts").delete().eq("id", deleteAccount.id);
    if (error) toast.error("Erro ao excluir conta");
    else {
      await supabase.rpc("insert_audit_log", {
        _action: "account_deleted",
        _entity_type: "account",
        _entity_id: deleteAccount.id,
        _details: { target_name: deletedName },
      });
      toast.success("Conta excluída"); fetchAccounts();
    }
    setDeleteAccount(null);
  };

  const handleToggleActive = async (account: Account) => {
    const { error } = await supabase
      .from("accounts")
      .update({ is_active: !account.is_active })
      .eq("id", account.id);
    if (error) toast.error("Erro ao atualizar status");
    else fetchAccounts();
  };

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === "all" || a.account_type === filterType;
      return matchSearch && matchType;
    });
  }, [accounts, search, filterType]);

  const totals = useMemo(() => {
    const active = accounts.filter((a) => a.is_active);
    const saldoTotal = active.reduce((s, a) => s + Number(a.current_balance), 0);
    return { saldoTotal, activeCount: active.length };
  }, [accounts]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contas Bancárias</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas contas e saldos</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const { error } = await supabase.rpc("recompute_all_account_balances");
              if (error) toast.error("Erro ao recalcular saldos");
              else { toast.success("Saldos recalculados"); fetchAccounts(); }
            }}
            className="hidden md:flex"
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Recalcular saldos
          </Button>
          <Button onClick={() => { setEditAccount(null); setDialogOpen(true); }} className="hidden md:flex">
            <Plus className="h-4 w-4 mr-2" /> Nova Conta
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-primary text-primary-foreground shadow-md border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs opacity-80">Saldo Total</p>
              <p className="text-lg font-bold">{maskBRL(totals.saldoTotal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted shadow-md border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Landmark className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contas Ativas</p>
              <p className="text-lg font-bold text-foreground">{totals.activeCount}</p>
            </div>
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
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(accountTypeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Account list */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
              <Landmark className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Nenhuma conta bancária encontrada</p>
              <Button variant="link" onClick={() => { setEditAccount(null); setDialogOpen(true); }} className="mt-2">
                Criar primeira conta
              </Button>
            </CardContent>
          </Card>
        ) : (
          filtered.map((a) => (
            <Card
              key={a.id}
              className={`shadow-sm hover:shadow-md transition-shadow border-l-4 ${!a.is_active ? "opacity-60" : ""}`}
              style={{ borderLeftColor: a.color || "hsl(var(--primary))" }}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <BankLogo
                  slug={(a as typeof a & { bank_slug?: string | null }).bank_slug}
                  fallbackName={a.name}
                  size={40}
                  fallbackColor={a.color || undefined}
                  className="shrink-0"
                />



                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{a.name}</p>
                    <Badge className="text-[10px] h-4 px-1.5 shrink-0 bg-primary/10 text-primary border-0 hover:bg-primary/15">
                      {accountTypeLabels[a.account_type]}
                    </Badge>
                    {!a.is_active && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">Inativa</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {a.context === "pj" && a.company_id
                      ? companies.find((c) => c.id === a.company_id)?.trade_name || companies.find((c) => c.id === a.company_id)?.name || "Empresa"
                      : "Pessoal"}
                    {" · "}Saldo inicial: {maskBRL(Number(a.initial_balance))}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground">Saldo Atual</p>
                  <p className={`text-sm font-bold ${Number(a.current_balance) >= 0 ? "text-success" : "text-destructive"}`}>
                    {maskBRL(Number(a.current_balance))}
                  </p>
                </div>

                <Switch
                  checked={a.is_active}
                  onCheckedChange={() => handleToggleActive(a)}
                  className="shrink-0"
                />

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0"
                  onClick={() => { setEditAccount(a); setDialogOpen(true); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => setDeleteAccount(a)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* FAB mobile */}
      <button
        onClick={() => { setEditAccount(null); setDialogOpen(true); }}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      <AccountFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchAccounts}
        account={editAccount}
      />

      <AlertDialog open={!!deleteAccount} onOpenChange={(open) => { if (!open) setDeleteAccount(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta bancária</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a conta <strong>{deleteAccount?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
