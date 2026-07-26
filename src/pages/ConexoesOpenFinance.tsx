import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Zap,
  RefreshCw,
  Building2,
  MoreVertical,
  Unlink,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Check,
  CircleX,
  Ban,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

interface Connection {
  id: string;
  institution_name: string | null;
  institution_logo_url: string | null;
  status: string | null;
  status_detail: string | null;
  last_synced_at: string | null;
  consent_expires_at: string | null;
  last_error: string | null;
  disconnected_at: string | null;
  created_at: string;
}

interface OFAccount {
  id: string;
  connection_id: string;
  name: string | null;
  number: string | null;
  type: string | null;
  subtype: string | null;
  balance: number | null;
  local_account_id: string | null;
  auto_import: boolean;
  ignored: boolean;
  last_transaction_at: string | null;
  local_balance?: number | null;
  local_reference_date?: string | null;
}


function statusMeta(status: string | null, disconnected_at: string | null) {
  if (disconnected_at) return { label: "Desconectada", variant: "outline" as const, tone: "muted" };
  switch (status) {
    case "active":
    case "UPDATED":
      return { label: "Ativa", variant: "default" as const, tone: "primary" };
    case "syncing":
    case "UPDATING":
      return { label: "Sincronizando", variant: "secondary" as const, tone: "info" };
    case "LOGIN_ERROR":
    case "error":
      return { label: "Erro de acesso", variant: "destructive" as const, tone: "danger" };
    case "WAITING_USER_INPUT":
      return { label: "Ação necessária", variant: "secondary" as const, tone: "warn" };
    default:
      return { label: status ?? "—", variant: "outline" as const, tone: "muted" };
  }
}

