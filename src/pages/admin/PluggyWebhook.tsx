import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, RefreshCw, TriangleAlert, Webhook } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { WebhookQueuePanel } from "@/components/admin/WebhookQueuePanel";

type HookInfo = {
  id: string;
  url: string;
  event: string;
  disabled: boolean;
  has_secret_header: boolean;
};

type ConfigResponse = {
  base_url?: string;
  secret_header?: string;
  has_secret?: boolean;
  needs_setup?: boolean;
  webhooks?: HookInfo[];
};

export default function AdminPluggyWebhook() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pluggy-webhook-config");
      if (error) throw error;
      setConfig((data ?? null) as ConfigResponse | null);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível carregar a configuração do webhook",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const registrar = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("pluggy-webhook-config", {
        method: "POST",
      });
      if (error) throw error;
      toast.success(
        (data as { action?: string })?.action === "created"
          ? "Webhook criado na Pluggy"
          : "Webhook atualizado na Pluggy",
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar o webhook");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (value?: string | null) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); toast.success("Copiado"); }
    catch { toast.error("Falha ao copiar"); }
  };

  const hooks = config?.webhooks ?? [];
  const ok = config?.has_secret && config?.needs_setup === false;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Webhook Pluggy"
        description="Registro do webhook de Open Finance com o segredo enviado em cabeçalho."
      />
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Webhook da Pluggy</p>
            {ok ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Configurado
              </Badge>
            ) : config ? (
              <Badge variant="destructive" className="gap-1">
                <TriangleAlert className="h-3 w-3" /> Pendente
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            O segredo é enviado pela Pluggy no cabeçalho{" "}
            <code>{config?.secret_header ?? "x-webhook-secret"}</code> e nunca aparece na URL.
            Use o botão abaixo para registrar ou corrigir o webhook automaticamente.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
            </div>
          ) : config?.base_url ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">
                  {config.base_url}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(config.base_url)}
                  aria-label="Copiar URL do webhook"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              {hooks.length > 0 ? (
                <ul className="space-y-1 text-[11px] text-muted-foreground">
                  {hooks.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{h.event}</span>
                      <span>{h.has_secret_header ? "segredo em cabeçalho" : "sem segredo"}</span>
                      {h.disabled && <span className="text-destructive">desativado</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum webhook registrado para esta URL.
                </p>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={registrar} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                  {hooks.length > 0 ? "Atualizar registro" : "Registrar webhook"}
                </Button>
                <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                  <RefreshCw className="mr-2 h-3 w-3" /> Recarregar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-destructive">
              Configuração indisponível. Verifique se você é super_admin e se o segredo está configurado.
            </p>
          )}
        </CardContent>
      </Card>
      <WebhookQueuePanel provider="pluggy" />
    </div>
  );
}
