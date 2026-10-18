import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Pendencia = { id: string; created_at: string; billing_account_id: string; payload: any; tipo_evento: string };

/**
 * Alerta do Backoffice: compensações pendentes no Asaas, desfazimentos locais
 * incompletos, pagamentos/cobranças ativas de contratações desfeitas e
 * assinaturas pendentes sem nada no Asaas há mais de 30 min. Só alerta.
 */
export function AlertaAssinaturasOrfas() {
  const { data: orfas } = useQuery({
    queryKey: ["admin-assinaturas-orfas"],
    queryFn: async () => {
      const limite = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id,module,created_at,billing_account_id,asaas_env,billing_cycle")
        .eq("status", "pending")
        .is("external_subscription_id", null)
        .lt("created_at", limite)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const ids = (data ?? []).map((s) => s.id);
      if (!ids.length) return [];
      // parcelamento anual não tem assinatura no Asaas: tem cobranças (faturas) vinculadas
      const { data: inv, error: e2 } = await supabase.from("invoices").select("subscription_id")
        .in("subscription_id", ids).not("external_invoice_id", "is", null);
      if (e2) throw e2;
      const comCobranca = new Set((inv ?? []).map((i: any) => i.subscription_id));
      return (data ?? []).filter((s) => !comCobranca.has(s.id));
    },
  });

  const { data: eventos } = useQuery({
    queryKey: ["admin-compensacoes-pendentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_account_events")
        .select("id,created_at,billing_account_id,payload,tipo_evento")
        .in("tipo_evento", ["contratacao_falhou_compensacao_pendente", "compensacao_resolvida", "desfazimento_incompleto", "desfazimento_resolvido"])
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const res = (t: string) => new Set((data ?? []).filter((e: any) => e.tipo_evento === t).map((e: any) => e.payload?.subscription_id));
      const compOk = res("compensacao_resolvida"), desfOk = res("desfazimento_resolvido");
      const lista = (data ?? []) as Pendencia[];
      return {
        compensacoes: lista.filter((e) => e.tipo_evento === "contratacao_falhou_compensacao_pendente" && !compOk.has(e.payload?.subscription_id)),
        incompletos: lista.filter((e) => e.tipo_evento === "desfazimento_incompleto" && !desfOk.has(e.payload?.subscription_id)),
      };
    },
  });

  const { data: desfeitas } = useQuery({
    queryKey: ["admin-desfeitas-alertas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("billing_v2_desfeita_eventos")
        .select("id,created_at,subscription_id,event_type,asaas_env,payment_id,motivo")
        .eq("alerta", true).is("resolvido_em", null).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const compensacoes = eventos?.compensacoes ?? [];
  const incompletos = eventos?.incompletos ?? [];
  if (!orfas?.length && !compensacoes.length && !incompletos.length && !desfeitas?.length) return null;
  return (
    <div className="space-y-3">
      {!!compensacoes.length && (
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
      {!!desfeitas?.length && (
        <Alert variant="destructive" className="border-2">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle className="font-bold">{desfeitas.length} aviso(s) do Asaas em contratações desfeitas</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc pl-5 text-xs">
              {desfeitas.map((d: any) => (
                <li key={d.id}>
                  {new Date(d.created_at).toLocaleString("pt-BR")} · {d.asaas_env} · {d.event_type} · cobrança {d.payment_id} · assinatura local{" "}
                  {String(d.subscription_id).slice(0, 8)} — {d.motivo}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {!!incompletos.length && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{incompletos.length} desfazimento(s) incompleto(s) no sistema</AlertTitle>
          <AlertDescription>
            A contratação falhou e algumas gravações locais não puderam ser desfeitas. Conferir:
            <ul className="mt-2 list-disc pl-5 text-xs">
              {incompletos.map((c) => (
                <li key={c.id}>
                  {new Date(c.created_at).toLocaleString("pt-BR")} · {c.payload?.asaas_env} · assinatura local{" "}
                  {String(c.payload?.subscription_id ?? "").slice(0, 8)} · falhou: {(c.payload?.falhas ?? []).join("; ")}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {!!orfas?.length && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{orfas.length} assinatura(s) pendente(s) sem assinatura nem cobrança no Asaas há mais de 30 minutos</AlertTitle>
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
