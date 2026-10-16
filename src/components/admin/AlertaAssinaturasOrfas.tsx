import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Pendencia = { id: string; created_at: string; billing_account_id: string; payload: any };

/**
 * Alerta do Backoffice: (1) contratações cuja compensação no Asaas ficou pendente
 * (algo pode estar cobrando lá) e (2) assinaturas pendentes sem vínculo no Asaas há
 * mais de 30 min. Só alerta — nada é cobrado ou cancelado automaticamente.
 */
export function AlertaAssinaturasOrfas() {
  const { data: orfas } = useQuery({
    queryKey: ["admin-assinaturas-orfas"],
    queryFn: async () => {
      const limite = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id,module,created_at,billing_account_id,asaas_env")
        .eq("status", "pending")
        .is("external_subscription_id", null)
        .lt("created_at", limite)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: compensacoes } = useQuery({
    queryKey: ["admin-compensacoes-pendentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_account_events")
        .select("id,created_at,billing_account_id,payload,tipo_evento")
        .in("tipo_evento", ["contratacao_falhou_compensacao_pendente", "compensacao_resolvida"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const resolvidas = new Set(
        (data ?? []).filter((e: any) => e.tipo_evento === "compensacao_resolvida").map((e: any) => e.payload?.subscription_id),
      );
      return (data ?? []).filter(
        (e: any) => e.tipo_evento === "contratacao_falhou_compensacao_pendente" && !resolvidas.has(e.payload?.subscription_id),
      ) as Pendencia[];
    },
  });

  if (!orfas?.length && !compensacoes?.length) return null;
  return (
    <div className="space-y-3">
      {!!compensacoes?.length && (
        <Alert variant="destructive" className="border-2">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle className="font-bold">
            {compensacoes.length} contratação(ões) com cancelamento pendente no Asaas — conferir agora
          </AlertTitle>
          <AlertDescription>
            A contratação falhou e estes itens não puderam ser cancelados no Asaas. O cliente foi orientado a desconsiderar a cobrança.
            Cancele manualmente no Asaas:
            <ul className="mt-2 list-disc pl-5 text-xs">
              {compensacoes.map((c) => (
                <li key={c.id}>
                  {new Date(c.created_at).toLocaleString("pt-BR")} · {c.payload?.asaas_env} · assinatura local{" "}
                  {String(c.payload?.subscription_id ?? "").slice(0, 8)} · pendentes no Asaas:{" "}
                  {(c.payload?.pendentes ?? []).map((p: any) => `${p.tipo} ${p.id}`).join(", ")}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {!!orfas?.length && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{orfas.length} assinatura(s) pendente(s) sem vínculo no Asaas há mais de 30 minutos</AlertTitle>
          <AlertDescription>
            Não serão cobradas automaticamente. Confira e cancele manualmente:
            <ul className="mt-2 list-disc pl-5 text-xs">
              {orfas.map((s) => (
                <li key={s.id}>
                  {s.module} · {new Date(s.created_at as string).toLocaleString("pt-BR")} · {s.asaas_env} · {s.id.slice(0, 8)}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
