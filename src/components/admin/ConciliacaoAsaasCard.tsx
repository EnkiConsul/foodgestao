import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TIPO: Record<string, string> = {
  valor_assinatura: "Valor da assinatura diferente", assinatura_inativa_no_asaas: "Assinatura inativa no Asaas",
  assinatura_nao_encontrada: "Assinatura não encontrada no Asaas", status_cobranca: "Status da cobrança diferente",
  valor_cobranca: "Valor da cobrança diferente", cobranca_nao_encontrada: "Cobrança não encontrada no Asaas",
};

/** Divergências da conciliação diária com o Asaas (produção). Só aponta; nada é corrigido automaticamente. */
export function ConciliacaoAsaasCard() {
  const q = useQuery({
    queryKey: ["conciliacao-asaas-divergencias"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("billing_v2_conciliacao_divergencias")
        .select("id,tipo,external_id,local,asaas,created_at").eq("asaas_env", "production").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Conciliação Diária com o Asaas</CardTitle>
        <CardDescription>Diferenças encontradas entre o sistema e o Asaas. Nada é corrigido automaticamente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {q.isLoading ? "Carregando..." : !(q.data ?? []).length ? <p className="text-muted-foreground">Nenhuma divergência encontrada.</p> :
          q.data!.map((d) => (
            <div key={d.id} className="flex flex-wrap justify-between gap-2 border-b py-1">
              <span>{TIPO[d.tipo] ?? d.tipo} · {d.external_id}</span>
              <span className="text-muted-foreground">sistema {JSON.stringify(d.local)} · Asaas {JSON.stringify(d.asaas)} · {new Date(d.created_at).toLocaleString("pt-BR")}</span>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
