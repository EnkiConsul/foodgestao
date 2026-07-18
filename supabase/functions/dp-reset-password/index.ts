import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function generateTempPassword(): string {
  // 12-char random password with letters + digits (no ambiguous chars)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
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

    // Valida o chamador via getClaims
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

    // Busca colaborador com service role para depois checar authz explicitamente
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

    // Random temporary password (no longer derived from CPF)
    const newPassword = generateTempPassword();

    const { error: updErr } = await admin.auth.admin.updateUserById(colab.user_id, {
      password: newPassword,
    });
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, password: newPassword }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
