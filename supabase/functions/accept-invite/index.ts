import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { strictCorsHeaders } from "../_shared/http.ts";
import { aplicarGrupoConvite, waEmail } from "../_shared/company-invite-accept.ts";

function getCorsHeaders(req: Request) {
  return {
    ...strictCorsHeaders(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}


Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

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

    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const inviteId = typeof body?.invite_id === "string" ? body.invite_id.trim() : "";
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if ((!token && !inviteId) || token.length > 256 || (inviteId && !uuidRe.test(inviteId))) {
      return new Response(JSON.stringify({ error: "Convite inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const query = adminClient
      .from("company_invites")
      .select("*, companies(name)")
      .eq("status", "pending");

    const { data: invite, error: inviteError } = await (
      inviteId ? query.eq("id", inviteId) : query.eq("token", token)
    ).single();

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: "Convite não encontrado ou já utilizado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userEmail = (user.email ?? "").toLowerCase();
    const emailMatch = !!invite.invited_email && userEmail === String(invite.invited_email).toLowerCase();
    const waMatch = !!invite.whatsapp && userEmail === waEmail(String(invite.whatsapp));
    if (!emailMatch && !waMatch) {
      return new Response(JSON.stringify({ error: "Este convite foi enviado para outra pessoa. Entre com o e-mail ou WhatsApp convidado." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    let empresas: string[] = [];
    try {
      empresas = await aplicarGrupoConvite(adminClient, invite.grupo_id, user.id);
    } catch {
      return new Response(JSON.stringify({ error: "Erro ao processar convite" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      company_name: empresas.join(", ") || invite.companies?.name,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const corsHeaders = getCorsHeaders(req);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
