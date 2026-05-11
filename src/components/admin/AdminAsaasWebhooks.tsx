import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw, Eye, CheckCircle2, AlertCircle, Clock } from "lucide-react";

type WebhookEvent = {
  id: string;
  event_id: string;
  event_type: string;
  payload: any;
  processed_at: string | null;
  error: string | null;
  created_at: string;
};

const PAGE_SIZE = 25;

export function AdminAsaasWebhooks() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "processed" | "pending" | "error">("all");
  const [selected, setSelected] = useState<WebhookEvent | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["asaas-webhook-events", page, search, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("asaas_webhook_events")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search.trim()) {
        q = q.or(`event_id.ilike.%${search}%,event_type.ilike.%${search}%`);
      }
      if (statusFilter === "processed") q = q.not("processed_at", "is", null).is("error", null);
      if (statusFilter === "pending") q = q.is("processed_at", null).is("error", null);
      if (statusFilter === "error") q = q.not("error", "is", null);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as WebhookEvent[], total: count ?? 0 };
    },
  });

  const stats = useQuery({
    queryKey: ["asaas-webhook-stats"],
    queryFn: async () => {
      const [total, processed, errored, last24h] = await Promise.all([
        supabase.from("asaas_webhook_events").select("*", { count: "exact", head: true }),
        supabase.from("asaas_webhook_events").select("*", { count: "exact", head: true }).not("processed_at", "is", null).is("error", null),
        supabase.from("asaas_webhook_events").select("*", { count: "exact", head: true }).not("error", "is", null),
        supabase.from("asaas_webhook_events").select("*", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 86400_000).toISOString()),
      ]);
      return {
        total: total.count ?? 0,
        processed: processed.count ?? 0,
        errored: errored.count ?? 0,
        last24h: last24h.count ?? 0,
      };
    },
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const renderStatus = (e: WebhookEvent) => {
    if (e.error) return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Erro</Badge>;
    if (e.processed_at) return <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20"><CheckCircle2 className="h-3 w-3" /> Processado</Badge>;
    return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Total recebidos</p>
          <p className="text-2xl font-bold">{stats.data?.total ?? "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Processados</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.data?.processed ?? "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Com erro</p>
          <p className="text-2xl font-bold text-destructive">{stats.data?.errored ?? "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Últimas 24h</p>
          <p className="text-2xl font-bold">{stats.data?.last24h ?? "—"}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle>Eventos do Webhook Asaas</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Buscar por event_id ou tipo…"
              value={search}
              onChange={(e) => { setPage(0); setSearch(e.target.value); }}
              className="w-64"
            />
            <Select
              value={statusFilter}
              onValueChange={(v) => { setPage(0); setStatusFilter(v as typeof statusFilter); }}
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="processed">Processados</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="error">Com erro</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.rows.length ? (
            <p className="text-center py-10 text-sm text-muted-foreground">
              Nenhum evento encontrado. Os eventos aparecerão aqui assim que o Asaas começar a enviar webhooks.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recebido em</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Event ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Processado em</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(e.created_at).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs">{e.event_type}</code>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs text-muted-foreground">{e.event_id.slice(0, 24)}…</code>
                        </TableCell>
                        <TableCell>{renderStatus(e)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {e.processed_at ? new Date(e.processed_at).toLocaleString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => setSelected(e)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between pt-4">
                <p className="text-xs text-muted-foreground">
                  Página {page + 1} de {totalPages} — {data.total} eventos
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do evento</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <code>{selected.event_type}</code>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  {renderStatus(selected)}
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Event ID</p>
                  <code className="text-xs break-all">{selected.event_id}</code>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Recebido em</p>
                  <p>{new Date(selected.created_at).toLocaleString("pt-BR")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Processado em</p>
                  <p>{selected.processed_at ? new Date(selected.processed_at).toLocaleString("pt-BR") : "—"}</p>
                </div>
              </div>

              {selected.error && (
                <div>
                  <p className="text-xs font-medium text-destructive mb-1">Erro de processamento</p>
                  <pre className="text-xs bg-destructive/10 text-destructive p-3 rounded whitespace-pre-wrap break-words">
                    {selected.error}
                  </pre>
                </div>
              )}

              <div>
                <p className="text-xs font-medium mb-1">Payload completo</p>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-96">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>

              <p className="text-xs text-muted-foreground">
                Eventos duplicados (mesmo <code>event_id</code>) são ignorados automaticamente —
                a tabela tem constraint UNIQUE em <code>event_id</code>, então só o primeiro recebimento é registrado.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
