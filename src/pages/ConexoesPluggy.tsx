import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PluggyConnectDialog } from "@/components/accounts/PluggyConnectDialog";
import { ArrowLeft, Plus, RefreshCw, Trash2, RotateCw, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Connection {
  id: string;
  pluggy_item_id: string;
  connector_name: string | null;
  connector_image_url: string | null;
  status: string;
  last_synced_at: string | null;
  last_error: any;
}

interface AccountsMap { [connId: string]: { count: number; pending: number } }

const statusLabels: Record<string, { label: string; className: string }> = {
  updated: { label: "Atualizado", className: "bg-success/15 text-success border-success/30" },
  updating: { label: "Atualizando", className: "bg-primary/15 text-primary border-primary/30" },
  created: { label: "Criado", className: "bg-muted text-muted-foreground border-muted-foreground/20" },
  login_error: { label: "Erro de login", className: "bg-destructive/15 text-destructive border-destructive/30" },
  outdated: { label: "Desatualizado", className: "bg-warning/15 text-warning border-warning/30" },
  error: { label: "Erro", className: "bg-destructive/15 text-destructive border-destructive/30" },
  waiting_user_input: { label: "Aguarda MFA", className: "bg-warning/15 text-warning border-warning/30" },
  deleted: { label: "Removido", className: "bg-muted text-muted-foreground border-muted-foreground/20" },
};

export default function ConexoesPluggy() {
  const navigate = useNavigate();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [meta, setMeta] = useState<AccountsMap>({});
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [reconnectItemId, setReconnectItemId] = useState<string | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Connection | null>(null);

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const { data: conns } = await supabase.from("pluggy_connections")
      .select("id, pluggy_item_id, connector_name, connector_image_url, status, last_synced_at, last_error")
      .eq("company_id", selectedCompanyId).order("created_at", { ascending: false });

    const list = (conns ?? []) as Connection[];
    setConnections(list);

    const m: AccountsMap = {};
    for (const c of list) {
      const [{ count: accCount }, { count: pending }] = await Promise.all([
        supabase.from("pluggy_accounts").select("id", { head: true, count: "exact" }).eq("connection_id", c.id),
        supabase.from("pluggy_staging_transactions").select("id", { head: true, count: "exact" }).eq("connection_id", c.id).eq("status", "pending"),
      ]);
      m[c.id] = { count: accCount ?? 0, pending: pending ?? 0 };
    }
    setMeta(m);
    setLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => { load(); }, [load]);

  const sync = async (c: Connection) => {
    setSyncingId(c.id);
    const { data, error } = await supabase.functions.invoke("pluggy-sync-item", {
      body: { item_id: c.pluggy_item_id, company_id: selectedCompanyId },
    });
    setSyncingId(null);
    if (error) { toast.error("Falha ao sincronizar"); return; }
    toast.success(`Sincronização concluída (${data?.transactions ?? 0} lançamentos)`);
    load();
  };

  const disconnect = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.functions.invoke("pluggy-disconnect-item", {
      body: { connection_id: confirmDelete.id },
    });
    if (error) { toast.error("Falha ao desconectar"); return; }
    toast.success("Conexão removida");
    setConfirmDelete(null);
    load();
  };

  if (contextType !== "pj") {
    return (
      <Card><CardContent className="p-6 text-sm text-muted-foreground">
        Conexões Open Finance estão disponíveis apenas no contexto empresa (PJ).
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/contas-bancarias")} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Conexões Open Finance</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os bancos conectados via Pluggy e sincronize lançamentos.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/contas-bancarias/conciliacao")}>
          Ir para conciliação
        </Button>
        <Button onClick={() => { setReconnectItemId(undefined); setConnectOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Conectar banco
        </Button>
      </div>

      <WebhookConfigCard />



      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : connections.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          Nenhum banco conectado ainda. Clique em <strong>Conectar banco</strong> para começar.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {connections.map((c) => {
            const st = statusLabels[c.status] ?? { label: c.status, className: "" };
            const m = meta[c.id] ?? { count: 0, pending: 0 };
            const isLoginErr = c.status === "login_error" || c.status === "waiting_user_input";
            return (
              <Card key={c.id}>
                <CardContent className="p-4 flex items-center gap-4">
                  {c.connector_image_url ? (
                    <img src={c.connector_image_url} alt="" className="h-10 w-10 rounded object-contain bg-muted" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{c.connector_name ?? "Banco"}</p>
                      <Badge variant="outline" className={st.className}>{st.label}</Badge>
                      {m.pending > 0 && (
                        <Badge className="bg-warning/15 text-warning border-warning/30">
                          {m.pending} pendente(s)
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {m.count} conta(s) · Última sincronização:{" "}
                      {c.last_synced_at
                        ? formatDistanceToNow(new Date(c.last_synced_at), { locale: ptBR, addSuffix: true })
                        : "nunca"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isLoginErr && (
                      <Button size="sm" variant="outline" onClick={() => { setReconnectItemId(c.pluggy_item_id); setConnectOpen(true); }}>
                        <RotateCw className="h-4 w-4 mr-1" /> Reconectar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => sync(c)} disabled={syncingId === c.id}>
                      {syncingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(c)} aria-label="Desconectar">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedCompanyId && (
        <PluggyConnectDialog
          open={connectOpen}
          onOpenChange={setConnectOpen}
          companyId={selectedCompanyId}
          itemIdToUpdate={reconnectItemId}
          onConnected={() => load()}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar {confirmDelete?.connector_name ?? "banco"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove a conexão no Open Finance e apaga os lançamentos pendentes de conciliação.
              Lançamentos já confirmados são mantidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={disconnect}>
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WebhookConfigCard() {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pluggy-webhook-config");
      if (error) {
        const status = (error as any)?.context?.status;
        if (status === 403) { setForbidden(true); return; }
        throw error;
      }
      setUrl(data?.url ?? null);
      setBaseUrl(data?.base_url ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível carregar a URL do webhook");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (forbidden) return null;

  const masked = url ? url.replace(/(secret=)[^&]+/, "$1••••••••") : "";
  const shown = reveal ? url : masked;

  const copy = async (value: string | null) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); toast.success("Copiado"); }
    catch { toast.error("Falha ao copiar"); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Webhook da Pluggy</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Cole a URL abaixo no painel da Pluggy em <strong>Applications → Webhooks</strong>. Ela inclui
          o segredo <code>PLUGGY_WEBHOOK_SECRET</code> como query string e é validada em cada evento.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
          </div>
        ) : url ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{shown}</code>
              <Button size="sm" variant="ghost" onClick={() => setReveal((r) => !r)} aria-label={reveal ? "Ocultar" : "Mostrar"}>
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => copy(url)} aria-label="Copiar URL completa">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {baseUrl && (
              <p className="text-[11px] text-muted-foreground">
                URL base (sem segredo): <code>{baseUrl}</code>
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-destructive">URL indisponível.</p>
        )}
      </CardContent>
    </Card>
  );
}

