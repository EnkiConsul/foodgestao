import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Landmark, Link2, Plug, RefreshCw, Trash2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Loader2, WifiOff, Clock, Download } from "lucide-react";
import { toast } from "sonner";
import { useBankConnections, usePluggyActions, requestConnectToken, type BankConnection } from "@/hooks/usePluggy";
import { usePluggyConnect } from "@/components/accounts/usePluggyConnect";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { formatDate } from "@/lib/date-utils";
import type { Database } from "@/integrations/supabase/types";

type Account = Database["public"]["Tables"]["accounts"]["Row"];

interface Props {
  accounts: Account[];
  onRefreshAccounts: () => void;
  onCreateAccountFromProvider?: (draft: {
    name: string;
    account_type: Account["account_type"];
    initial_balance: number;
  }) => void;
}

const statusMeta: Record<string, { label: string; className: string }> = {
  active: { label: "Ativa", className: "bg-success/10 text-success border-success/20" },
  updating: { label: "Atualizando", className: "bg-primary/10 text-primary border-primary/20" },
  outdated: { label: "Desatualizada", className: "bg-warning/10 text-warning border-warning/20" },
  login_error: { label: "Credenciais expiradas", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export function OpenFinanceSection({ accounts, onRefreshAccounts }: Props) {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { connectionsQuery, accountsQuery, importedCountsQuery } = useBankConnections();
  const { registerItem, syncConnection, deleteConnection, linkProviderAccount, toggleAutoImport } = usePluggyActions();
  const pluggy = usePluggyConnect();
  const { isSuperAdmin } = useSuperAdmin();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<BankConnection | null>(null);
  const [deleteError, setDeleteError] = useState<{ message: string; pluggyError: boolean } | null>(null);

  useRealtimeSync({
    tables: ["bank_connections", "bank_connection_accounts"],
    onChange: () => {
      connectionsQuery.refetch();
      accountsQuery.refetch();
      importedCountsQuery.refetch();
    },
  });

  const connections = connectionsQuery.data ?? [];
  const providerAccounts = accountsQuery.data ?? [];
  const byConnection = useMemo(() => {
    const map = new Map<string, typeof providerAccounts>();
    for (const pa of providerAccounts) {
      const list = map.get(pa.connection_id) ?? [];
      list.push(pa);
      map.set(pa.connection_id, list);
    }
    return map;
  }, [providerAccounts]);

  const importedCounts = importedCountsQuery.data ?? {};
  const importedByConnection = useMemo(() => {
    const map = new Map<string, number>();
    for (const pa of providerAccounts) {
      if (!pa.account_id) continue;
      const n = importedCounts[pa.account_id] ?? 0;
      map.set(pa.connection_id, (map.get(pa.connection_id) ?? 0) + n);
    }
    return map;
  }, [providerAccounts, importedCounts]);

  const summary = useMemo(() => {
    const total = connections.length;
    const active = connections.filter((c) => c.status === "active" || c.status === "updating").length;
    const errors = connections.filter((c) => c.status === "login_error").length;
    const outdated = connections.filter((c) => c.status === "outdated").length;
    const linked = providerAccounts.filter((a) => !!a.account_id).length;
    const totalImported = Object.values(importedCounts).reduce((s, n) => s + n, 0);
    const lastSync = connections
      .map((c) => c.last_sync_at)
      .filter((v): v is string => !!v)
      .sort()
      .at(-1) ?? null;
    return { total, active, errors, outdated, linked, totalImported, lastSync };
  }, [connections, providerAccounts, importedCounts]);


  async function handleConnect(updateItem?: string) {
    await pluggy.open({
      fetchToken: () => requestConnectToken(updateItem),
      updateItem,
      onSuccess: async (itemId) => {
        try {
          const res = await registerItem.mutateAsync({
            itemId,
            context: contextType,
            companyId: contextType === "pj" ? selectedCompanyId ?? null : null,
          });
          toast.success(`Conexão registrada (${res.accounts} contas)`);
          // Dispara sync imediato
          await syncConnection.mutateAsync(res.connectionId).catch(() => undefined);
          onRefreshAccounts();
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
      onError: (msg) => toast.error(msg || "Erro na conexão"),
    });
  }

  async function handleSync(id: string, fullResync = false) {
    try {
      const res = await syncConnection.mutateAsync({ connectionId: id, fullResync });
      const acctErrors = (res.perAccount ?? []).filter((a) => a.error);
      if (res.needsReconnect) {
        toast.error("É necessário reconectar esta instituição para autorizar a coleta de lançamentos.");
      } else if (res.itemUpdateTriggered) {
        toast.info(
          `Saldo atualizado. Pluggy iniciou a coleta de lançamentos — sincronize novamente em alguns minutos.`,
          { duration: 8000 },
        );
      } else if (res.error) {
        toast.error(res.error);
      } else if (acctErrors.length > 0) {
        toast.warning(`Sincronizado com avisos: ${acctErrors[0].error}`);
      } else {
        toast.success(`Sincronizado (${res.imported} lançamentos)`);
      }
      onRefreshAccounts();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete(conn: BankConnection, force = false) {
    try {
      await deleteConnection.mutateAsync({ connectionId: conn.id, force });
      toast.success("Conexão removida");
      setConfirmDelete(null);
      setDeleteError(null);
      await Promise.all([
        connectionsQuery.refetch(),
        accountsQuery.refetch(),
        importedCountsQuery.refetch(),
      ]);
      onRefreshAccounts();
    } catch (e) {
      const err = e as Error & { pluggyError?: boolean };
      setDeleteError({ message: err.message, pluggyError: !!err.pluggyError });
      toast.error(err.message);
    }
  }

  const availableAccounts = accounts.filter((a) => {
    if (contextType === "pj") return a.context === "pj" && a.company_id === selectedCompanyId;
    return a.context === "pf" && !a.company_id;
  });

  return (
    <>
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Plug className="h-4 w-4 text-primary" /> Open Finance
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Conecte seus bancos via Pluggy para importar lançamentos automaticamente.
            </p>
          </div>
          <Button size="sm" onClick={() => handleConnect()} disabled={pluggy.loading || registerItem.isPending}>
            <Plug className="h-4 w-4 mr-2" /> Conectar banco
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {connections.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatusTile
                icon={<CheckCircle2 className="h-4 w-4 text-success" />}
                label="Conexões ativas"
                value={`${summary.active}/${summary.total}`}
                hint={summary.errors > 0 ? `${summary.errors} com erro` : summary.outdated > 0 ? `${summary.outdated} desatualizadas` : "Tudo em dia"}
                tone={summary.errors > 0 ? "danger" : summary.outdated > 0 ? "warning" : "success"}
              />
              <StatusTile
                icon={<Link2 className="h-4 w-4 text-primary" />}
                label="Contas vinculadas"
                value={String(summary.linked)}
                hint={`${providerAccounts.length} contas retornadas`}
                tone="primary"
              />
              <StatusTile
                icon={<Download className="h-4 w-4 text-primary" />}
                label="Lançamentos importados"
                value={importedCountsQuery.isLoading ? "…" : summary.totalImported.toLocaleString("pt-BR")}
                hint="Total via Open Finance"
                tone="primary"
              />
              <StatusTile
                icon={<Clock className="h-4 w-4 text-muted-foreground" />}
                label="Última sincronização"
                value={summary.lastSync ? formatDate(summary.lastSync, "dd/MM HH:mm") : "—"}
                hint={summary.lastSync ? formatDate(summary.lastSync, "dd 'de' MMMM") : "Nenhuma sync ainda"}
                tone="muted"
              />
            </div>
          )}

          {connectionsQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : connections.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma instituição conectada neste perfil.
            </div>
          ) : (
            connections.map((conn) => {
              const accs = byConnection.get(conn.id) ?? [];
              const isOpen = expanded[conn.id] ?? true;
              const meta = statusMeta[conn.status] ?? { label: conn.status, className: "" };
              return (
                <div key={conn.id} className="rounded-lg border bg-card">
                  <div className="flex items-center gap-3 p-3">
                    <button
                      onClick={() => setExpanded((s) => ({ ...s, [conn.id]: !isOpen }))}
                      className="text-muted-foreground shrink-0"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {conn.institution_logo_url ? (
                      <img src={conn.institution_logo_url} alt="" className="h-8 w-8 rounded object-contain bg-muted" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                        <Landmark className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate">
                          {conn.institution_name ?? "Instituição"}
                        </span>
                        <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${meta.className}`}>
                          {conn.status === "updating" && <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />}
                          {conn.status === "login_error" && <WifiOff className="h-3 w-3 mr-0.5" />}
                          {meta.label}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-1">
                          <Download className="h-3 w-3" />
                          {(importedByConnection.get(conn.id) ?? 0).toLocaleString("pt-BR")} importados
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Última sync: {conn.last_sync_at ? formatDate(conn.last_sync_at, "dd/MM/yyyy HH:mm") : "—"}
                        {conn.consent_expires_at
                          ? ` · Consentimento até ${formatDate(conn.consent_expires_at, "dd/MM/yyyy")}`
                          : ""}
                      </p>
                      {conn.last_error && (
                        <p className="text-[11px] text-destructive mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> {conn.last_error}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSync(conn.id)}
                        disabled={syncConnection.isPending}
                      >
                        <RefreshCw className={`h-4 w-4 ${syncConnection.isPending ? "animate-spin" : ""}`} />
                      </Button>
                      {conn.status === "login_error" && (
                        <Button size="sm" variant="outline" onClick={() => handleConnect(conn.provider_item_id)}>
                          Reconectar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDelete(conn)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t p-3 space-y-2 bg-muted/30">
                      {accs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhuma conta retornada.</p>
                      ) : (
                        accs.map((pa) => (
                          <div
                            key={pa.id}
                            className="flex flex-col md:flex-row md:items-center gap-2 rounded border bg-card p-2"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {pa.provider_name}{" "}
                                <span className="text-[11px] text-muted-foreground">
                                  {pa.provider_number ? `· ${pa.provider_number}` : ""}
                                </span>
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {pa.provider_type ?? "—"}
                                {pa.provider_subtype ? ` / ${pa.provider_subtype}` : ""}
                                {pa.provider_balance != null
                                  ? ` · Saldo provedor: R$ ${Number(pa.provider_balance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                                  : ""}
                                {pa.account_id
                                  ? ` · ${(importedCounts[pa.account_id] ?? 0).toLocaleString("pt-BR")} lançamentos importados`
                                  : ""}
                                {pa.last_synced_at
                                  ? ` · sync ${formatDate(pa.last_synced_at, "dd/MM HH:mm")}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Select
                                value={pa.account_id ?? "__none"}
                                onValueChange={(v) =>
                                  linkProviderAccount.mutate({
                                    connAccountId: pa.id,
                                    accountId: v === "__none" ? null : v,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 w-[200px] text-xs">
                                  <SelectValue placeholder="Vincular à conta interna" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none">Não vinculada</SelectItem>
                                  {availableAccounts.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                      {a.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Switch
                                  checked={pa.auto_import}
                                  onCheckedChange={async (v) => {
                                    await toggleAutoImport.mutateAsync({ connAccountId: pa.id, autoImport: v });
                                    if (v && pa.account_id) {
                                      // Ao ligar auto_import com conta vinculada, dispara sync imediato
                                      handleSync(conn.id);
                                    }
                                  }}
                                />
                                Auto
                              </label>
                              {pa.account_id && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-1">
                                  <Link2 className="h-3 w-3" /> vinculada
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conexão Open Finance</AlertDialogTitle>
            <AlertDialogDescription>
              Isso revoga o consentimento com <strong>{confirmDelete?.institution_name}</strong> na Pluggy e remove as
              contas do provedor. Os lançamentos já importados permanecem em suas contas internas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Falha ao remover</p>
              <p className="mt-1 text-xs">{deleteError.message}</p>
              {deleteError.pluggyError && (
                <p className="mt-2 text-xs">
                  A conexão local não foi apagada — tente novamente. Se o item já foi removido diretamente no painel Pluggy,
                  {isSuperAdmin ? " use \"Remover mesmo assim\"." : " peça ajuda a um super admin."}
                </p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {deleteError?.pluggyError && isSuperAdmin && (
              <Button
                variant="outline"
                onClick={() => confirmDelete && handleDelete(confirmDelete, true)}
                disabled={deleteConnection.isPending}
              >
                Remover mesmo assim
              </Button>
            )}
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) handleDelete(confirmDelete, false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteConnection.isPending}
            >
              {deleteError ? "Tentar novamente" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type Tone = "success" | "warning" | "danger" | "primary" | "muted";

function StatusTile({
  icon,
  label,
  value,
  hint,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  const toneClass: Record<Tone, string> = {
    success: "border-success/30 bg-success/5",
    warning: "border-warning/30 bg-warning/5",
    danger: "border-destructive/30 bg-destructive/5",
    primary: "border-primary/20 bg-primary/5",
    muted: "border-border bg-muted/30",
  };
  return (
    <div className={`rounded-lg border p-2.5 ${toneClass[tone]}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-lg font-semibold leading-tight mt-1 text-foreground">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

