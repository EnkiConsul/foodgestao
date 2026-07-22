import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  WifiOff,
  Clock,
  Webhook,
  Search,
  Landmark,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { formatDate } from "@/lib/date-utils";

type Connection = {
  id: string;
  user_id: string;
  company_id: string | null;
  context: "pf" | "pj";
  provider_item_id: string;
  institution_name: string | null;
  institution_logo_url: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  consent_expires_at: string | null;
  created_at: string;
};

type WebhookEvent = {
  id: string;
  event_type: string;
  item_id: string | null;
  payload: Record<string, unknown>;
  received_at: string;
  processed_at: string | null;
  error: string | null;
};

const statusMeta: Record<string, { label: string; className: string; icon?: React.ReactNode }> = {
  active: { label: "Ativa", className: "bg-success/10 text-success border-success/20", icon: <CheckCircle2 className="h-3 w-3" /> },
  updated: { label: "Ativa", className: "bg-success/10 text-success border-success/20", icon: <CheckCircle2 className="h-3 w-3" /> },
  creating: { label: "Configurando", className: "bg-primary/10 text-primary border-primary/20", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  updating: { label: "Atualizando", className: "bg-primary/10 text-primary border-primary/20", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  outdated: { label: "Desatualizada", className: "bg-warning/10 text-warning border-warning/20", icon: <AlertTriangle className="h-3 w-3" /> },
  waiting_user_input: { label: "Ação necessária", className: "bg-warning/10 text-warning border-warning/20", icon: <AlertTriangle className="h-3 w-3" /> },
  login_error: { label: "Credenciais expiradas", className: "bg-destructive/10 text-destructive border-destructive/20", icon: <WifiOff className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={`gap-1 ${meta.className}`}>
      {meta.icon}
      {meta.label}
    </Badge>
  );
}

export default function AdminOpenFinance() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailsFor, setDetailsFor] = useState<Connection | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const connectionsQuery = useQuery({
    queryKey: ["admin-open-finance-connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_connections")
        .select("id,user_id,company_id,context,provider_item_id,institution_name,institution_logo_url,status,last_sync_at,last_error,consent_expires_at,created_at")
        .eq("provider", "pluggy")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Connection[];
    },
    refetchInterval: 30_000,
  });

  const connections = connectionsQuery.data ?? [];
  const itemIds = useMemo(() => connections.map((c) => c.provider_item_id).filter(Boolean), [connections]);

  // Últimos 500 eventos de webhook — quantidade pequena, single-query.
  const eventsQuery = useQuery({
    queryKey: ["admin-open-finance-events", itemIds.sort().join(",")],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pluggy_webhook_events")
        .select("id,event_type,item_id,payload,received_at,processed_at,error")
        .in("item_id", itemIds)
        .order("received_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as WebhookEvent[];
    },
    refetchInterval: 30_000,
  });

  const eventsByItem = useMemo(() => {
    const map = new Map<string, WebhookEvent[]>();
    for (const ev of eventsQuery.data ?? []) {
      if (!ev.item_id) continue;
      const list = map.get(ev.item_id) ?? [];
      list.push(ev);
      map.set(ev.item_id, list);
    }
    return map;
  }, [eventsQuery.data]);

  const summary = useMemo(() => {
    const total = connections.length;
    const errors = connections.filter((c) => c.status === "login_error").length;
    const attention = connections.filter((c) => ["outdated", "waiting_user_input"].includes(c.status)).length;
    const updating = connections.filter((c) => ["updating", "creating"].includes(c.status)).length;
    const totalEvents = eventsQuery.data?.length ?? 0;
    return { total, errors, attention, updating, totalEvents };
  }, [connections, eventsQuery.data]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return connections.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!s) return true;
      return (
        (c.institution_name ?? "").toLowerCase().includes(s) ||
        c.provider_item_id.toLowerCase().includes(s) ||
        c.user_id.toLowerCase().includes(s)
      );
    });
  }, [connections, statusFilter, search]);

  async function handleSync(conn: Connection, mode: "full" | "reimport" = "full") {
    setSyncingId(conn.id + ":" + mode);
    try {
      const { data, error } = await supabase.functions.invoke("pluggy-sync-connection", {
        body: {
          connectionId: conn.id,
          ...(mode === "reimport" ? { skipItemUpdate: true, source: "admin" } : {}),
        },
      });
      if (error) throw error;
      const res = data as {
        imported: number;
        error: string | null;
        needsReconnect?: boolean;
        itemUpdateTriggered?: boolean;
        perAccount?: Array<{ imported: number; error?: string }>;
      };
      const errs = (res.perAccount ?? []).filter((p) => p.error).length;
      if (res.needsReconnect) toast.error("Requer reconexão pelo usuário");
      else if (res.itemUpdateTriggered) toast.info("Coleta iniciada na Pluggy. Aguarde webhook.");
      else if (res.imported > 0) toast.success(`Importados ${res.imported} lançamentos${errs ? ` · ${errs} conta(s) com aviso` : ""}`);
      else if (res.error) toast.error(res.error);
      else toast.info(`Nenhum lançamento novo${errs ? ` · ${errs} conta(s) com aviso` : ""}`);
      connectionsQuery.refetch();
      eventsQuery.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncingId(null);
    }
  }

  const detailEvents = detailsFor ? eventsByItem.get(detailsFor.provider_item_id) ?? [] : [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Diagnóstico Open Finance"
        description="Status, webhooks e tentativas de sincronização por conexão Pluggy."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile icon={<Landmark className="h-4 w-4" />} label="Conexões" value={summary.total} />
        <StatTile icon={<Loader2 className="h-4 w-4 text-primary" />} label="Em atualização" value={summary.updating} tone="primary" />
        <StatTile icon={<AlertTriangle className="h-4 w-4 text-warning" />} label="Requer atenção" value={summary.attention} tone="warning" />
        <StatTile icon={<WifiOff className="h-4 w-4 text-destructive" />} label="Com erro" value={summary.errors} tone="danger" />
        <StatTile icon={<Webhook className="h-4 w-4" />} label="Webhooks (últimos 500)" value={summary.totalEvents} />
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por instituição, item Pluggy ou user_id"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="updated">Ativa (updated)</SelectItem>
                <SelectItem value="updating">Atualizando</SelectItem>
                <SelectItem value="waiting_user_input">Ação necessária</SelectItem>
                <SelectItem value="outdated">Desatualizada</SelectItem>
                <SelectItem value="login_error">Credenciais expiradas</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                connectionsQuery.refetch();
                eventsQuery.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instituição</TableHead>
                  <TableHead>Contexto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última sync</TableHead>
                  <TableHead>Último webhook</TableHead>
                  <TableHead className="text-right">Eventos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectionsQuery.isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma conexão encontrada.</TableCell></TableRow>
                ) : (
                  filtered.map((conn) => {
                    const evs = eventsByItem.get(conn.provider_item_id) ?? [];
                    const lastEv = evs[0];
                    const errCount = evs.filter((e) => e.error).length;
                    return (
                      <TableRow key={conn.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            {conn.institution_logo_url ? (
                              <img src={conn.institution_logo_url} alt="" className="h-6 w-6 rounded object-contain bg-muted" />
                            ) : (
                              <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center">
                                <Landmark className="h-3.5 w-3.5 text-primary" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{conn.institution_name ?? "—"}</p>
                              <p className="text-[10px] text-muted-foreground font-mono truncate">{conn.provider_item_id}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {conn.context.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={conn.status} />
                            {conn.last_error && (
                              <p className="text-[10px] text-destructive line-clamp-2 max-w-xs">{conn.last_error}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {conn.last_sync_at ? (
                            <div>
                              <Clock className="h-3 w-3 inline mr-1 text-muted-foreground" />
                              {formatDate(conn.last_sync_at, "dd/MM HH:mm")}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {lastEv ? (
                            <div>
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted">{lastEv.event_type}</span>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {formatDate(lastEv.received_at, "dd/MM HH:mm")}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Nenhum</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-sm font-semibold">{evs.length}</span>
                            {errCount > 0 && (
                              <span className="text-[10px] text-destructive">{errCount} c/ erro</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDetailsFor(conn)}
                              title="Ver detalhes"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={syncingId === conn.id}
                              onClick={() => handleSync(conn)}
                              title="Sincronizar agora"
                            >
                              <RefreshCw className={`h-4 w-4 ${syncingId === conn.id ? "animate-spin" : ""}`} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detailsFor} onOpenChange={(o) => !o && setDetailsFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailsFor?.institution_logo_url ? (
                <img src={detailsFor.institution_logo_url} alt="" className="h-6 w-6 rounded object-contain bg-muted" />
              ) : (
                <Landmark className="h-5 w-5" />
              )}
              {detailsFor?.institution_name ?? "Conexão"}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              item {detailsFor?.provider_item_id} · connection {detailsFor?.id}
            </DialogDescription>
          </DialogHeader>

          {detailsFor && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <InfoTile label="Status" value={<StatusBadge status={detailsFor.status} />} />
                <InfoTile label="Contexto" value={detailsFor.context.toUpperCase()} />
                <InfoTile label="Última sync" value={detailsFor.last_sync_at ? formatDate(detailsFor.last_sync_at, "dd/MM/yyyy HH:mm") : "—"} />
                <InfoTile label="Consentimento até" value={detailsFor.consent_expires_at ? formatDate(detailsFor.consent_expires_at, "dd/MM/yyyy") : "—"} />
              </div>

              {detailsFor.last_error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <p className="font-medium flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Último motivo de erro
                  </p>
                  <p className="mt-1 text-xs">{detailsFor.last_error}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold mb-2 flex items-center gap-1">
                  <Webhook className="h-3.5 w-3.5" />
                  Histórico de webhooks ({detailEvents.length})
                </p>
                <div className="max-h-96 overflow-y-auto rounded-md border divide-y">
                  {detailEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-4 text-center">
                      Nenhum webhook recebido para este item ainda.
                    </p>
                  ) : (
                    detailEvents.map((ev) => (
                      <details key={ev.id} className="p-2 text-xs">
                        <summary className="cursor-pointer flex items-center gap-2 flex-wrap">
                          <span className="font-mono px-1.5 py-0.5 rounded bg-muted">{ev.event_type}</span>
                          <span className="text-muted-foreground">{formatDate(ev.received_at, "dd/MM/yyyy HH:mm:ss")}</span>
                          {ev.error && <span className="text-destructive">erro: {ev.error}</span>}
                          {ev.processed_at && (
                            <span className="text-success text-[10px]">processado</span>
                          )}
                        </summary>
                        <pre className="mt-2 bg-muted/50 rounded p-2 overflow-x-auto text-[10px] leading-tight">
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
                      </details>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "muted" | "primary" | "warning" | "danger";
}) {
  const toneClass = {
    muted: "border-border bg-muted/30",
    primary: "border-primary/20 bg-primary/5",
    warning: "border-warning/30 bg-warning/5",
    danger: "border-destructive/30 bg-destructive/5",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
