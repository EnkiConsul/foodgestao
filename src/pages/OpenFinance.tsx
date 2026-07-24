import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Plug, RefreshCw, Trash2, AlertTriangle, CheckCircle2, Landmark, Link2, DownloadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  useOpenFinanceConnections,
  useDeletePluggyItem,
  useTriggerPluggySync,
  type OpenFinanceConnection,
} from "@/hooks/useOpenFinance";
import { PluggyConnectLauncher } from "@/components/open-finance/PluggyConnectLauncher";
import { AccountMappingDialog } from "@/components/open-finance/AccountMappingDialog";
import { PairingReviewSection } from "@/components/open-finance/PairingReviewSection";

function PageHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function statusBadge(conn: OpenFinanceConnection) {
  if (!conn.is_active) return <Badge variant="outline">Desconectado</Badge>;
  if (conn.needs_reconnect)
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="w-3 h-3" /> Reconectar
      </Badge>
    );
  const s = String(conn.item_status ?? "").toUpperCase();
  if (s === "UPDATED")
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20">
        <CheckCircle2 className="w-3 h-3" /> Sincronizado
      </Badge>
    );
  if (s === "UPDATING") return <Badge variant="secondary">Sincronizando…</Badge>;
  return <Badge variant="secondary">{conn.item_status ?? "Pendente"}</Badge>;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "—";
  }
}

export default function OpenFinance() {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const isPJ = contextType === "pj" && !!selectedCompanyId;
  const { data: connections, isLoading } = useOpenFinanceConnections(isPJ ? selectedCompanyId : null);
  const deleteItem = useDeletePluggyItem();
  const triggerSync = useTriggerPluggySync();

  const [launcher, setLauncher] = useState<{
    mode: "create" | "update" | "renew_consent";
    connectionId?: string;
  } | null>(null);
  const [mapping, setMapping] = useState<{ connectionId: string; institutionName: string | null } | null>(null);

  if (!isPJ) {
    return (
      <div className="p-6 space-y-4">
        <PageHeader title="Open Finance" subtitle="Conecte seus bancos via Pluggy" />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            A integração via Open Finance está disponível apenas no contexto <strong>PJ</strong>.
            Selecione uma empresa no seletor de contexto para continuar.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Open Finance"
        subtitle="Conecte seus bancos e cartões via Pluggy para importar lançamentos automaticamente."
        actions={
          <Button onClick={() => setLauncher({ mode: "create" })}>
            <Plug className="w-4 h-4 mr-2" /> Conectar banco
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando conexões…
        </div>
      ) : !connections || connections.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Landmark className="w-10 h-10 mx-auto text-muted-foreground" />
            <div className="text-sm text-muted-foreground max-w-md mx-auto">
              Nenhum banco conectado ainda. Ao conectar, buscaremos automaticamente contas,
              cartões e lançamentos dos últimos períodos.
            </div>
            <Button onClick={() => setLauncher({ mode: "create" })}>
              <Plug className="w-4 h-4 mr-2" /> Conectar primeiro banco
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {connections.map((c) => (
            <Card key={c.id} className={c.needs_reconnect ? "border-destructive/40" : ""}>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <div className="flex items-center gap-3 min-w-0">
                  {c.institution_logo_url ? (
                    <img
                      src={c.institution_logo_url}
                      alt=""
                      className="w-10 h-10 rounded-md object-contain bg-muted"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                      <Landmark className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">
                      {c.institution_name ?? "Banco"}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground">
                      Última sincronização {timeAgo(c.last_sync_at)}
                    </div>
                  </div>
                </div>
                {statusBadge(c)}
              </CardHeader>
              <CardContent className="space-y-3">
                {c.provider_error_message && (
                  <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
                    {c.provider_error_message}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => triggerSync.mutate({ connection_id: c.id })}
                    disabled={!c.is_active || c.needs_reconnect || triggerSync.isPending}
                  >
                    {triggerSync.isPending && triggerSync.variables?.connection_id === c.id ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <DownloadCloud className="w-4 h-4 mr-2" />
                    )}
                    Sincronizar agora
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMapping({ connectionId: c.id, institutionName: c.institution_name })}
                    disabled={!c.is_active}
                  >
                    <Link2 className="w-4 h-4 mr-2" /> Vincular contas
                  </Button>
                  <Button
                    size="sm"
                    variant={c.needs_reconnect ? "default" : "outline"}
                    onClick={() =>
                      setLauncher({
                        mode: c.needs_reconnect ? "update" : "renew_consent",
                        connectionId: c.id,
                      })
                    }
                    disabled={!c.is_active}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {c.needs_reconnect ? "Reconectar" : "Renovar consentimento"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" /> Desconectar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Desconectar {c.institution_name ?? "banco"}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Os lançamentos já importados serão preservados, mas nenhum novo
                          lançamento será trazido automaticamente até você reconectar.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteItem.mutate({ connection_id: c.id })}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Desconectar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PairingReviewSection companyId={selectedCompanyId!} />

      <PluggyConnectLauncher
        companyId={selectedCompanyId!}
        mode={launcher?.mode ?? "create"}
        connectionId={launcher?.connectionId}
        open={!!launcher}
        onClose={() => setLauncher(null)}
      />

      <AccountMappingDialog
        open={!!mapping}
        onClose={() => setMapping(null)}
        connectionId={mapping?.connectionId ?? null}
        companyId={selectedCompanyId!}
        institutionName={mapping?.institutionName ?? null}
      />
    </div>
  );
}
