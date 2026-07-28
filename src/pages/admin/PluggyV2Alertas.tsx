import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, PlayCircle, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const fmt = (v: string | null | undefined) =>
  v ? format(new Date(v), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : "—";

const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  info: "outline",
  warning: "secondary",
  critical: "destructive",
};

type AlertRow = {
  id: string;
  alert_key: string;
  severity: "info" | "warning" | "critical";
  message: string;
  metric_value: number | null;
  threshold: number | null;
  notified_at: string;
  resolved_at: string | null;
};

type Snapshot = {
  generated_at?: string;
  webhook?: Record<string, number | null>;
  sync_runs?: Record<string, number | null>;
  connections?: Record<string, number | null>;
};

export default function PluggyV2Alertas() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data: alerts = [], isFetching: loadingAlerts, refetch } = useQuery({
    queryKey: ["admin-pluggy-v2-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pluggy_v2_alerts")
        .select("id, alert_key, severity, message, metric_value, threshold, notified_at, resolved_at")
        .order("notified_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AlertRow[];
    },
    refetchInterval: 30_000,
  });

  const { data: snapshot } = useQuery({
    queryKey: ["admin-pluggy-v2-slo-snapshot"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pluggy_v2_slo_snapshot" as never);
      if (error) throw error;
      return data as Snapshot;
    },
    refetchInterval: 30_000,
  });

  const open = useMemo(() => alerts.filter((a) => !a.resolved_at), [alerts]);
  const resolved = useMemo(() => alerts.filter((a) => !!a.resolved_at), [alerts]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pluggy-v2-alerts", { body: {} });
      if (error) throw error;
      const opened = (data as any)?.opened?.length ?? 0;
      const resolvedNow = (data as any)?.resolved?.length ?? 0;
      toast.success(`Avaliação concluída: ${opened} aberto(s), ${resolvedNow} resolvido(s)`);
      qc.invalidateQueries({ queryKey: ["admin-pluggy-v2-alerts"] });
      qc.invalidateQueries({ queryKey: ["admin-pluggy-v2-slo-snapshot"] });
    } catch (e: any) {
      toast.error(`Falha ao avaliar: ${e?.message ?? e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <AdminPageHeader
          title="Alertas Pluggy V2"
          description="Observabilidade e SLO da integração: dead-letter, backlog e sincronizações travadas. Avaliado automaticamente a cada 5 minutos."
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingAlerts ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={runNow} disabled={running}>
            <PlayCircle className={`h-4 w-4 mr-2 ${running ? "animate-pulse" : ""}`} />
            Avaliar agora
          </Button>
        </div>
      </div>

      {open.length === 0 ? (
        <Card className="border-emerald-500/50 bg-emerald-500/5">
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            <span>Nenhum alerta ativo. Todos os SLOs da integração V2 estão dentro do esperado.</span>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span>{open.length} alerta(s) ativo(s) exigem atenção.</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Webhook</div>
          <div className="text-sm">
            Pendentes: <strong>{snapshot?.webhook?.pending ?? 0}</strong> · Dead-letter: <strong className="text-destructive">{snapshot?.webhook?.dead_letter ?? 0}</strong>
          </div>
          <div className="text-sm text-muted-foreground">Sucesso (1h): {snapshot?.webhook?.success_last_hour ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Sync runs</div>
          <div className="text-sm">
            Rodando: <strong>{snapshot?.sync_runs?.running ?? 0}</strong> · Dead-letter: <strong className="text-destructive">{snapshot?.sync_runs?.dead_letter ?? 0}</strong>
          </div>
          <div className="text-sm text-muted-foreground">
            Travados 15min+: {snapshot?.sync_runs?.stuck_running ?? 0} · Falhas 1h: {snapshot?.sync_runs?.error_last_hour ?? 0}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Conexões</div>
          <div className="text-sm">
            Total: <strong>{snapshot?.connections?.total ?? 0}</strong> · Em erro: <strong className="text-destructive">{snapshot?.connections?.in_error ?? 0}</strong>
          </div>
          <div className="text-sm text-muted-foreground">Nunca sincronizadas: {snapshot?.connections?.never_synced ?? 0}</div>
        </CardContent></Card>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Alertas ativos</h3>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Alerta</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Valor / Limiar</TableHead>
                  <TableHead>Aberto há</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {open.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem alertas ativos.</TableCell></TableRow>
                ) : open.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><Badge variant={severityVariant[a.severity] ?? "outline"}>{a.severity}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{a.alert_key}</TableCell>
                    <TableCell className="text-sm">{a.message}</TableCell>
                    <TableCell className="text-sm">{a.metric_value ?? "—"} / {a.threshold ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDistanceToNowStrict(new Date(a.notified_at), { locale: ptBR })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Histórico resolvido (últimos 200)</h3>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Alerta</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Aberto em</TableHead>
                  <TableHead>Resolvido em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolved.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem histórico ainda.</TableCell></TableRow>
                ) : resolved.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><Badge variant={severityVariant[a.severity] ?? "outline"}>{a.severity}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{a.alert_key}</TableCell>
                    <TableCell className="text-sm">{a.message}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmt(a.notified_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {fmt(a.resolved_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
