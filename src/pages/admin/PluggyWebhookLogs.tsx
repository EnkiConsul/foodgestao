import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Search, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: string | null | undefined) =>
  v ? format(new Date(v), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : "—";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  processed: "default",
  pending: "secondary",
  retry: "outline",
  failed: "destructive",
};

type WebhookRow = {
  id: string;
  event_id: string | null;
  event_type: string | null;
  pluggy_item_id: string | null;
  status: string | null;
  attempt_count: number | null;
  error: string | null;
  last_error_code: string | null;
  processed_at: string | null;
  next_attempt_at: string | null;
  created_at: string;
  company_id: string | null;
  connection_id: string | null;
  connection_request_id: string | null;
  client_user_id: string | null;
  payload: unknown;
};

function retryCountdown(next: string | null | undefined, status: string | null | undefined) {
  if (status === "processed") return "—";
  if (!next) return "—";
  const target = new Date(next).getTime();
  const now = Date.now();
  if (target <= now) return "agora";
  return `em ${formatDistanceToNowStrict(new Date(next), { locale: ptBR })}`;
}

export default function PluggyWebhookLogs() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WebhookRow | null>(null);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-pluggy-webhook-logs", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("open_finance_webhook_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as WebhookRow[];
    },
    refetchInterval: 15_000,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.event_id, r.event_type, r.pluggy_item_id, r.last_error_code, r.error, r.company_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    );
  }, [rows, search]);

  const counters = useMemo(() => {
    const c = { pending: 0, retry: 0, failed: 0, processed: 0 };
    for (const r of rows) {
      const s = (r.status ?? "") as keyof typeof c;
      if (s in c) c[s] += 1;
    }
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <AdminPageHeader
          title="Logs de Webhooks Pluggy"
          description="Registros de open_finance_webhook_events com última tentativa, erro e próximo retry."
        />
        <Button variant="outline" size="sm" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["admin-pluggy-webhook-logs"] }); }}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <div><div className="text-xs text-muted-foreground">Pendentes</div><div className="text-xl font-semibold">{counters.pending}</div></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <RefreshCw className="h-5 w-5 text-muted-foreground" />
          <div><div className="text-xs text-muted-foreground">Em retry</div><div className="text-xl font-semibold">{counters.retry}</div></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div><div className="text-xs text-muted-foreground">Falhos</div><div className="text-xl font-semibold">{counters.failed}</div></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div><div className="text-xs text-muted-foreground">Processados</div><div className="text-xl font-semibold">{counters.processed}</div></div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por evento, item, erro, empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="retry">Em retry</SelectItem>
            <SelectItem value="failed">Falhos</SelectItem>
            <SelectItem value="processed">Processados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebido</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Tentativas</TableHead>
                <TableHead>Última tentativa</TableHead>
                <TableHead>Último erro</TableHead>
                <TableHead>Próximo retry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum evento encontrado.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                  <TableCell className="whitespace-nowrap text-sm">{fmt(r.created_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.event_type ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.pluggy_item_id ?? "—"}</TableCell>
                  <TableCell><Badge variant={statusVariant[r.status ?? ""] ?? "outline"}>{r.status ?? "—"}</Badge></TableCell>
                  <TableCell className="text-center">{r.attempt_count ?? 0}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmt(r.processed_at)}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs" title={r.error ?? ""}>
                    {r.last_error_code ? <Badge variant="destructive" className="mr-1">{r.last_error_code}</Badge> : null}
                    {r.error ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{retryCountdown(r.next_attempt_at, r.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes do evento</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-xs text-muted-foreground">Event ID</div><div className="font-mono break-all">{selected.event_id ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Tipo</div><div className="font-mono">{selected.event_type ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Item Pluggy</div><div className="font-mono break-all">{selected.pluggy_item_id ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Status</div><Badge variant={statusVariant[selected.status ?? ""] ?? "outline"}>{selected.status ?? "—"}</Badge></div>
                <div><div className="text-xs text-muted-foreground">Tentativas</div><div>{selected.attempt_count ?? 0}</div></div>
                <div><div className="text-xs text-muted-foreground">Próximo retry</div><div>{fmt(selected.next_attempt_at)} ({retryCountdown(selected.next_attempt_at, selected.status)})</div></div>
                <div><div className="text-xs text-muted-foreground">Recebido</div><div>{fmt(selected.created_at)}</div></div>
                <div><div className="text-xs text-muted-foreground">Última tentativa</div><div>{fmt(selected.processed_at)}</div></div>
                <div><div className="text-xs text-muted-foreground">Empresa</div><div className="font-mono break-all">{selected.company_id ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Client User ID</div><div className="font-mono break-all">{selected.client_user_id ?? "—"}</div></div>
              </div>
              {(selected.error || selected.last_error_code) && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Erro</div>
                  {selected.last_error_code && <Badge variant="destructive" className="mr-1">{selected.last_error_code}</Badge>}
                  <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap">{selected.error ?? "—"}</pre>
                </div>
              )}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Payload</div>
                <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-[300px] overflow-auto">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
