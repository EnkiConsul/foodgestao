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
import { RefreshCw, Search, AlertTriangle } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: string | null | undefined) =>
  v ? format(new Date(v), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : "—";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  success: "default",
  processing: "secondary",
  pending: "secondary",
  error: "destructive",
  dead_letter: "destructive",
  skipped: "outline",
};

type HealthSummary = {
  pending?: number;
  processing?: number;
  dead_letter?: number;
  success_last_hour?: number;
  success_last_24h?: number;
  oldest_pending_age_seconds?: number | null;
  expired_claims?: number;
};

type WebhookRow = {
  id: string;
  event_id: string | null;
  event_type: string;
  pluggy_item_id: string | null;
  status: string;
  attempts: number;
  last_error: string | null;
  processed_at: string | null;
  next_attempt_at: string;
  last_attempt_at: string | null;
  received_at: string;
  claimed_by: string | null;
  claim_expires_at: string | null;
  max_attempts: number;
  payload: unknown;
  headers: unknown;
};

function retryCountdown(next: string | null | undefined, status: string) {
  if (status === "success" || status === "skipped") return "—";
  if (!next) return "—";
  const target = new Date(next).getTime();
  if (target <= Date.now()) return "agora";
  return `em ${formatDistanceToNowStrict(new Date(next), { locale: ptBR })}`;
}

export default function PluggyV2WebhookLogs() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WebhookRow | null>(null);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-pluggy-v2-webhook-logs", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("pluggy_v2_webhook_events")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(500);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as never);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as WebhookRow[];
    },
    refetchInterval: 15_000,
  });

  const { data: health } = useQuery({
    queryKey: ["admin-pluggy-v2-webhook-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pluggy_v2_webhook_health" as never);
      if (error) throw error;
      return (data ?? {}) as HealthSummary;
    },
    refetchInterval: 15_000,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.event_id, r.event_type, r.pluggy_item_id, r.last_error]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    );
  }, [rows, search]);

  const counters = useMemo(() => {
    const c: Record<string, number> = { pending: 0, processing: 0, success: 0, error: 0, dead_letter: 0, skipped: 0 };
    for (const r of rows) if (r.status in c) c[r.status] += 1;
    return c;
  }, [rows]);

  const oldestPending = health?.oldest_pending_age_seconds ?? null;
  const oldestPendingLabel =
    oldestPending == null ? "—"
    : oldestPending < 60 ? `${Math.round(oldestPending)}s`
    : oldestPending < 3600 ? `${Math.round(oldestPending / 60)}min`
    : `${(oldestPending / 3600).toFixed(1)}h`;

  const alertPending = (health?.pending ?? 0) > 20 || (oldestPending ?? 0) > 300;
  const alertDeadLetter = (health?.dead_letter ?? 0) > 0;
  const alertExpired = (health?.expired_claims ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <AdminPageHeader
          title="Logs de Webhooks Pluggy V2"
          description="V2 isolado. Worker durável com claim atômico, backoff exponencial e dead-letter após esgotar tentativas."
        />
        <Button variant="outline" size="sm" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["admin-pluggy-v2-webhook-logs"] }); qc.invalidateQueries({ queryKey: ["admin-pluggy-v2-webhook-health"] }); }}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {(alertPending || alertDeadLetter || alertExpired) && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex flex-wrap gap-4 text-sm">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="flex flex-wrap gap-4">
              {alertPending && <span><strong>Backlog:</strong> {health?.pending ?? 0} pendentes (mais antigo há {oldestPendingLabel})</span>}
              {alertExpired && <span><strong>Reservas expiradas:</strong> {health?.expired_claims ?? 0} (serão retomadas no próximo tick)</span>}
              {alertDeadLetter && <span><strong>Dead-letter:</strong> {health?.dead_letter ?? 0} eventos exigem análise manual</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-6">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pendentes</div>
          <div className="text-xl font-semibold">{health?.pending ?? counters.pending}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Processando</div>
          <div className="text-xl font-semibold">{health?.processing ?? counters.processing}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Sucesso (1h)</div>
          <div className="text-xl font-semibold">{health?.success_last_hour ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Sucesso (24h)</div>
          <div className="text-xl font-semibold">{health?.success_last_24h ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Dead-letter</div>
          <div className="text-xl font-semibold text-destructive">{health?.dead_letter ?? counters.dead_letter}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Mais antigo pendente</div>
          <div className="text-xl font-semibold">{oldestPendingLabel}</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por evento, item, erro..."
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
            <SelectItem value="processing">Processando</SelectItem>
            <SelectItem value="success">Sucesso</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
            <SelectItem value="dead_letter">Dead-letter</SelectItem>
            <SelectItem value="skipped">Ignorados</SelectItem>
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
                  <TableCell className="whitespace-nowrap text-sm">{fmt(r.received_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.event_type}</TableCell>
                  <TableCell className="font-mono text-xs">{r.pluggy_item_id ?? "—"}</TableCell>
                  <TableCell><Badge variant={statusVariant[r.status] ?? "outline"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-center">{r.attempts}/{r.max_attempts}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmt(r.last_attempt_at)}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs" title={r.last_error ?? ""}>
                    {r.last_error ?? "—"}
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
          <DialogHeader><DialogTitle>Detalhes do evento V2</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-xs text-muted-foreground">Event ID</div><div className="font-mono break-all">{selected.event_id ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Tipo</div><div className="font-mono">{selected.event_type}</div></div>
                <div><div className="text-xs text-muted-foreground">Item Pluggy</div><div className="font-mono break-all">{selected.pluggy_item_id ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Status</div><Badge variant={statusVariant[selected.status] ?? "outline"}>{selected.status}</Badge></div>
                <div><div className="text-xs text-muted-foreground">Tentativas</div><div>{selected.attempts} / {selected.max_attempts}</div></div>
                <div><div className="text-xs text-muted-foreground">Próximo retry</div><div>{fmt(selected.next_attempt_at)} ({retryCountdown(selected.next_attempt_at, selected.status)})</div></div>
                <div><div className="text-xs text-muted-foreground">Recebido</div><div>{fmt(selected.received_at)}</div></div>
                <div><div className="text-xs text-muted-foreground">Última tentativa</div><div>{fmt(selected.last_attempt_at)}</div></div>
                <div><div className="text-xs text-muted-foreground">Processado</div><div>{fmt(selected.processed_at)}</div></div>
                <div><div className="text-xs text-muted-foreground">Reservado por</div><div className="font-mono break-all">{selected.claimed_by ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Reserva expira</div><div>{fmt(selected.claim_expires_at)}</div></div>
              </div>
              {selected.last_error && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Erro</div>
                  <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap">{selected.last_error}</pre>
                </div>
              )}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Payload</div>
                <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-[300px] overflow-auto">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Headers</div>
                <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-[200px] overflow-auto">
                  {JSON.stringify(selected.headers, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
