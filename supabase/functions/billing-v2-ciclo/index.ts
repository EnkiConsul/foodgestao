// Rotina diária do ciclo v2: apura colaboradores excedentes do mês anterior (Pessoas),
// soma pendências na mensalidade gerada pelo Asaas e concilia com o Asaas (só aponta).
// Atua só em produção ou em contas de teste marcadas (is_test, sandbox).
// Autorização: x-cron-secret (PLUGGY_CRON_SECRET) ou service role.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { serviceClient } from "../_shared/authz.ts";
import { secretMatches } from "../_shared/secret.ts";
import { aplicarPendentes, apurarExcedentes, conciliar, simularExcedentes } from "../_shared/billing-v2-ciclo.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secretMatches(req.headers.get("x-cron-secret"), Deno.env.get("PLUGGY_CRON_SECRET")) ||
    secretMatches(bearer, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!ok) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const somenteTeste = body.somente_teste === true;
  const simular = body.simular === true;
  const etapas: string[] = body.etapas ?? ["excedentes", "pendencias", "conciliacao"];
  const admin = serviceClient();
  const out: Record<string, unknown> = {};

  // contas elegíveis: produção (rotina normal) ou só contas de teste do Sandbox
  const { data: contas } = await admin.from("billing_accounts").select("id,nome,asaas_env,is_test")
    .eq(somenteTeste ? "is_test" : "asaas_env", somenteTeste ? true : "production");
  const nomes = new Map((contas ?? []).map((c: any) => [c.id, c.nome]));
  let contaIds = (contas ?? []).filter((c: any) => somenteTeste ? c.asaas_env === "sandbox" : !c.is_test).map((c: any) => c.id);
  if (Array.isArray(body.contas) && body.contas.length) contaIds = contaIds.filter((c) => body.contas.includes(c));

  const agoraBRT = new Date(Date.now() - 3 * 3600000);
  const anterior = new Date(Date.UTC(agoraBRT.getUTCFullYear(), agoraBRT.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const competencia: string = body.competencia ?? anterior;

  // Produção: excedentes e pendências só com checkout_v2 = 'v2'. Conciliação segue sempre.
  let cobrancaLiberada = true;
  if (!somenteTeste) {
    const { data: p } = await admin.from("system_parameters").select("value").eq("key", "checkout_v2").maybeSingle();
    const modo = typeof (p as any)?.value === "string" ? (p as any).value : "legado";
    cobrancaLiberada = modo === "v2";
    out.checkout_v2 = modo;
  }

  if (etapas.includes("excedentes") && contaIds.length) {
    const fimComp = new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 1)).toISOString();
    const { data: subs } = await admin.from("subscriptions").select("id,billing_account_id").eq("module", "pessoas").in("billing_account_id", contaIds)
      .in("status", ["active", "past_due", "grace"]).lt("current_period_start", body.competencia ? "9999-01-01" : fimComp);
    const res: unknown[] = [];
    if (simular) {
      for (const s of subs ?? []) {
        try { res.push({ subscription_id: s.id, conta: nomes.get(s.billing_account_id), ...(await simularExcedentes(admin, s.id, competencia)) }); }
        catch (e) { res.push({ subscription_id: s.id, conta: nomes.get(s.billing_account_id), erro: String((e as Error).message) }); }
      }
      out.excedentes = { competencia, simulacao: true, executaria: cobrancaLiberada, apuradas: res,
        total_a_cobrar_cents: cobrancaLiberada ? res.reduce((t: number, r: any) => t + (r.valor_a_cobrar_cents ?? 0), 0) : 0 };
    } else if (!cobrancaLiberada) {
      out.excedentes = { ignorado: "checkout_v2 diferente de 'v2' em produção" };
    } else {
      for (const s of subs ?? []) {
        try { res.push({ subscription_id: s.id, ...(await apurarExcedentes(admin, s.id, competencia)) }); }
        catch (e) { res.push({ subscription_id: s.id, erro: String((e as Error).message) }); }
      }
      out.excedentes = { competencia, apuradas: res };
    }
  }
  if (etapas.includes("pendencias") && contaIds.length) {
    const { data: pend } = await admin.from("billing_v2_cobrancas_pendentes").select("subscription_id,valor_cents, subscriptions!inner(billing_account_id)")
      .is("cobrado_em", null).in("subscriptions.billing_account_id", contaIds);
    const ids = [...new Set((pend ?? []).map((p: any) => p.subscription_id))];
    if (simular) {
      out.pendencias = { simulacao: true, executaria: cobrancaLiberada, assinaturas_com_pendencia: ids.length,
        total_pendente_cents: (pend ?? []).reduce((t: number, p: any) => t + p.valor_cents, 0) };
    } else if (!cobrancaLiberada) {
      out.pendencias = { ignorado: "checkout_v2 diferente de 'v2' em produção" };
    } else {
      const res: unknown[] = [];
      for (const id of ids) {
        try { res.push({ subscription_id: id, ...(await aplicarPendentes(admin, id)) }); }
        catch (e) { res.push({ subscription_id: id, erro: String((e as Error).message) }); }
      }
      out.pendencias = res;
    }
  }
  if (simular) {
    return json({ ok: true, simulacao: true, ambiente: somenteTeste ? "sandbox (teste)" : "production", contas: contaIds.length, ...out });
  }
  if (etapas.includes("conciliacao") && contaIds.length) {
    const r = await conciliar(admin, { env: somenteTeste ? "sandbox" : "production", contas: contaIds });
    out.conciliacao = { ...r, divergencias: r.divergencias.length, detalhes: body.detalhar ? r.divergencias : undefined };
  }
  return json({ ok: true, ambiente: somenteTeste ? "sandbox (teste)" : "production", contas: contaIds.length, ...out });
});
