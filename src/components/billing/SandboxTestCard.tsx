import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FlaskConical, Loader2, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * Sandbox card to fire a synthetic end-to-end checkout flow without using Asaas.
 * Creates a sample invoice for the current user then sends a matching webhook
 * event to validate the full pipeline (invoice update, subscription activation,
 * realtime UI feedback). Restricted to super admins.
 */
export function SandboxTestCard() {
  const { isSuperAdmin } = useSuperAdmin();
  const qc = useQueryClient();
  const [eventType, setEventType] = useState("PAYMENT_CONFIRMED");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    ok: boolean;
    invoiceId: string | null;
    eventType: string;
    at: string;
  } | null>(null);

  if (!isSuperAdmin) return null;

  const run = async () => {
    setSending(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-webhook-test", {
        body: { eventType, createSampleInvoice: true },
      });
      if (error) throw error;
      setLastResult({
        ok: !!data?.ok,
        invoiceId: data?.createdInvoiceId ?? null,
        eventType,
        at: new Date().toLocaleString("pt-BR"),
      });
      if (data?.ok) {
        toast.success("Checkout de teste disparado", {
          description: "A fatura aparece abaixo e a assinatura foi atualizada conforme o evento.",
        });
        qc.invalidateQueries({ queryKey: ["my-invoices"] });
        qc.invalidateQueries({ queryKey: ["current-subscription"] });
      } else {
        toast.error(`Webhook retornou status ${data?.status ?? "desconhecido"}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao disparar teste");
      setLastResult({ ok: false, invoiceId: null, eventType, at: new Date().toLocaleString("pt-BR") });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-primary" />
          Modo de teste (Sandbox)
          <Badge variant="secondary" className="text-[10px]">super admin</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Dispara um checkout de exemplo: cria uma fatura sintética vinculada à sua
          conta e envia o evento selecionado ao webhook. Valida todo o fluxo
          (criação, processamento, ativação da assinatura e atualização em tempo real)
          sem precisar navegar no Asaas.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Evento a simular</label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PAYMENT_CONFIRMED">PAYMENT_CONFIRMED (pagamento aprovado)</SelectItem>
                <SelectItem value="PAYMENT_RECEIVED">PAYMENT_RECEIVED (pagamento recebido)</SelectItem>
                <SelectItem value="PAYMENT_OVERDUE">PAYMENT_OVERDUE (fatura atrasada)</SelectItem>
                <SelectItem value="PAYMENT_REFUNDED">PAYMENT_REFUNDED (reembolso)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={run} disabled={sending}>
            {sending
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Disparando…</>
              : <><Send className="h-4 w-4 mr-1" /> Disparar checkout de teste</>}
          </Button>
        </div>

        {lastResult && (
          <div className="flex items-center gap-2 text-xs pt-2 border-t">
            {lastResult.ok
              ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              : <AlertCircle className="h-4 w-4 text-destructive" />}
            <span className="text-muted-foreground">
              {lastResult.at} — {lastResult.eventType}
              {lastResult.invoiceId && (
                <> · fatura <code className="text-[10px]">{lastResult.invoiceId.slice(0, 8)}…</code></>
              )}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
