import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateProvisionalPassword } from "../_shared/provisional-password.ts";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
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
    const colaboradorId = body?.colaborador_id as string | undefined;
    if (!colaboradorId || typeof colaboradorId !== "string") {
      return new Response(JSON.stringify({ error: "colaborador_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: colab, error: colErr } = await admin
      .from("dp_colaboradores")
      .select("id, cpf, user_id, nome, company_id")
      .eq("id", colaboradorId)
      .maybeSingle();
    if (colErr || !colab) {
      return new Response(JSON.stringify({ error: "Colaborador não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: super_admin OR company owner OR company admin/owner member
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

    if (!colab.user_id) {
      return new Response(JSON.stringify({ error: "Colaborador não possui usuário vinculado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Senha provisória aleatória — nunca derivada do CPF (que também é o login)
    const newPassword = generateProvisionalPassword();

    const { error: updErr } = await admin.auth.admin.updateUserById(colab.user_id, {
      password: newPassword,
    });
    if (updErr) {
      console.error("[dp-reset-password]", updErr.message);
      return new Response(JSON.stringify({ error: "Não foi possível concluir a operação." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Senha provisória: o colaborador precisa trocar no próximo login
    const { error: secErr } = await admin.from("auth_user_security_state").upsert(
      {
        user_id: colab.user_id,
        must_change_password: true,
        provisional_password_issued_at: new Date().toISOString(),
        password_changed_by: callerId,
      },
      { onConflict: "user_id" },
    );
    if (secErr) console.error("[dp-reset-password] security_state:", secErr.message);

    return new Response(JSON.stringify({ success: true, password: newPassword, provisoria: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[dp-reset-password] fatal:", e);
    return new Response(JSON.stringify({ error: "Não foi possível concluir a operação." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
