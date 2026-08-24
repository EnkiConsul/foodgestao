import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PluggyConnectDialog, hasPluggyReturn } from "@/components/accounts/PluggyConnectDialog";
import { PluggyPendingConnectionAlert } from "@/components/accounts/PluggyPendingConnectionAlert";
import { PluggyCreditCardReviewDialog } from "@/components/credit-cards/PluggyCreditCardReviewDialog";
import { usePluggyCreditReview } from "@/hooks/usePluggyCreditReview";
import { ArrowLeft, Plus, RefreshCw, Trash2, RotateCw, Loader2, CreditCard as CreditCardIcon } from "lucide-react";

import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Connection {
  id: string;
  pluggy_item_id: string;
  connector_id: number | null;
  connector_name: string | null;
  connector_image_url: string | null;
  status: string;
  last_synced_at: string | null;
  last_sync_attempt_at: string | null;
  next_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  last_error: any;
}

/**
 * Uma nova autorização do mesmo banco cria um novo item na Pluggy. Para não
 * exibir o mesmo banco duas vezes, mantemos apenas a conexão mais recente por
 * banco (preferindo as que não estão encerradas).
 */
function dedupeByConnector(list: Connection[]): Connection[] {
  const kept = new Map<string, Connection>();
  for (const c of list) {
    const key = c.connector_id != null ? `id:${c.connector_id}` : `name:${c.connector_name ?? c.id}`;
    const prev = kept.get(key);
    if (!prev) { kept.set(key, c); continue; }
    const prevDeleted = prev.status === "deleted";
    const curDeleted = c.status === "deleted";
    if (prevDeleted && !curDeleted) kept.set(key, c);
  }
  return Array.from(kept.values());
}


interface AccountsMap { [connId: string]: { count: number; pending: number; paused: number } }

const statusLabels: Record<string, { label: string; className: string }> = {
  updated: { label: "Atualizado", className: "bg-success/15 text-success border-success/30" },
  updating: { label: "Atualizando", className: "bg-primary/15 text-primary border-primary/30" },
  created: { label: "Criado", className: "bg-muted text-muted-foreground border-muted-foreground/20" },
  login_error: { label: "Erro de login", className: "bg-destructive/15 text-destructive border-destructive/30" },
  outdated: { label: "Desatualizado", className: "bg-warning/15 text-warning border-warning/30" },
  error: { label: "Erro", className: "bg-destructive/15 text-destructive border-destructive/30" },
  waiting_user_input: { label: "Aguarda MFA", className: "bg-warning/15 text-warning border-warning/30" },
  deleted: { label: "Encerrada — reconectar", className: "bg-muted text-muted-foreground border-muted-foreground/20" },
};

function fmtDateTime(v: string | null | undefined) {
  if (!v) return null;
  try { return format(new Date(v), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); }
  catch { return v; }
}

