import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Assinaturas pendentes sem vínculo no Asaas há mais de 30 min: só alerta, nunca cobrança automática. */
export function AlertaAssinaturasOrfas() {
  const { data } = useQuery({
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
  if (!data?.length) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{data.length} assinatura(s) pendente(s) sem vínculo no Asaas há mais de 30 minutos</AlertTitle>
      <AlertDescription>
        Não serão cobradas automaticamente. Confira e cancele manualmente:
        <ul className="mt-2 list-disc pl-5 text-xs">
          {data.map((s) => (
            <li key={s.id}>
              {s.module} · {new Date(s.created_at as string).toLocaleString("pt-BR")} · {s.asaas_env} · {s.id.slice(0, 8)}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
