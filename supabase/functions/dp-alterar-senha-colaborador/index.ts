import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Simple in-memory rate limit: 5 requests/min per caller
const bucket = new Map<string, number[]>();
function rateLimited(callerId: string): boolean {
  const now = Date.now();
  const arr = (bucket.get(callerId) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  bucket.set(callerId, arr);
  return arr.length > 5;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Sessão inválida" }, 401);
    const callerId = claimsData.claims.sub as string;

    if (rateLimited(callerId)) return json({ error: "Muitas tentativas. Aguarde 1 minuto." }, 429);

    const body = await req.json().catch(() => ({}));
    const colaboradorId = body?.colaborador_id;
    const novaSenha = body?.nova_senha;

    if (!colaboradorId || typeof colaboradorId !== "string") {
      return json({ error: "colaborador_id obrigatório" }, 400);
    }
    if (typeof novaSenha !== "string" || novaSenha.length < 6 || novaSenha.length > 72) {
      return json({ error: "Senha deve ter entre 6 e 72 caracteres" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: colab, error: colErr } = await admin
      .from("dp_colaboradores")
      .select("id, cpf, user_id, nome, company_id")
      .eq("id", colaboradorId)
      .maybeSingle();
    if (colErr || !colab) return json({ error: "Colaborador não encontrado" }, 404);

    if (!colab.user_id) return json({ error: "Colaborador não possui usuário vinculado" }, 400);
    if (colab.user_id === callerId) {
      return json({ error: "Use a tela do próprio perfil para alterar sua senha" }, 400);
    }

    // Authorization: super_admin OR company owner OR admin/owner member
    const { data: isSuper } = await admin.rpc("has_role", {
      _user_id: callerId,
      _role: "super_admin",
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
      return json({ error: "Sem permissão" }, 403);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(colab.user_id, {
      password: novaSenha,
    });
    if (updErr) return json({ error: updErr.message }, 500);

    // Audit log (never store the password itself)
    await admin.from("audit_logs").insert({
      user_id: callerId,
      action: "dp_admin_password_change",
      table_name: "auth.users",
      record_id: colab.user_id,
      metadata: {
        colaborador_id: colab.id,
        colaborador_nome: colab.nome,
        company_id: colab.company_id,
      },
    });

    return json({ success: true });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