function SyncInfo({ connection: c }: { connection: Connection }) {
  const lastAt = c.last_synced_at ?? c.last_sync_attempt_at;
  const lastLabel = lastAt
    ? formatDistanceToNow(new Date(lastAt), { locale: ptBR, addSuffix: true })
    : "nunca";
  const nextLabel = c.next_sync_at
    ? formatDistanceToNow(new Date(c.next_sync_at), { locale: ptBR, addSuffix: true })
    : null;
  const failed = c.last_sync_status && c.last_sync_status !== "success";

  return (
    <TooltipProvider delayDuration={200}>
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={failed ? "text-warning" : ""}>
              Última sincronização: {lastLabel}
              {failed && c.last_sync_error ? ` (${c.last_sync_error})` : ""}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            <p>Última sincronização: {fmtDateTime(lastAt) ?? "—"}</p>
            {c.next_sync_at && <p>Próxima programada: {fmtDateTime(c.next_sync_at) ?? "—"}</p>}
            {c.last_sync_status && <p>Status: {c.last_sync_status}</p>}
          </TooltipContent>
        </Tooltip>
        {nextLabel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>· Próxima: {nextLabel}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {fmtDateTime(c.next_sync_at) ?? "—"}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </TooltipProvider>
  );
}

export default function ConexoesPluggy() {
  const navigate = useNavigate();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [meta, setMeta] = useState<AccountsMap>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  // Retorno do consentimento de Open Finance (?itemId=…) precisa abrir o
  // diálogo para concluir a conexão em vez de exigir um novo clique.
  const [connectOpen, setConnectOpen] = useState(() => hasPluggyReturn());

  const [reconnectItemId, setReconnectItemId] = useState<string | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Connection | null>(null);
  const [creditReviewOpen, setCreditReviewOpen] = useState(false);
  const [confirmCancelPending, setConfirmCancelPending] = useState(false);
  const [cancelingPending, setCancelingPending] = useState(false);
  const { pending: pendingCredit, reload: reloadPendingCredit } = usePluggyCreditReview();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!selectedCompanyId) return;
    if (!opts?.silent) setLoading(true);

    const { data: conns } = await supabase.from("pluggy_connections")
      .select("id, pluggy_item_id, connector_id, connector_name, connector_image_url, status, last_synced_at, last_sync_attempt_at, next_sync_at, last_sync_status, last_sync_error, last_error")
      .eq("company_id", selectedCompanyId).order("created_at", { ascending: false });

    // Conexões encerradas (ou sem nenhuma conta restante) foram excluídas pelo
    // usuário e não devem voltar à lista — a reconexão é feita pelo botão de
    // conectar banco.
    const ativas = ((conns ?? []) as Connection[]).filter((c) => c.status !== "deleted");
    const contagens = await Promise.all(
      ativas.map((c) =>
        supabase.from("pluggy_accounts").select("id", { head: true, count: "exact" }).eq("connection_id", c.id),
      ),
    );
    const comContas = ativas.filter((_, i) => (contagens[i].count ?? 0) > 0);
    const list = dedupeByConnector(comContas);
    setConnections(list);



    const { count: pending } = await supabase
      .from("pluggy_connect_requests")
      .select("id", { head: true, count: "exact" })
      .eq("company_id", selectedCompanyId)
      .eq("status", "open")
      .gt("expires_at", new Date().toISOString());
    setPendingCount(pending ?? 0);

    const m: AccountsMap = {};
    for (const c of list) {
      const [{ count: accCount }, { count: pending }, { count: paused }] = await Promise.all([
        supabase.from("pluggy_accounts").select("id", { head: true, count: "exact" }).eq("connection_id", c.id),
        supabase.from("pluggy_staging_transactions").select("id", { head: true, count: "exact" }).eq("connection_id", c.id).eq("status", "pending"),
        supabase.from("pluggy_accounts").select("id", { head: true, count: "exact" }).eq("connection_id", c.id).not("sync_paused_at", "is", null),
      ]);
      m[c.id] = { count: accCount ?? 0, pending: pending ?? 0, paused: paused ?? 0 };
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
    reloadPendingCredit();
  };

  // Autorizações que ficaram presas (usuário desistiu no app do banco) podem ser
  // canceladas para limpar o aviso de "Conexão em andamento".
  const cancelarPendentes = async () => {
    if (!selectedCompanyId) return;
    setCancelingPending(true);
    const anterior = pendingCount;
    const { data, error } = await supabase.rpc("pluggy_cancel_connect_requests", {
      _company_id: selectedCompanyId,
    });
    if (error) {
      setCancelingPending(false);
      setConfirmCancelPending(false);
      const motivo = (error.message ?? "").toLowerCase();
      let texto = "Não foi possível cancelar a conexão em andamento.";
      if (motivo.includes("not_authenticated")) {
        texto += " Sua sessão expirou. Faça login novamente.";
      } else if (motivo.includes("forbidden")) {
        texto += " Você não tem permissão para cancelar esta autorização.";
      } else if (error.message) {
        texto += ` Motivo: ${error.message}`;
      }
      toast.error(texto);
      return;
    }
    // Atualização otimista: o aviso de "Conexão em andamento" sai da tela na hora,
    // e a lista é revalidada em seguida sem piscar o skeleton.
    setPendingCount(0);
    setConfirmCancelPending(false);
    const canceladas = (data as number | null) ?? anterior;
    toast.success(
      canceladas > 1 ? `${canceladas} autorizações canceladas` : "Conexão em andamento cancelada",
    );
    await load({ silent: true });
    setCancelingPending(false);
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
        <Button onClick={() => { setReconnectItemId(undefined); setConnectOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Conectar banco
        </Button>
      </div>

      {!loading && pendingCount > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-warning" />
            <div className="text-sm">
              <p className="font-semibold">Conexão em andamento</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Há {pendingCount} autorização(ões) iniciada(s) aguardando a confirmação do banco.
                Se você autorizou pelo app do banco (QR Code), a conexão pode levar alguns minutos
                para aparecer. Use <strong>Atualizar</strong> abaixo ou tente novamente em instantes.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-7" onClick={() => load()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-destructive hover:text-destructive"
                  disabled={cancelingPending}
                  onClick={() => setConfirmCancelPending(true)}
                >
                  {cancelingPending
                    ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    : <X className="h-3.5 w-3.5 mr-1" />}
                  Cancelar conexão
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && pendingCredit.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <CreditCardIcon className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">
                {pendingCredit.length} cartão(ões) de crédito detectado(s)
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Encontramos cartões nas contas conectadas. Eles só serão cadastrados após sua autorização.
              </p>
            </div>
            <Button size="sm" onClick={() => setCreditReviewOpen(true)}>Revisar e autorizar</Button>
          </CardContent>
        </Card>
      )}


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
            const m = meta[c.id] ?? { count: 0, pending: 0, paused: 0 };
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
                      {m.paused > 0 && (
                        <Badge variant="outline" className="text-muted-foreground">
                          {m.paused === m.count
                            ? "Sincronização pausada"
                            : `${m.paused} conta(s) pausada(s)`}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {m.count} conta(s) ·{" "}
                      <SyncInfo connection={c} />
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

      <PluggyCreditCardReviewDialog
        open={creditReviewOpen}
        onOpenChange={setCreditReviewOpen}
        accounts={pendingCredit}
        onDone={() => { reloadPendingCredit(); load(); }}
      />



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

      <AlertDialog open={confirmCancelPending} onOpenChange={setConfirmCancelPending}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a conexão em andamento?</AlertDialogTitle>
            <AlertDialogDescription>
              A autorização iniciada será descartada e o aviso desaparece. Se o banco confirmar
              depois, será necessário iniciar a conexão novamente em <strong>Conectar banco</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={cancelarPendentes}
            >
              Cancelar conexão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}

