import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, Loader2, Webhook } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminPluggyWebhook() {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pluggy-webhook-config");
      if (error) throw error;
      setUrl(data?.url ?? null);
      setBaseUrl(data?.base_url ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível carregar a URL do webhook");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const masked = url ? url.replace(/(secret=)[^&]+/, "$1••••••••") : "";
  const shown = reveal ? url : masked;

  const copy = async (value: string | null) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); toast.success("Copiado"); }
    catch { toast.error("Falha ao copiar"); }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Webhook Pluggy"
        description="URL segura para configurar o recebimento de eventos da Pluggy (Open Finance)."
      />
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Webhook da Pluggy</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Cole a URL abaixo no painel da Pluggy em <strong>Applications → Webhooks</strong>. Ela inclui
            o segredo <code>PLUGGY_WEBHOOK_SECRET</code> como query string e é validada em cada evento.
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
            </div>
          ) : url ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{shown}</code>
                <Button size="sm" variant="ghost" onClick={() => setReveal((r) => !r)} aria-label={reveal ? "Ocultar" : "Mostrar"}>
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copy(url)} aria-label="Copiar URL completa">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {baseUrl && (
                <p className="text-[11px] text-muted-foreground">
                  URL base (sem segredo): <code>{baseUrl}</code>
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-destructive">URL indisponível. Verifique se você é super_admin e se o segredo está configurado.</p>
          )}
        </CardContent>
      </Card>
      <WebhookQueuePanel provider="pluggy" />
    </div>

  );
}
