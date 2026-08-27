import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, RotateCcw, AlertTriangle, Clock, Activity } from "lucide-react";
import { toast } from "sonner";

type Provider = "asaas" | "pluggy";

type QueueRow = {
  id: string;
  event_id: string;
  event_type: string;
  status: string | null;
  attempt_count: number | null;
  max_attempts: number | null;
  next_attempt_at: string | null;
  dead_lettered_at: string | null;
  error_code: string | null;
  error: string | null;
  created_at: string;
};

const TABLE: Record<Provider, "asaas_webhook_events" | "pluggy_webhook_events"> = {
  asaas: "asaas_webhook_events",
  pluggy: "pluggy_webhook_events",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  processing: "Processando",
  processed: "Processado",
  retry: "Retentativa",
  dead_letter: "Falha definitiva",
  discarded: "Descartado",
};

const ERROR_CODE_HINT: Record<string, string> = {
  pending_manual_link: "Conexão do banco não encontrada no sistema (item removido ou de outro ambiente).",
  missing_item_id: "Evento sem identificação da conexão.",
  processing_error: "Erro temporário no processamento.",
};

function statusBadge(status: string | null) {
  const label = STATUS_LABEL[status ?? ""] ?? status ?? "—";
  if (status === "dead_letter") {
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {label}</Badge>;
  }
  if (status === "retry") {
    return <Badge className="gap-1 bg-amber-500/15 text-amber-600 hover:bg-amber-500/20"><RotateCcw className="h-3 w-3" /> {label}</Badge>;
  }
  if (status === "processing") {
    return <Badge className="gap-1 bg-sky-500/15 text-sky-600 hover:bg-sky-500/20"><Activity className="h-3 w-3" /> {label}</Badge>;
  }
  if (status === "processed") {
    return <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20">{label}</Badge>;
  }
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> {label}</Badge>;
}

export function WebhookQueuePanel({ provider }: { provider: Provider }) {
  const table = TABLE[provider];

  const counts = useQuery({
    queryKey: ["webhook-queue-counts", provider],
    refetchInterval: 30_000,
    queryFn: async () => {
      const statuses = ["pending", "processing", "retry", "dead_letter", "processed"];
      const results = await Promise.all(
        statuses.map((s) =>
          supabase.from(table).select("*", { count: "exact", head: true }).eq("status", s),
        ),
      );
      return statuses.reduce<Record<string, number>>((acc, s, i) => {
        acc[s] = results[i].count ?? 0;
        return acc;
      }, {});
    },
  });

  const backlog = useQuery({
    queryKey: ["webhook-queue-backlog", provider],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("id, event_id, event_type, status, attempt_count, max_attempts, next_attempt_at, dead_lettered_at, error_code, error, created_at")
        .in("status", ["pending", "processing", "retry", "dead_letter"])
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
  });

  const refetchAll = () => { counts.refetch(); backlog.refetch(); };

  const requeue = async (id: string) => {
    const { error } = await supabase.rpc("webhook_requeue_admin", {
      _provider: provider,
      _event_id: id,
    });
    if (error) {
      toast.error(error.message ?? "Falha ao reenfileirar evento");
      return;
    }
    toast.success("Evento reenfileirado — será processado no próximo ciclo");
    refetchAll();
  };

  const discard = async (id: string) => {
    const { error } = await supabase.rpc("webhook_discard_admin", {
      _provider: provider,
      _event_id: id,
      _reason: "descartado no painel administrativo",
    });
    if (error) {
      toast.error(error.message ?? "Falha ao descartar evento");
      return;
    }
    toast.success("Evento descartado");
    refetchAll();
  };

  const discardByCode = async (code: string) => {
    const { data, error } = await supabase.rpc("webhook_discard_by_code_admin", {
      _provider: provider,
      _error_code: code,
      _reason: "descarte em lote no painel administrativo",
    });
    if (error) {
      toast.error(error.message ?? "Falha ao descartar eventos");
      return;
    }
    toast.success(`${data ?? 0} evento(s) descartado(s)`);
    refetchAll();
  };

  const deadLetterCodes = Array.from(
    new Set(
      (backlog.data ?? [])
        .filter((e) => e.status === "dead_letter" && e.error_code)
        .map((e) => e.error_code as string),
    ),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle>Fila de processamento</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Eventos são recebidos e processados por um worker próprio a cada minuto, com retentativas
            automáticas e backoff. Falhas definitivas podem ser reenfileiradas manualmente.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { counts.refetch(); backlog.refetch(); }}
          disabled={counts.isFetching || backlog.isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${counts.isFetching || backlog.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {["pending", "processing", "retry", "dead_letter", "processed"].map((s) => (
            <div key={s} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</p>
              <p className={`text-xl font-bold ${s === "dead_letter" && (counts.data?.[s] ?? 0) > 0 ? "text-destructive" : ""}`}>
                {counts.data?.[s] ?? "—"}
              </p>
            </div>
          ))}
        </div>

        {backlog.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !backlog.data?.length ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Fila vazia — todos os eventos foram processados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recebido em</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Próxima tentativa</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backlog.data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(e.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell><code className="text-xs">{e.event_type}</code></TableCell>
                    <TableCell>{statusBadge(e.status)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {e.attempt_count ?? 0}/{e.max_attempts ?? 5}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {e.next_attempt_at ? new Date(e.next_attempt_at).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate" title={e.error ?? ""}>
                      {e.error_code ? <code className="text-xs">{e.error_code}</code> : null}
                      {e.error ? <span className="text-muted-foreground"> {e.error}</span> : null}
                      {!e.error && !e.error_code ? "—" : null}
                    </TableCell>
                    <TableCell>
                      {e.status === "dead_letter" || e.status === "retry" ? (
                        <div className="flex gap-1 whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => requeue(e.id)}>
                            <RotateCcw className="h-4 w-4 mr-1" /> Reprocessar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => discard(e.id)}>
                            <Trash2 className="h-4 w-4 mr-1" /> Descartar
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
