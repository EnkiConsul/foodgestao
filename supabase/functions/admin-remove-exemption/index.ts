// Revoga a isenção de uma assinatura SEM ativar o cliente: abre um período
// de carência (status 'grace') com data final, registra auditoria e avisa o
// dono por e-mail. Apenas super admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { sendTemplateEmail } from "../_shared/transactional-email-templates/send-email.ts";

const SITE_URL = "https://www.aveto360.com";

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

const dataBR = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Sessão expirada. Entre novamente." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: u.user.id });
    if (!isSuper) return json({ error: "Apenas o super admin pode revogar isenções." }, 403);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Dados inválidos.";
      return json({ error: msg }, 400);
    }
    const { subscriptionId, reason } = parsed.data;

    const { data: sub } = await admin.from("subscriptions")
      .select("id, user_id, company_id, status, is_exempt, exempt_until, exempt_reason, grace_ends_at, module")
      .eq("id", subscriptionId).maybeSingle();
    if (!sub) return json({ error: "Assinatura não encontrada." }, 404);
    if (!sub.is_exempt) return json({ error: "Esta assinatura não está isenta." }, 409);

    const { data: param } = await admin.from("system_parameters")
      .select("value").eq("key", "carencia_pos_cortesia_dias").maybeSingle();
    const dias = Number.isInteger(Number(param?.value)) && Number(param?.value) > 0 ? Number(param?.value) : 10;
    const graceEndsAt = new Date(Date.now() + dias * 86400000).toISOString();

    const anterior = {
      status: sub.status, is_exempt: sub.is_exempt, exempt_until: sub.exempt_until,
      exempt_reason: sub.exempt_reason, grace_ends_at: sub.grace_ends_at,
    };
    const novo = {
      status: "grace", is_exempt: false, exempt_until: null, exempt_reason: null, grace_ends_at: graceEndsAt,
    };

    const { error: updErr } = await admin.from("subscriptions").update({
      ...novo,
      exempted_by: null,
      exempted_at: null,
      dunning_stage: 0,
    }).eq("id", subscriptionId);
    if (updErr) return json({ error: `Não foi possível revogar: ${updErr.message}` }, 500);

    // e-mail ao dono (falha no envio não desfaz a revogação)
    let emailEnviado = false;
    let emailErro: string | null = null;
    try {
      const { data: dono } = await admin.auth.admin.getUserById(sub.user_id);
      const email = dono?.user?.email;
      const { data: perfil } = await admin.from("profiles").select("full_name")
        .eq("user_id", sub.user_id).maybeSingle();
      let empresa: string | undefined;
      const q = admin.from("companies").select("name").order("created_at", { ascending: true }).limit(1);
      const { data: emp } = sub.company_id
        ? await q.eq("id", sub.company_id).maybeSingle()
        : await q.eq("user_id", sub.user_id).maybeSingle();
      empresa = (emp?.name as string | undefined) ?? undefined;
      if (email) {
        const r = await sendTemplateEmail("billing-dunning", email, {
          templateData: {
            stage: "cortesia_encerrada",
            nome: (perfil?.full_name as string | null)?.split(" ")[0] ?? undefined,
            empresa,
            data: dataBR(graceEndsAt),
            linkPlanos: `${SITE_URL}/planos`,
            link: `${SITE_URL}/planos`,
          },
          idempotencyKey: `cortesia-encerrada-${subscriptionId}-${graceEndsAt.slice(0, 10)}`,
        });
        emailEnviado = r.sent;
        if (!r.sent) emailErro = r.reason;
      } else {
        emailErro = "dono sem e-mail";
      }
    } catch (e) {
      emailErro = e instanceof Error ? e.message : "erro desconhecido";
      console.error("[admin-remove-exemption] e-mail:", emailErro);
    }

    await admin.from("audit_logs").insert({
      user_id: u.user.id,
      action: "subscription_exemption_removed",
      entity_type: "subscription",
      entity_id: subscriptionId,
      details: {
        target_user_id: sub.user_id,
        motivo: reason,
        carencia_dias: dias,
        estado_anterior: anterior,
        estado_novo: novo,
        email_enviado: emailEnviado,
        email_erro: emailErro,
      },
    });

    return json({ ok: true, graceEndsAt, dias, emailEnviado, emailErro });
  } catch (e) {
    console.error("[admin-remove-exemption] error", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