export default function ConexoesOpenFinance() {
  const navigate = useNavigate();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [accountsByConn, setAccountsByConn] = useState<Record<string, OFAccount[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [confirmDisconnect, setConfirmDisconnect] = useState<Connection | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<OFAccount | null>(null);
  const [confirmAdjust, setConfirmAdjust] = useState<OFAccount | null>(null);
  const [busy, setBusy] = useState(false);


  const inPJ = contextType === "pj" && !!selectedCompanyId;

  const fetchConnections = useCallback(async () => {
    if (!inPJ) {
      setConnections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("open_finance_connections")
      .select(
        "id, institution_name, institution_logo_url, status, status_detail, last_synced_at, consent_expires_at, last_error, disconnected_at, created_at",
      )
      .eq("company_id", selectedCompanyId!)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar conexões", { description: error.message });
    } else {
      setConnections((data ?? []) as Connection[]);
    }
    setLoading(false);
  }, [inPJ, selectedCompanyId]);

  const fetchAccountsFor = useCallback(async (connectionId: string) => {
    const { data, error } = await supabase
      .from("open_finance_accounts")
      .select(
        "id, connection_id, name, number, type, subtype, balance, local_account_id, auto_import, ignored, last_transaction_at",
      )
      .eq("connection_id", connectionId)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar contas", { description: error.message });
      return;
    }
    const rows = (data ?? []) as OFAccount[];
    const localIds = rows.map((r) => r.local_account_id).filter(Boolean) as string[];
    if (localIds.length > 0) {
      const { data: locals } = await supabase
        .from("accounts")
        .select("id, current_balance, reference_balance_date")
        .in("id", localIds);
      const map = new Map((locals ?? []).map((l: any) => [l.id, l]));
      rows.forEach((r) => {
        if (r.local_account_id && map.has(r.local_account_id)) {
          const l = map.get(r.local_account_id)!;
          r.local_balance = Number(l.current_balance);
          r.local_reference_date = l.reference_balance_date;
        }
      });
    }
    setAccountsByConn((prev) => ({ ...prev, [connectionId]: rows }));
  }, []);


  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  useRealtimeSync({
    tables: ["open_finance_connections", "open_finance_sync_runs"],
    onChange: () => fetchConnections(),
  });

  const toggleExpand = async (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    if (!accountsByConn[id]) await fetchAccountsFor(id);
  };

  const runSync = async (conn: Connection) => {
    setSyncing((s) => ({ ...s, [conn.id]: true }));
    try {
      const { error } = await supabase.functions.invoke("pluggy-sync", {
        body: { connection_id: conn.id, initial: false },
      });
      if (error) throw new Error(error.message);
      toast.success("Sincronização iniciada");
      setTimeout(fetchConnections, 1500);
    } catch (e: any) {
      toast.error("Falha ao sincronizar", { description: e?.message });
    } finally {
      setSyncing((s) => ({ ...s, [conn.id]: false }));
    }
  };

  const doDisconnect = async () => {
    if (!confirmDisconnect) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("disconnect_open_finance_connection", {
        _connection_id: confirmDisconnect.id,
      });
      if (error) throw error;
      toast.success("Conexão desconectada", {
        description: "Suas contas locais e histórico permanecem preservados.",
      });
      setConfirmDisconnect(null);
      fetchConnections();
    } catch (e: any) {
      toast.error("Falha ao desconectar", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const doUnlink = async () => {
    if (!confirmUnlink) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("unlink_open_finance_account", {
        _of_account_id: confirmUnlink.id,
      });
      if (error) throw error;
      toast.success("Conta desvinculada");
      const connId = confirmUnlink.connection_id;
      setConfirmUnlink(null);
      fetchAccountsFor(connId);
    } catch (e: any) {
      toast.error("Falha ao desvincular", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const doAdjust = async () => {
    if (!confirmAdjust || confirmAdjust.local_account_id == null || confirmAdjust.balance == null) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("adjust_account_balance", {
        _account_id: confirmAdjust.local_account_id,
        _target_balance: confirmAdjust.balance,
        _adjust_date: new Date().toISOString().slice(0, 10),
        _note: "Ajuste automático via Open Finance",
      });
      if (error) throw error;
      toast.success("Saldo local ajustado", {
        description: "Lançamento de conciliação criado para alinhar ao saldo do banco.",
      });
      const connId = confirmAdjust.connection_id;
      setConfirmAdjust(null);
      fetchAccountsFor(connId);
    } catch (e: any) {
      toast.error("Falha ao ajustar saldo", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };


  const toggleAutoImport = async (row: OFAccount, value: boolean) => {
    setAccountsByConn((prev) => ({
      ...prev,
      [row.connection_id]: prev[row.connection_id].map((a) =>
        a.id === row.id ? { ...a, auto_import: value } : a,
      ),
    }));
    const { error } = await supabase.rpc("set_open_finance_auto_import", {
      _of_account_id: row.id,
      _enabled: value,
    });
    if (error) {
      toast.error("Falha ao atualizar preferência");
      fetchAccountsFor(row.connection_id);
    }
  };

  const toggleIgnored = async (row: OFAccount, value: boolean) => {
    setAccountsByConn((prev) => ({
      ...prev,
      [row.connection_id]: prev[row.connection_id].map((a) =>
        a.id === row.id ? { ...a, ignored: value } : a,
      ),
    }));
    const { error } = await supabase.rpc("ignore_open_finance_account", {
      _of_account_id: row.id,
      _ignored: value,
    });
    if (error) {
      toast.error("Falha ao atualizar");
      fetchAccountsFor(row.connection_id);
    }
  };

  const activeCount = useMemo(
    () => connections.filter((c) => !c.disconnected_at).length,
    [connections],
  );

  if (!inPJ) {
    return (
      <div className="p-6 max-w-4xl">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Contexto empresarial necessário</AlertTitle>
          <AlertDescription>
            O Open Finance está disponível apenas no contexto empresarial. Selecione uma empresa no
            seletor global para gerenciar suas conexões.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/contas-bancarias")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Conexões Open Finance
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} {activeCount === 1 ? "conexão ativa" : "conexões ativas"}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/contas-bancarias/conciliacao")}>
          Conciliação
        </Button>
        <Button onClick={() => navigate("/contas-bancarias?openFinance=1")}>
          <Zap className="h-4 w-4 mr-2" /> Nova conexão
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando conexões...
        </div>
      ) : connections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Building2 className="h-8 w-8 text-muted-foreground mx-auto" />
            <div className="text-sm text-muted-foreground">
              Nenhuma conexão Open Finance ainda.
            </div>
            <Button onClick={() => navigate("/contas-bancarias?openFinance=1")}>
              <Zap className="h-4 w-4 mr-2" /> Conectar banco
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {connections.map((c) => {
            const meta = statusMeta(c.status, c.disconnected_at);
            const isExpanded = expanded[c.id];
            const accounts = accountsByConn[c.id] ?? [];
            const consentSoon =
              c.consent_expires_at &&
              new Date(c.consent_expires_at).getTime() - Date.now() < 15 * 24 * 3600 * 1000;
            return (
              <Card key={c.id} className={c.disconnected_at ? "opacity-70" : ""}>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleExpand(c.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {c.institution_logo_url ? (
                          <img
                            src={c.institution_logo_url}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm truncate">
                          {c.institution_name || "Instituição"}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant={meta.variant} className="text-[10px]">
                            {meta.label}
                          </Badge>
                          {c.last_synced_at ? (
                            <span className="text-xs text-muted-foreground">
                              Sincronizado{" "}
                              {formatDistanceToNow(new Date(c.last_synced_at), {
                                locale: ptBR,
                                addSuffix: true,
                              })}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Nunca sincronizado</span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {!c.disconnected_at && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runSync(c)}
                          disabled={!!syncing[c.id]}
                        >
                          {syncing[c.id] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          <span className="hidden md:inline ml-2">Sincronizar</span>
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate("/lancamentos?tab=conciliacao")}>
                            Ver na Central de Conciliação
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {!c.disconnected_at && (
                            <DropdownMenuItem
                              onClick={() => setConfirmDisconnect(c)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Unlink className="h-4 w-4 mr-2" /> Desconectar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>

                {(c.last_error || consentSoon) && (
                  <div className="px-4 pb-2">
                    {c.last_error && (
                      <Alert variant="destructive" className="py-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-xs">{c.last_error}</AlertDescription>
                      </Alert>
                    )}
                    {consentSoon && !c.last_error && (
                      <Alert className="py-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          Consentimento expira em{" "}
                          {format(new Date(c.consent_expires_at!), "dd/MM/yyyy", { locale: ptBR })}.
                          Reconecte para manter a sincronização ativa.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {isExpanded && (
                  <CardContent className="p-4 pt-0 space-y-2">
                    {accounts.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        Nenhuma conta descoberta ainda nesta conexão.
                      </p>
                    ) : (
                      accounts.map((a) => {
                        const hasLocal = !!a.local_account_id && a.local_balance != null;
                        const diff =
                          hasLocal && a.balance != null ? Number(a.balance) - Number(a.local_balance) : 0;
                        const diverges = hasLocal && Math.abs(diff) > 0.01;
                        return (
                        <div
                          key={a.id}
                          className={`rounded-md border p-3 ${a.ignored ? "opacity-60" : ""} ${diverges ? "border-amber-500/60" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate flex items-center gap-2">
                                {a.name ?? "Conta"}
                                {a.local_account_id && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    <Check className="h-3 w-3 mr-0.5" /> Vinculada
                                  </Badge>
                                )}
                                {a.ignored && (
                                  <Badge variant="outline" className="text-[10px]">
                                    <Ban className="h-3 w-3 mr-0.5" /> Ignorada
                                  </Badge>
                                )}
                                {diverges && (
                                  <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                                    <AlertTriangle className="h-3 w-3 mr-0.5" /> Divergência
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {[a.subtype ?? a.type, a.number].filter(Boolean).join(" · ") || "—"}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[10px] text-muted-foreground uppercase">Saldo banco</div>
                              <div className="text-sm font-semibold tabular-nums">
                                {a.balance != null
                                  ? a.balance.toLocaleString("pt-BR", {
                                      style: "currency",
                                      currency: "BRL",
                                    })
                                  : "—"}
                              </div>
                              {hasLocal && (
                                <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                                  Local:{" "}
                                  {Number(a.local_balance).toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                          {diverges && (
                            <Alert className="mt-2 py-2 border-amber-500/60">
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                              <AlertDescription className="text-xs flex items-center justify-between gap-2 flex-wrap">
                                <span>
                                  Divergência de{" "}
                                  <strong className="tabular-nums">
                                    {Math.abs(diff).toLocaleString("pt-BR", {
                                      style: "currency",
                                      currency: "BRL",
                                    })}
                                  </strong>{" "}
                                  entre o saldo do banco e o saldo local. Promova as transações pendentes ou ajuste manualmente.
                                </span>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => navigate("/contas-bancarias/conciliacao")}
                                  >
                                    Conciliar
                                  </Button>
                                  <Button size="sm" onClick={() => setConfirmAdjust(a)}>
                                    Ajustar saldo
                                  </Button>
                                </div>
                              </AlertDescription>
                            </Alert>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Switch
                                checked={a.auto_import}
                                onCheckedChange={(v) => toggleAutoImport(a, v)}
                                disabled={a.ignored || !!c.disconnected_at}
                              />
                              Importar automaticamente
                            </label>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Switch
                                checked={a.ignored}
                                onCheckedChange={(v) => toggleIgnored(a, v)}
                                disabled={!!c.disconnected_at}
                              />
                              Ignorar
                            </label>
                            {a.local_account_id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-auto text-destructive hover:text-destructive"
                                onClick={() => setConfirmUnlink(a)}
                              >
                                <CircleX className="h-3.5 w-3.5 mr-1" /> Desvincular conta local
                              </Button>
                            )}
                          </div>
                        </div>
                        );
                      })

                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmDisconnect} onOpenChange={(o) => !o && setConfirmDisconnect(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar {confirmDisconnect?.institution_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O consentimento junto ao banco será revogado e a sincronização automática será
              interrompida. As contas locais e o histórico de lançamentos permanecem preservados.
              Você pode reconectar a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDisconnect} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmUnlink} onOpenChange={(o) => !o && setConfirmUnlink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta conta bancária deixará de receber lançamentos automaticamente. A conta local no
              360°FOOD permanecerá ativa e você poderá vinculá-la novamente depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doUnlink} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
