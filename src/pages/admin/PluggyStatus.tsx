import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  KeyRound,
  Webhook,
  Link2,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type StepState = "idle" | "loading" | "success" | "error";

type StepInfo = {
  state: StepState;
  message?: string;
  detail?: string;
};

type ConnectionRow = {
  id: string;
  pluggy_item_id: string;
  connector_name: string | null;
  status: string | null;
  execution_status: string | null;
  last_synced_at: string | null;
  last_error: any;
  updated_at: string | null;
};

type WebhookEventRow = {
  id: string;
  event_id: string | null;
  event_type: string | null;
  pluggy_item_id: string | null;
  processed_at: string | null;
  error: string | null;
  created_at: string;
};

function StepCard({
  icon: Icon,
  title,
  description,
  step,
}: {
  icon: typeof KeyRound;
  title: string;
  description: string;
  step: StepInfo;
}) {
  const badge = (() => {
    switch (step.state) {
      case "loading":
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Verificando
          </Badge>
        );
      case "success":
        return (
          <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
            <CheckCircle2 className="h-3 w-3" /> OK
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" /> Falhou
          </Badge>
        );
      default:
        return <Badge variant="outline">—</Badge>;
    }
  })();

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">{title}</p>
          </div>
          {badge}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        {step.message && (
          <p className="text-xs font-medium">{step.message}</p>
        )}
        {step.detail && (
          <pre className="max-h-32 overflow-auto rounded bg-muted px-2 py-1.5 text-[11px] whitespace-pre-wrap break-all">
            {step.detail}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return format(new Date(v), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return v;
  }
}

export default function AdminPluggyStatus() {
  const [tokenStep, setTokenStep] = useState<StepInfo>({ state: "idle" });
  const [webhookStep, setWebhookStep] = useState<StepInfo>({ state: "idle" });
  const [connStep, setConnStep] = useState<StepInfo>({ state: "idle" });
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [events, setEvents] = useState<WebhookEventRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const runChecks = useCallback(async () => {
    setRefreshing(true);
    setTokenStep({ state: "loading" });
    setWebhookStep({ state: "loading" });
    setConnStep({ state: "loading" });

    const tokenP = supabase.functions
      .invoke("pluggy-connect-token", { body: {} })
      .then(({ data, error }) => {
        if (error) {
          setTokenStep({
            state: "error",
            message: "Não foi possível gerar o connect token.",
            detail: error.message ?? String(error),
          });
          return;
        }
        if (data?.accessToken) {
          setTokenStep({
            state: "success",
            message: "Credenciais Pluggy válidas — connect token gerado.",
          });
        } else {
          setTokenStep({
            state: "error",
            message: "Resposta sem accessToken.",
            detail: JSON.stringify(data, null, 2),
          });
        }
      })
      .catch((e) =>
        setTokenStep({
          state: "error",
          message: "Erro ao invocar pluggy-connect-token.",
          detail: String(e),
        }),
      );

    const webhookP = supabase.functions
      .invoke("pluggy-webhook-config")
      .then(({ data, error }) => {
        if (error) {
          setWebhookStep({
            state: "error",
            message: "Falha ao gerar a URL assinada.",
            detail: error.message ?? String(error),
          });
          return;
        }
        if (data?.url && data?.has_secret) {
          setWebhookStep({
            state: "success",
            message: "URL assinada disponível. Confirme se está colada na Pluggy.",
          });
        } else {
          setWebhookStep({
            state: "error",
            message: "Segredo do webhook ausente.",
            detail: JSON.stringify(data, null, 2),
          });
        }
      })
      .catch((e) =>
        setWebhookStep({
          state: "error",
          message: "Erro ao invocar pluggy-webhook-config.",
          detail: String(e),
        }),
      );

    const connP = (async () => {
      const [{ data: conns, error: cErr }, { data: evs, error: eErr }] =
        await Promise.all([
          supabase
            .from("pluggy_connections")
            .select(
              "id,pluggy_item_id,connector_name,status,execution_status,last_synced_at,last_error,updated_at",
            )
            .order("updated_at", { ascending: false })
            .limit(20),
          supabase
            .from("pluggy_webhook_events")
            .select(
              "id,event_id,event_type,pluggy_item_id,processed_at,error,created_at",
            )
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

      if (cErr) {
        setConnStep({
          state: "error",
          message: "Não foi possível ler pluggy_connections.",
          detail: cErr.message,
        });
        return;
      }
      const rows = (conns ?? []) as ConnectionRow[];
      setConnections(rows);
      setEvents(((evs as WebhookEventRow[]) ?? []).filter(Boolean));
      if (eErr) {
        // não bloqueia o passo — apenas registra
        console.warn("pluggy_webhook_events read error", eErr);
      }

      if (rows.length === 0) {
        setConnStep({
          state: "idle",
          message: "Nenhuma conexão registrada ainda. Conecte uma conta pelo widget para começar.",
        });
        return;
      }
      const withError = rows.filter(
        (r) => r.status === "error" || r.status === "login_error" || r.last_error,
      );
      if (withError.length > 0) {
        setConnStep({
          state: "error",
          message: `${withError.length} conexão(ões) com erro. Verifique detalhes abaixo.`,
        });
      } else {
        const updated = rows.filter((r) => r.status === "updated").length;
        setConnStep({
          state: "success",
          message: `${rows.length} conexão(ões) registrada(s), ${updated} sincronizada(s) com sucesso.`,
        });
      }
    })().catch((e) =>
      setConnStep({
        state: "error",
        message: "Erro ao carregar conexões.",
        detail: String(e),
      }),
    );

    await Promise.allSettled([tokenP, webhookP, connP]);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const lastEvent = useMemo(() => events[0], [events]);
  const lastErrorEvent = useMemo(
    () => events.find((e) => e.error),
    [events],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <AdminPageHeader
          title="Status da Conexão Pluggy"
          description="Diagnóstico das etapas de integração Open Finance: credenciais, webhook e conexões ativas."
        />
        <Button size="sm" variant="outline" onClick={runChecks} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Reexecutar</span>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StepCard
          icon={KeyRound}
          title="1. Credenciais / Token"
          description="Chama pluggy-connect-token com as credenciais salvas (PLUGGY_CLIENT_ID/SECRET) e valida a resposta."
          step={tokenStep}
        />
        <StepCard
          icon={Webhook}
          title="2. Webhook configurado"
          description="Confirma que a URL assinada pode ser gerada e que PLUGGY_WEBHOOK_SECRET está presente."
          step={webhookStep}
        />
        <StepCard
          icon={Link2}
          title="3. Conexões / Sincronização"
          description="Verifica pluggy_connections para status de sincronização e erros das últimas conexões."
          step={connStep}
        />
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Conexões recentes</p>
            <span className="text-xs text-muted-foreground">
              {connections.length} registro(s)
            </span>
          </div>
          {connections.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma conexão registrada.
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3">Item</th>
                    <th className="py-1.5 pr-3">Instituição</th>
                    <th className="py-1.5 pr-3">Status</th>
                    <th className="py-1.5 pr-3">Execução</th>
                    <th className="py-1.5 pr-3">Última sync</th>
                    <th className="py-1.5">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((c) => {
                    const err =
                      c.last_error && typeof c.last_error === "object"
                        ? (c.last_error as any).message ??
                          JSON.stringify(c.last_error)
                        : (c.last_error as any) ?? null;
                    const isErr =
                      c.status === "error" ||
                      c.status === "login_error" ||
                      !!err;
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="py-1.5 pr-3 font-mono">
                          {c.pluggy_item_id.slice(0, 8)}…
                        </td>
                        <td className="py-1.5 pr-3">
                          {c.connector_name ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3">
                          <Badge
                            variant={isErr ? "destructive" : "secondary"}
                            className="font-normal"
                          >
                            {c.status ?? "—"}
                          </Badge>
                        </td>
                        <td className="py-1.5 pr-3">
                          {c.execution_status ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {fmtDate(c.last_synced_at)}
                        </td>
                        <td className="py-1.5 max-w-[280px] truncate text-destructive">
                          {err ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Eventos de webhook recentes</p>
            <span className="text-xs text-muted-foreground">
              Último: {fmtDate(lastEvent?.created_at)}
            </span>
          </div>
          {lastErrorEvent && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <strong>Último erro:</strong> {lastErrorEvent.error} — evento{" "}
              <code>{lastErrorEvent.event_type}</code> em{" "}
              {fmtDate(lastErrorEvent.created_at)}
            </div>
          )}
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum evento recebido ainda. Confirme que a URL do webhook foi
              colada no painel da Pluggy.
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3">Recebido</th>
                    <th className="py-1.5 pr-3">Evento</th>
                    <th className="py-1.5 pr-3">Item</th>
                    <th className="py-1.5 pr-3">Processado</th>
                    <th className="py-1.5">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="py-1.5 pr-3">{fmtDate(e.created_at)}</td>
                      <td className="py-1.5 pr-3">{e.event_type ?? "—"}</td>
                      <td className="py-1.5 pr-3 font-mono">
                        {e.pluggy_item_id?.slice(0, 8) ?? "—"}
                        {e.pluggy_item_id ? "…" : ""}
                      </td>
                      <td className="py-1.5 pr-3">
                        {e.processed_at ? fmtDate(e.processed_at) : "—"}
                      </td>
                      <td className="py-1.5 max-w-[280px] truncate text-destructive">
                        {e.error ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PluggyConnectRequests />
    </div>
  );
}

