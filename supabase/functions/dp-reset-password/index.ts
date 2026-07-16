import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Valida o chamador
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const colaboradorId = body?.colaborador_id as string | undefined;
    if (!colaboradorId) {
      return new Response(JSON.stringify({ error: "colaborador_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Busca colaborador (RLS garante que o chamador só vê da própria empresa via userClient)
    const { data: colab, error: colErr } = await userClient
      .from("dp_colaboradores")
      .select("id, cpf, user_id, nome, company_id")
      .eq("id", colaboradorId)
      .maybeSingle();
    if (colErr || !colab) {
      return new Response(JSON.stringify({ error: "Colaborador não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!colab.user_id) {
      return new Response(JSON.stringify({ error: "Colaborador não possui usuário vinculado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cpfDigits = (colab.cpf ?? "").replace(/\D/g, "");
    if (cpfDigits.length < 6) {
      return new Response(JSON.stringify({ error: "CPF inválido para gerar senha" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const newPassword = cpfDigits.slice(-6);

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
