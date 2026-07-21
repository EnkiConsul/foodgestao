import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SYNTHETIC_EMAIL_DOMAIN = "portal.360food.local";

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const colaboradorId = String(body?.colaborador_id ?? "").trim();
    if (!colaboradorId) {
      return new Response(JSON.stringify({ error: "colaborador_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, service);

    const { data: colab, error: cErr } = await admin
      .from("dp_colaboradores")
      .select("id, cpf, user_id, nome, company_id, email_portal")
      .eq("id", colaboradorId)
      .maybeSingle();
    if (cErr || !colab) {
      return new Response(JSON.stringify({ error: "Colaborador não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authz: super_admin OR owner OR admin da empresa
    const { data: isSuper } = await admin.rpc("has_role", {
      _user_id: callerId, _role: "super_admin",
    });
    const { data: company } = await admin
      .from("companies").select("user_id").eq("id", colab.company_id).maybeSingle();
    const isOwner = company?.user_id === callerId;
    let isCompanyAdmin = false;
    if (!isOwner && !isSuper) {
      const { data: member } = await admin
        .from("company_members")
        .select("role")
        .eq("company_id", colab.company_id)
        .eq("user_id", callerId)
        .maybeSingle();
      isCompanyAdmin = member?.role === "admin" || member?.role === "owner";
    }
    if (!isSuper && !isOwner && !isCompanyAdmin) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (colab.user_id) {
      return new Response(JSON.stringify({
        error: "Colaborador já possui acesso. Use 'Resetar senha' para gerar uma nova.",
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cpf = digitsOnly(colab.cpf);
    if (cpf.length !== 11) {
      return new Response(JSON.stringify({
        error: "CPF do colaborador está incompleto (precisa ter 11 dígitos).",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const email = `cpf${cpf}@${SYNTHETIC_EMAIL_DOMAIN}`;
    const password = cpf.slice(-6); // 6 últimos dígitos do CPF

    // Cria usuário no Auth (sem envio de email)
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        colaborador_id: colab.id,
        kind: "dp_colaborador",
        cpf,
        nome: colab.nome,
      },
    });
    if (created.error || !created.data.user) {
      return new Response(JSON.stringify({ error: created.error?.message ?? "Falha ao criar usuário" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const targetUserId = created.data.user.id;

    // Vincula ao colaborador
    const { error: linkErr } = await admin
      .from("dp_colaboradores")
      .update({ user_id: targetUserId, email_portal: email })
      .eq("id", colab.id);
    if (linkErr) {
      return new Response(JSON.stringify({ error: linkErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atribui papel dp_colaborador
    await admin.from("user_roles").upsert(
      { user_id: targetUserId, role: "dp_colaborador" },
      { onConflict: "user_id,role" },
    );

    return new Response(JSON.stringify({
      success: true,
      user_id: targetUserId,
      cpf,
      password,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
