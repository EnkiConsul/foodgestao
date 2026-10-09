// Rotina diária: aplica trocas agendadas e cancelamentos no fim do ciclo.
// Atua só em asaas_env = 'production' ou contas de teste marcadas (is_test).
// Autorização: x-cron-secret (PLUGGY_CRON_SECRET) ou service role.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { serviceClient } from "../_shared/authz.ts";
import { secretMatches } from "../_shared/secret.ts";
import { processarRenovacao } from "../_shared/billing-v2.ts";
import { sendTemplateEmail } from "../_shared/transactional-email-templates/send-email.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secretMatches(req.headers.get("x-cron-secret"), Deno.env.get("PLUGGY_CRON_SECRET")) ||
    secretMatches(bearer, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!ok) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const somenteTeste = body?.somente_teste === true;
  const admin = serviceClient();
  const { data: devidas, error } = await admin.rpc("billing_v2_renovacoes_devidas", { _somente_teste: somenteTeste });
  if (error) return json({ error: error.message }, 500);

  const resultados: unknown[] = [];
  for (const d of devidas ?? []) {
    try {
      const r = await processarRenovacao(admin, d.subscription_id, d.acao);
      const { data: acc } = await admin.from("billing_accounts").select("titular_user_id,email_cobranca,nome").eq("id", r.sub.billing_account_id).single();
      const { data: au } = await admin.auth.admin.getUserById(acc!.titular_user_id);
      const para = acc?.email_cobranca ?? au?.user?.email ?? null;
      const { data: pa } = await admin.from("plans").select("name").eq("id", r.sub.plan_id).single();
      const { data: pn } = r.pend ? await admin.from("plans").select("name").eq("slug", r.pend.plano).single() : { data: null };
      const dados = { nome: au?.user?.user_metadata?.full_name ?? acc?.nome, resultado: r.resultado, planoAtual: pa?.name,
        planoNovo: pn?.name, motivo: r.motivo, valor: r.novo_valor_cents != null ? brl(r.novo_valor_cents) : undefined };
      let email = "sem destinatário";
      if (para && d.is_test) email = `simulado (conta de teste): ${r.resultado}`;
      else if (para) {
        const hojeBRT = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
        await sendTemplateEmail("billing-plan-change", para, { templateData: dados, idempotencyKey: `plan-change-${d.subscription_id}-${hojeBRT}` });
        email = "enviado";
      }
      await admin.from("subscription_events").insert({ subscription_id: d.subscription_id, tipo_evento: "aviso_renovacao", payload: { resultado: r.resultado, email } });
      resultados.push({ subscription_id: d.subscription_id, acao: d.acao, resultado: r.resultado, motivo: r.motivo, email });
    } catch (e) {
      console.error("renovacao", d.subscription_id, e);
      resultados.push({ subscription_id: d.subscription_id, acao: d.acao, erro: String((e as Error).message ?? e) });
    }
  }
  return json({ ok: true, processadas: resultados.length, resultados });
});
