import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client to get user info
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "Token não fornecido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin client to bypass RLS
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find invite
    const { data: invite, error: inviteError } = await adminClient
      .from("company_invites")
      .select("*, companies(name)")
      .eq("token", token)
      .eq("status", "pending")
      .single();

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: "Convite não encontrado ou já utilizado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      await adminClient
        .from("company_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);

      return new Response(JSON.stringify({ error: "Convite expirado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already a member
    const { data: existing } = await adminClient
      .from("company_members")
      .select("id")
      .eq("company_id", invite.company_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await adminClient
        .from("company_invites")
        .update({ status: "accepted" })
        .eq("id", invite.id);

      return new Response(JSON.stringify({ 
        success: true, 
        company_name: invite.companies?.name,
        message: "Você já é membro desta empresa" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add as member
    const { error: memberError } = await adminClient
      .from("company_members")
      .insert({
        company_id: invite.company_id,
        user_id: user.id,
        role: invite.role,
      });

    if (memberError) {
      return new Response(JSON.stringify({ error: "Erro ao adicionar membro: " + memberError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update invite status
    await adminClient
      .from("company_invites")
      .update({ status: "accepted" })
      .eq("id", invite.id);

    return new Response(JSON.stringify({ 
      success: true, 
      company_name: invite.companies?.name 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
