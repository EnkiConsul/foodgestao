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
  updated: "default",
  updating: "secondary",
  waiting_user_input: "secondary",
  created: "outline",
  outdated: "outline",
  login_error: "destructive",
  error: "destructive",
  deleted: "outline",
  pending: "secondary",
  processing: "secondary",
  success: "default",
  dead_letter: "destructive",
  skipped: "outline",
  completed: "default",
  expired: "outline",
  cancelled: "outline",
};

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="outline">—</Badge>;
  return <Badge variant={statusVariant[status] ?? "outline"}>{status}</Badge>;
}

type ConnectionRow = {
  id: string;
  company_id: string;
  pluggy_item_id: string;
  connector_id: number;
  connector_name: string | null;
  status: string;
  execution_status: string | null;
  mfa_pending: boolean;
  last_sync_at: string | null;
  credentials_expires_at: string | null;
  next_auto_sync_at: string | null;
  deleted_at: string | null;
  remote_deletion_status: string | null;
  remote_deletion_attempts: number;
  created_at: string;
  updated_at: string;
};

type WebhookEventRow = {
  id: string;
  event_id: string | null;
  event_type: string;
  pluggy_item_id: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  received_at: string;
  processed_at: string | null;
};

type RequestRow = {
  id: string;
  company_id: string;
  pluggy_item_id: string | null;
  status: string;
  intent: string;
  connector_id: number | null;
  connector_name: string | null;
  last_error: string | null;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
};

type AccountRow = {
  id: string;
  connection_id: string;
  pluggy_account_id: string;
  name: string | null;
  marketing_name: string | null;
  number_masked: string | null;
  type: string | null;
  subtype: string | null;
  balance: number | null;
  currency_code: string | null;
  promoted_account_id: string | null;
  last_synced_at: string | null;
};

export default function AdminPluggyV2Conexoes() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ConnectionRow | null>(null);

  const connectionsQ = useQuery({
    queryKey: ["admin-pluggy-v2-connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pluggy_v2_connections")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as ConnectionRow[];
    },
  });

  const webhookQ = useQuery({
    queryKey: ["admin-pluggy-v2-webhooks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pluggy_v2_webhook_events")
        .select("id,event_id,event_type,pluggy_item_id,status,attempts,max_attempts,last_error,next_attempt_at,received_at,processed_at")
        .order("received_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as WebhookEventRow[];
    },
  });

  const requestsQ = useQuery({
    queryKey: ["admin-pluggy-v2-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pluggy_v2_connect_requests")
        .select("id,company_id,pluggy_item_id,status,intent,connector_id,connector_name,last_error,expires_at,completed_at,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as RequestRow[];
    },
  });

  const accountsQ = useQuery({
    queryKey: ["admin-pluggy-v2-accounts", detail?.id],
    enabled: !!detail?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pluggy_v2_accounts")
        .select("id,connection_id,pluggy_account_id,name,marketing_name,number_masked,type,subtype,balance,currency_code,promoted_account_id,last_synced_at")
        .eq("connection_id", detail!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AccountRow[];
    },
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-pluggy-v2-connections"] });
    qc.invalidateQueries({ queryKey: ["admin-pluggy-v2-webhooks"] });
    qc.invalidateQueries({ queryKey: ["admin-pluggy-v2-requests"] });
  };

  const q = search.trim().toLowerCase();
  const filterFn = <T extends Record<string, unknown>>(rows: T[], keys: (keyof T)[]) =>
    !q ? rows : rows.filter((r) => keys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)));

  const conns = filterFn(connectionsQ.data ?? [], ["pluggy_item_id", "status", "company_id", "connector_name"]);
  const events = filterFn(webhookQ.data ?? [], ["event_type", "pluggy_item_id", "status"]);
  const requests = filterFn(requestsQ.data ?? [], ["pluggy_item_id", "status", "company_id", "connector_name", "intent"]);

  const pendingCount = (webhookQ.data ?? []).filter((e) => e.status === "pending" || e.status === "processing").length;
  const failedCount = (webhookQ.data ?? []).filter((e) => e.status === "error" || e.status === "dead_letter").length;
  const connectedCount = (connectionsQ.data ?? []).filter((c) => c.status === "updated" && !c.deleted_at).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <AdminPageHeader
          title="Conexões Pluggy V2"
          description="V2 (isolado). Estados de conexões, solicitações e eventos de webhook do stack novo."
        />
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={connectionsQ.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${connectionsQ.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

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
            <CardTitle className="text-sm font-medium">Webhooks pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{pendingCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Webhooks c/ erro</CardTitle>
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
                    <TableHead>Execução</TableHead>
                    <TableHead>Último sync</TableHead>
                    <TableHead>Credenciais</TableHead>
                    <TableHead>Remote delete</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conns.map((c) => (
                    <TableRow key={c.id} className={c.deleted_at ? "opacity-50" : ""}>
                      <TableCell>
                        <div className="font-mono text-xs">{c.pluggy_item_id}</div>
                        <div className="text-xs text-muted-foreground">{c.connector_name ?? `#${c.connector_id}`}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.company_id.slice(0, 8)}…</TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                        {c.mfa_pending && <Badge variant="destructive" className="ml-2">MFA</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{c.execution_status ?? "—"}</TableCell>
                      <TableCell className="text-xs">{fmtDate(c.last_sync_at)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(c.credentials_expires_at)}</TableCell>
                      <TableCell className="text-xs">
                        {c.remote_deletion_status
                          ? <><StatusBadge status={c.remote_deletion_status} /> <span className="text-muted-foreground">({c.remote_deletion_attempts})</span></>
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setDetail(c)}>
                          <LinkIcon className="h-4 w-4 mr-1" /> Contas
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {conns.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma conexão.</TableCell></TableRow>
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
                      <TableCell className="text-xs">{e.attempts}/{e.max_attempts}</TableCell>
                      <TableCell className="text-xs max-w-[240px] truncate" title={e.last_error ?? ""}>{e.last_error ?? "—"}</TableCell>
                      <TableCell className="text-xs">{fmtDate(e.next_attempt_at)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(e.received_at)}</TableCell>
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
                    <TableHead>Intent</TableHead>
                    <TableHead>Conector</TableHead>
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
                      <TableCell className="text-xs">{r.intent}</TableCell>
                      <TableCell className="text-xs">{r.connector_name ?? (r.connector_id ? `#${r.connector_id}` : "—")}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="font-mono text-xs">{r.pluggy_item_id ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={r.last_error ?? ""}>{r.last_error ?? "—"}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.completed_at)}</TableCell>
                    </TableRow>
                  ))}
                  {requests.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhuma solicitação.</TableCell></TableRow>
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
              Contas — {detail?.pluggy_item_id}
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-2">
            Conector: <span className="font-mono">{detail?.connector_name ?? `#${detail?.connector_id}`}</span> · Empresa:{" "}
            <span className="font-mono">{detail?.company_id}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Promovida</TableHead>
                <TableHead>Último sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(accountsQ.data ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs">{a.marketing_name ?? a.name ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono">{a.number_masked ?? "—"}</TableCell>
                  <TableCell className="text-xs">{a.type}{a.subtype ? `/${a.subtype}` : ""}</TableCell>
                  <TableCell className="text-xs">
                    {a.balance != null
                      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: a.currency_code ?? "BRL" }).format(Number(a.balance))
                      : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.promoted_account_id ? `${a.promoted_account_id.slice(0, 8)}…` : "—"}</TableCell>
                  <TableCell className="text-xs">{fmtDate(a.last_synced_at)}</TableCell>
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
