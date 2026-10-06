// Revoga a isenção de uma assinatura SEM ativar o cliente: abre carência
// (status 'grace') até 23:59:59 (Brasília) do último dia, registra auditoria e
// avisa o dono por e-mail. Apenas super admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { avisarDono, diasCarencia, fimCarencia } from "../_shared/grace.ts";

const BodySchema = z.object({
  subscriptionId: z.string().uuid(),
  reason: z.string().trim().min(10, "Informe o motivo da revogação (mínimo 10 caracteres).").max(500),
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Sessão expirada. Entre novamente." }, 401);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: u.user.id });
    if (!isSuper) return json({ error: "Apenas o super admin pode revogar isenções." }, 403);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, 400);
    const { subscriptionId, reason } = parsed.data;

    const { data: sub } = await admin.from("subscriptions")
      .select("id, user_id, company_id, status, is_exempt, exempt_until, exempt_reason, grace_ends_at, module")
      .eq("id", subscriptionId).maybeSingle();
    if (!sub) return json({ error: "Assinatura não encontrada." }, 404);
    if (!sub.is_exempt) return json({ error: "Esta assinatura não está isenta." }, 409);

    const dias = await diasCarencia(admin);
    const graceEndsAt = fimCarencia(dias);

    const anterior = {
      status: sub.status, is_exempt: sub.is_exempt, exempt_until: sub.exempt_until,
      exempt_reason: sub.exempt_reason, grace_ends_at: sub.grace_ends_at,
    };
    const novo = { status: "grace", is_exempt: false, exempt_until: null, exempt_reason: null, grace_ends_at: graceEndsAt };

    const { error: updErr } = await admin.rpc("billing_v2_revoke_exemption", {
      _sub: subscriptionId, _grace_ends: graceEndsAt, _reason: reason, _actor: u.user.id,
    });
    if (updErr) return json({ error: `Não foi possível revogar: ${updErr.message}` }, 500);

    const { emailEnviado, emailErro } = await avisarDono(admin, sub, graceEndsAt);

    await admin.from("audit_logs").insert({
      user_id: u.user.id,
      action: "subscription_exemption_removed",
      entity_type: "subscription",
      entity_id: subscriptionId,
      details: {
        target_user_id: sub.user_id, modulo: sub.module, motivo: reason, carencia_dias: dias,
        estado_anterior: anterior, estado_novo: novo, email_enviado: emailEnviado, email_erro: emailErro,
      },
    });

    return json({ ok: true, graceEndsAt, dias, emailEnviado, emailErro });
  } catch (e) {
    console.error("[admin-remove-exemption] error", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
