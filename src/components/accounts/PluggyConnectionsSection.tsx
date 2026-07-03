import { useState, useEffect, useCallback } from "react";
import { PluggyConnect } from "react-pluggy-connect";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Link2, RefreshCw, Trash2, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Connection = {
  id: string;
  provider_item_id: string;
  institution_name: string | null;
  institution_logo_url: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  consent_expires_at: string | null;
  context: "pf" | "pj";
  company_id: string | null;
};

type DiscoveredAccount = {
  id: string;
  connection_id: string;
  provider_name: string | null;
  provider_number: string | null;
  provider_type: string | null;
  account_id: string | null;
  provider_balance: number | null;
};

type LocalAccount = { id: string; name: string };

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Ativa", variant: "default" },
  updating: { label: "Atualizando", variant: "secondary" },
  outdated: { label: "Desatualizada", variant: "outline" },
  login_error: { label: "Erro de login", variant: "destructive" },
  consent_expired: { label: "Consentimento expirado", variant: "destructive" },
};

export function PluggyConnectionsSection({ localAccounts }: { localAccounts: LocalAccount[] }) {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [discovered, setDiscovered] = useState<{ conn: Connection; accounts: DiscoveredAccount[] } | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Connection | null>(null);

  const fetchConnections = useCallback(async () => {
    let query = supabase
      .from("bank_connections")
      .select("id, provider_item_id, institution_name, institution_logo_url, status, last_sync_at, last_error, consent_expires_at, context, company_id")
      .eq("context", contextType)
      .order("created_at", { ascending: false });
    if (contextType === "pj") query = query.eq("company_id", selectedCompanyId ?? "");
    else query = query.is("company_id", null);
    const { data, error } = await query;
    if (!error) setConnections((data as Connection[]) ?? []);
  }, [contextType, selectedCompanyId]);

  useEffect(() => {
    if (contextType === "pj" && !selectedCompanyId) { setConnections([]); return; }
    fetchConnections();
  }, [fetchConnections, contextType, selectedCompanyId]);

  const handleConnect = async () => {
    if (contextType === "pj" && !selectedCompanyId) {
      toast.error("Selecione uma empresa para conectar um banco PJ");
      return;
    }
    setLoadingToken(true);
    const { data, error } = await supabase.functions.invoke("pluggy-connect-token", { body: {} });
    setLoadingToken(false);
    if (error || !data?.accessToken) { toast.error("Erro ao iniciar conexão com o banco"); return; }
    setConnectToken(data.accessToken);
  };

  const onWidgetSuccess = async ({ item }: { item: { id: string } }) => {
    setConnectToken(null);
    toast.loading("Importando dados da conexão...", { id: "pluggy-create" });
    const { data, error } = await supabase.functions.invoke("pluggy-create-connection", {
      body: { itemId: item.id, context: contextType, company_id: contextType === "pj" ? selectedCompanyId : null },
    });
    toast.dismiss("pluggy-create");
    if (error || !data?.connection) { toast.error("Erro ao registrar conexão"); return; }
    toast.success("Banco conectado! Vincule as contas descobertas.");
    setDiscovered({ conn: data.connection, accounts: data.discovered_accounts });
    fetchConnections();
  };

  const handleLinkAccount = async (connAccountId: string, accountId: string | null) => {
    const { error } = await supabase.rpc("pluggy_link_provider_account" as any, {
      _conn_account_id: connAccountId,
      _account_id: accountId,
    });
    if (error) { toast.error("Erro ao vincular conta"); return; }
    if (discovered) {
      setDiscovered({
        ...discovered,
        accounts: discovered.accounts.map((a) => a.id === connAccountId ? { ...a, account_id: accountId } : a),
      });
    }
    toast.success(accountId ? "Conta vinculada" : "Vínculo removido");
  };

  const handleSyncNow = async (conn: Connection) => {
    setSyncing(conn.id);
    const { data, error } = await supabase.functions.invoke("pluggy-sync-item", {
      body: { connection_id: conn.id },
    });
    setSyncing(null);
    if (error) { toast.error("Erro ao sincronizar"); return; }
    toast.success(`Sincronizado: ${data?.inserted ?? 0} novos, ${data?.updated ?? 0} atualizados`);
    fetchConnections();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const conn = deleting;
    setDeleting(null);
    const { error } = await supabase.functions.invoke("pluggy-delete-connection", {
      body: { connection_id: conn.id },
    });
    if (error) { toast.error("Erro ao remover conexão"); return; }
    toast.success("Conexão removida");
    fetchConnections();
  };

  const openMapping = async (conn: Connection) => {
    const { data } = await supabase
      .from("bank_connection_accounts")
      .select("*")
      .eq("connection_id", conn.id);
    setDiscovered({ conn, accounts: (data as DiscoveredAccount[]) ?? [] });
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Link2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Conexões automáticas (Open Finance)</p>
              <p className="text-xs text-muted-foreground">Importe extratos diariamente via Pluggy</p>
            </div>
          </div>
          <Button size="sm" onClick={handleConnect} disabled={loadingToken}>
            <Plus className="h-4 w-4 mr-1" /> {loadingToken ? "Abrindo..." : "Conectar banco"}
          </Button>
        </div>

        {connections.length > 0 && (
          <div className="space-y-2">
            {connections.map((c) => {
              const st = statusLabels[c.status] ?? { label: c.status, variant: "outline" as const };
              const expiringSoon = c.consent_expires_at &&
                new Date(c.consent_expires_at).getTime() < Date.now() + 30 * 86400000;
              return (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
                  {c.institution_logo_url ? (
                    <img src={c.institution_logo_url} alt="" className="h-8 w-8 rounded object-contain bg-white" />
                  ) : (
                    <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                      <Link2 className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{c.institution_name ?? "Instituição"}</p>
                      <Badge variant={st.variant} className="text-[10px] h-4 px-1.5">{st.label}</Badge>
                      {expiringSoon && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-warning border-warning">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Renovar
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.last_sync_at
                        ? `Sincronizado ${formatDistanceToNow(new Date(c.last_sync_at), { locale: ptBR, addSuffix: true })}`
                        : "Nunca sincronizado"}
                      {c.last_error ? ` · Erro: ${c.last_error}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openMapping(c)}>
                    Contas
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleSyncNow(c)} disabled={syncing === c.id}>
                    <RefreshCw className={`h-4 w-4 ${syncing === c.id ? "animate-spin" : ""}`} />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(c)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={false}
          onSuccess={onWidgetSuccess}
          onClose={() => setConnectToken(null)}
          onError={(err) => {
            console.error("[PluggyConnect]", err);
            toast.error("Erro no widget de conexão");
            setConnectToken(null);
          }}
        />
      )}

      <Dialog open={!!discovered} onOpenChange={(o) => !o && setDiscovered(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular contas descobertas</DialogTitle>
            <DialogDescription>
              Escolha para qual conta local as transações de cada conta bancária devem ser importadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {discovered?.accounts.map((a) => (
              <div key={a.id} className="p-3 rounded-md border space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.provider_name ?? "Conta"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {a.provider_type} {a.provider_number ? `· ${a.provider_number}` : ""}
                    </p>
                  </div>
                  {a.account_id && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
                </div>
                <Select
                  value={a.account_id ?? "none"}
                  onValueChange={(v) => handleLinkAccount(a.id, v === "none" ? null : v)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vincular a..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não importar</SelectItem>
                    {localAccounts.map((la) => (
                      <SelectItem key={la.id} value={la.id}>{la.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {discovered?.accounts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conta descoberta.</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setDiscovered(null)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conexão bancária</AlertDialogTitle>
            <AlertDialogDescription>
              A conexão com <strong>{deleting?.institution_name}</strong> será removida. Lançamentos já importados serão mantidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
