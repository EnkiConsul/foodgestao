import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Link as LinkIcon, AlertTriangle, CheckCircle2, Clock, Landmark } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmtDate = (v: string | null | undefined) =>
  v ? format(new Date(v), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  connected: "default",
  active: "default",
  awaiting_authorization: "secondary",
  processing: "secondary",
  materializing: "secondary",
  token_created: "secondary",
  created: "outline",
  pending: "secondary",
  retry: "outline",
  processed: "default",
  failed: "destructive",
  disconnected: "outline",
  error: "destructive",
  cancelled: "outline",
};

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="outline">—</Badge>;
  return <Badge variant={statusVariant[status] ?? "outline"}>{status}</Badge>;
}

type ConnectionRow = {
  id: string;
  company_id: string;
  pluggy_item_id: string | null;
  connector_id: number | null;
  connector_name: string | null;
  status: string | null;
  execution_status: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  requires_user_action: boolean | null;
  last_synced_at: string | null;
  consent_expires_at: string | null;
  created_at: string;
  updated_at: string;
  disconnected_at: string | null;
};

type WebhookEventRow = {
  id: string;
  event_id: string;
  event_type: string;
  pluggy_item_id: string | null;
  status: string;
  attempt_count: number;
  last_error_code: string | null;
  next_attempt_at: string | null;
  connection_id: string | null;
  company_id: string | null;
  created_at: string;
  processed_at: string | null;
};

type RequestRow = {
  id: string;
  company_id: string;
  pluggy_item_id: string | null;
  status: string;
  mode: string | null;
  error_code: string | null;
  correlation_expires_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

type AccountRow = {
  id: string;
  connection_id: string;
  pluggy_account_id: string;
  name: string | null;
  number: string | null;
  type: string | null;
  subtype: string | null;
  balance: number | null;
  local_account_id: string | null;
  removed_at: string | null;
  last_transaction_at: string | null;
};

export default function AdminPluggyConexoes() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ConnectionRow | null>(null);

  const connectionsQ = useQuery({
    queryKey: ["admin-pluggy-connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("open_finance_connections")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ConnectionRow[];
    },
  });

  const webhookQ = useQuery({
    queryKey: ["admin-pluggy-webhooks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("open_finance_webhook_events")
        .select("id,event_id,event_type,pluggy_item_id,status,attempt_count,last_error_code,next_attempt_at,connection_id,company_id,created_at,processed_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as WebhookEventRow[];
    },
  });

  const requestsQ = useQuery({
    queryKey: ["admin-pluggy-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("open_finance_connection_requests")
        .select("id,company_id,pluggy_item_id,status,mode,error_code,correlation_expires_at,completed_at,cancelled_at,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as RequestRow[];
    },
  });

  const accountsQ = useQuery({
    queryKey: ["admin-pluggy-accounts", detail?.id],
    enabled: !!detail?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("open_finance_accounts")
        .select("id,connection_id,pluggy_account_id,name,number,type,subtype,balance,local_account_id,removed_at,last_transaction_at")
        .eq("connection_id", detail!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AccountRow[];
    },
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-pluggy-connections"] });
    qc.invalidateQueries({ queryKey: ["admin-pluggy-webhooks"] });
    qc.invalidateQueries({ queryKey: ["admin-pluggy-requests"] });
  };

  const q = search.trim().toLowerCase();
  const filterFn = <T extends Record<string, unknown>>(rows: T[], keys: (keyof T)[]) =>
    !q ? rows : rows.filter((r) => keys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)));

  const conns = filterFn(connectionsQ.data ?? [], ["pluggy_item_id", "connector_name", "status", "company_id"]);
  const events = filterFn(webhookQ.data ?? [], ["event_type", "pluggy_item_id", "status", "company_id"]);
  const requests = filterFn(requestsQ.data ?? [], ["pluggy_item_id", "status", "company_id", "mode"]);

  const pendingCount = (webhookQ.data ?? []).filter((e) => e.status === "pending" || e.status === "retry").length;
  const failedCount = (webhookQ.data ?? []).filter((e) => e.status === "failed").length;
  const connectedCount = (connectionsQ.data ?? []).filter(
    (c) => c.status === "connected" || c.status === "active" || c.status === null && !c.disconnected_at,
  ).length;

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        title="Conexões Pluggy"
        description="Estados de conexões Open Finance, requests e eventos de webhook."
        actions={
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={connectionsQ.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${connectionsQ.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conexões ativas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{connectedCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Webhooks pendentes/retry</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{pendingCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Webhooks falhos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{failedCount}</div></CardContent>
        </Card>
      </div>

      <Input
        placeholder="Buscar por item id, conector, status ou empresa..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">Conexões ({conns.length})</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks ({events.length})</TabsTrigger>
          <TabsTrigger value="requests">Solicitações ({requests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="connections">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item / Conector</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Último sync</TableHead>
                    <TableHead>Consentimento</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-mono text-xs">{c.pluggy_item_id ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{c.connector_name ?? `#${c.connector_id ?? "—"}`}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.company_id.slice(0, 8)}…</TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                        {c.requires_user_action && (
                          <Badge variant="destructive" className="ml-2">ação</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{c.last_error_code ?? "—"}</TableCell>
                      <TableCell className="text-xs">{fmtDate(c.last_synced_at)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(c.consent_expires_at)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setDetail(c)}>
                          <LinkIcon className="h-4 w-4 mr-1" /> Contas
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {conns.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma conexão.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tent.</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Próx. tentativa</TableHead>
                    <TableHead>Recebido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{e.event_type}</TableCell>
                      <TableCell className="font-mono text-xs">{e.pluggy_item_id ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={e.status} /></TableCell>
                      <TableCell className="text-xs">{e.attempt_count}</TableCell>
                      <TableCell className="text-xs">{e.last_error_code ?? "—"}</TableCell>
                      <TableCell className="text-xs">{fmtDate(e.next_attempt_at)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(e.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {events.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum evento.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Solicitação</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Criada</TableHead>
                    <TableHead>Concluída</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id.slice(0, 8)}…</TableCell>
                      <TableCell className="font-mono text-xs">{r.company_id.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs">{r.mode ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="font-mono text-xs">{r.pluggy_item_id ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.error_code ?? "—"}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.completed_at ?? r.cancelled_at)}</TableCell>
                    </TableRow>
                  ))}
                  {requests.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma solicitação.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Contas — {detail?.connector_name ?? detail?.pluggy_item_id}
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-2">
            Item: <span className="font-mono">{detail?.pluggy_item_id ?? "—"}</span> · Empresa:{" "}
            <span className="font-mono">{detail?.company_id}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Nº</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Última tx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(accountsQ.data ?? []).map((a) => (
                <TableRow key={a.id} className={a.removed_at ? "opacity-50" : ""}>
                  <TableCell className="text-xs">{a.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{a.number ?? "—"}</TableCell>
                  <TableCell className="text-xs">{a.type}{a.subtype ? `/${a.subtype}` : ""}</TableCell>
                  <TableCell className="text-xs">
                    {a.balance != null
                      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(a.balance))
                      : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.local_account_id ? `${a.local_account_id.slice(0, 8)}…` : "—"}</TableCell>
                  <TableCell className="text-xs">{fmtDate(a.last_transaction_at)}</TableCell>
                </TableRow>
              ))}
              {(accountsQ.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhuma conta materializada.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
