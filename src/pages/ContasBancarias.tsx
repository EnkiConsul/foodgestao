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
import { ImportStatementDialog } from "@/components/transactions/ImportStatementDialog";
import { AdjustAccountBalanceDialog } from "@/components/accounts/AdjustAccountBalanceDialog";
import { AccountCreationMethodDialog } from "@/components/accounts/AccountCreationMethodDialog";
import { PluggyConnectDialog } from "@/components/accounts/PluggyConnectDialog";
import { useNavigate } from "react-router-dom";



import { BankLogo } from "@/components/accounts/BankLogo";
import { Plus, Search, Landmark, Pencil, Trash2, Wallet, RefreshCw, AlertTriangle, Upload, SlidersHorizontal, Link2 } from "lucide-react";
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
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [methodDialogOpen, setMethodDialogOpen] = useState(false);
  const [pluggyOpen, setPluggyOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importAccountId, setImportAccountId] = useState<string | null>(null);
  const [postCreateAccountId, setPostCreateAccountId] = useState<string | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null);
  const [deleteHasTx, setDeleteHasTx] = useState<boolean | null>(null);
  const [linkedCards, setLinkedCards] = useState<Array<{ id: string; brand: string | null; last4: string | null }>>([]);
  const [unlinkingCards, setUnlinkingCards] = useState(false);
  const [adjustAccount, setAdjustAccount] = useState<Account | null>(null);
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
      _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      _include_inactive: true,
    });
    if (error) toast.error("Erro ao carregar contas bancárias");
    else setAccounts((data ?? []) as any);
    setLoading(false);
  }, [user, contextType, selectedCompanyId]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // ─────────────────────────────────────────────────────────────────────────
  // Controle mutuamente exclusivo entre os 3 modais de conta.
  // Abrir formulário de conta (criação ou edição).
  const openManualForm = useCallback((account: Account | null) => {
    setEditAccount(account);
    setDialogOpen(true);
  }, []);

  const openMethodDialog = useCallback(() => {
    if (contextType === "pj" && selectedCompanyId) {
      setMethodDialogOpen(true);
    } else {
      openManualForm(null);
    }
  }, [openManualForm, contextType, selectedCompanyId]);

  const handleFormOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditAccount(null);
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    if (!deleteAccount) { setDeleteHasTx(null); setLinkedCards([]); return; }
    setDeleteHasTx(null);
    setLinkedCards([]);
    (async () => {
      const [{ count }, { data: cards }] = await Promise.all([
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .or(`account_id.eq.${deleteAccount.id},destination_account_id.eq.${deleteAccount.id},connection_account_id.eq.${deleteAccount.id}`),
        supabase
          .from("credit_cards")
          .select("id, brand, last4")
          .eq("default_payment_account_id", deleteAccount.id),
      ]);
      if (!cancelled) {
        setDeleteHasTx((count ?? 0) > 0);
        setLinkedCards((cards ?? []) as any);
      }
    })();
    return () => { cancelled = true; };
  }, [deleteAccount]);

  const handleUnlinkCards = async () => {
    if (!deleteAccount || linkedCards.length === 0) return;
    setUnlinkingCards(true);
    const { error } = await supabase
      .from("credit_cards")
      .update({ default_payment_account_id: null })
      .eq("default_payment_account_id", deleteAccount.id);
    setUnlinkingCards(false);
    if (error) { toast.error("Erro ao desvincular cartões"); return; }
    toast.success("Cartões desvinculados. Agora você pode excluir a conta.");
    setLinkedCards([]);
  };

  const handleDelete = async () => {
    if (!deleteAccount) return;
    const { data, error } = await supabase.rpc("delete_account", { _account_id: deleteAccount.id });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("fatura") || msg.includes("cart")) {
        toast.error("Esta conta é a conta de pagamento padrão de um cartão. Desvincule antes de excluir.");
        return; // keep dialog open so the user can click "Desvincular cartões"
      } else if (msg.includes("permission denied") || (error as { code?: string }).code === "42501") {
        toast.error("Você não tem permissão para excluir esta conta.");
      } else {
        toast.error("Erro ao excluir conta");
      }
    } else {
      toast.success(data === "hard" ? "Conta excluída" : "Conta arquivada");
      fetchAccounts();
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
            onClick={handleResync}
            disabled={resyncing}
            className="hidden md:flex"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${resyncing ? "animate-spin" : ""}`} /> Recalcular saldos
          </Button>
          <Button onClick={openMethodDialog} className="hidden md:flex">
            <Plus className="h-4 w-4 mr-2" /> Nova Conta
          </Button>
        </div>
      </div>

      {staleBalance && (
        <Alert variant="destructive" className="border-warning/50 bg-warning/10 text-foreground [&>svg]:text-warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Saldos podem estar desatualizados</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-1">
            <span className="text-sm">
              Detectamos uma alteração em lançamentos que ainda não refletiu nos saldos deste perfil.
            </span>
            <Button size="sm" variant="outline" onClick={handleResync} disabled={resyncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${resyncing ? "animate-spin" : ""}`} />
              Re-sincronizar agora
            </Button>
          </AlertDescription>
        </Alert>
      )}

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
              <Button variant="link" onClick={openMethodDialog} className="mt-2">
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
              <CardContent className="p-3 sm:p-4">
                {/* Linha principal */}
                <div className="flex items-start gap-3">
                  <BankLogo
                    slug={(a as typeof a & { bank_slug?: string | null }).bank_slug}
                    fallbackName={a.name}
                    size={40}
                    fallbackColor={a.color || undefined}
                    className="shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">{a.name}</p>
                      <Badge className="text-[10px] h-4 px-1.5 shrink-0 bg-primary/10 text-primary border-0 hover:bg-primary/15">
                        {accountTypeLabels[a.account_type]}
                      </Badge>
                      {!a.is_active && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">Inativa</Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
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
                </div>

                {/* Ações — quebra abaixo no mobile, inline no desktop */}
                <div className="mt-3 flex items-center justify-between gap-2 sm:mt-2 sm:justify-end">
                  <div className="flex items-center gap-2 sm:hidden text-xs text-muted-foreground">
                    <Switch
                      checked={a.is_active}
                      onCheckedChange={() => handleToggleActive(a)}
                    />
                    <span>{a.is_active ? "Ativa" : "Inativa"}</span>
                  </div>
                  <div className="hidden sm:block">
                    <Switch
                      checked={a.is_active}
                      onCheckedChange={() => handleToggleActive(a)}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      onClick={() => setAdjustAccount(a)}
                      aria-label="Ajustar saldo"
                      title="Ajustar saldo"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      onClick={() => openManualForm(a)}
                      aria-label="Editar conta"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteAccount(a)}
                      aria-label="Excluir conta"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* FAB mobile */}
      <button
        type="button"
        aria-label="Adicionar nova conta"
        onClick={openMethodDialog}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Plus aria-hidden="true" className="h-6 w-6" />
      </button>


      <AccountFormDialog
        open={dialogOpen}
        onOpenChange={handleFormOpenChange}
        onSaved={(newId) => {
          fetchAccounts();
          if (newId && !editAccount) setPostCreateAccountId(newId);
        }}
        account={editAccount}
      />

      <ImportStatementDialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setImportAccountId(null);
        }}
        onImported={fetchAccounts}
        defaultAccountId={importAccountId}
      />

      <AlertDialog
        open={!!postCreateAccountId}
        onOpenChange={(open) => { if (!open) setPostCreateAccountId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importar extrato agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Sua conta foi criada. Você pode importar o extrato (PDF Nubank ou OFX) agora
              para popular os lançamentos e o saldo automaticamente, ou fazer isso mais tarde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPostCreateAccountId(null)}>Agora não</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = postCreateAccountId;
                setPostCreateAccountId(null);
                if (id) {
                  setImportAccountId(id);
                  setImportOpen(true);
                }
              }}
            >
              <Upload className="h-4 w-4 mr-2" /> Importar extrato
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <AlertDialog open={!!deleteAccount} onOpenChange={(open) => { if (!open) setDeleteAccount(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta bancária</AlertDialogTitle>
            <AlertDialogDescription data-testid="delete-account-description">
              {deleteHasTx === null && (
                <>Verificando lançamentos vinculados à conta <strong>{deleteAccount?.name}</strong>…</>
              )}
              {deleteHasTx === false && (
                <>A conta <strong>{deleteAccount?.name}</strong> não possui lançamentos vinculados e será <strong>excluída definitivamente</strong>. Esta ação não pode ser desfeita.</>
              )}
              {deleteHasTx === true && (
                <>A conta <strong>{deleteAccount?.name}</strong> possui lançamentos vinculados e será <strong>arquivada</strong> para preservar o histórico contábil. Ela deixará de aparecer nas listas.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {linkedCards.length > 0 && (
            <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
              <div className="font-medium mb-1 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Cartão(ões) usando esta conta como pagamento padrão
              </div>
              <ul className="list-disc pl-5 mb-2 text-muted-foreground">
                {linkedCards.map((c) => (
                  <li key={c.id}>{c.brand ?? "Cartão"}{c.last4 ? ` •••• ${c.last4}` : ""}</li>
                ))}
              </ul>
              <p className="text-muted-foreground mb-2">Desvincule para poder excluir a conta.</p>
              <Button size="sm" variant="outline" onClick={handleUnlinkCards} disabled={unlinkingCards}>
                {unlinkingCards ? "Desvinculando…" : "Desvincular cartões"}
              </Button>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={linkedCards.length > 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdjustAccountBalanceDialog
        open={!!adjustAccount}
        onOpenChange={(o) => { if (!o) setAdjustAccount(null); }}
        account={adjustAccount}
        onAdjusted={fetchAccounts}
      />
    </div>
  );
}
