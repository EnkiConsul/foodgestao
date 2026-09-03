import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://aveto360.com",
  "https://www.aveto360.com",
  "https://foodgestao.lovable.app",
  "https://id-preview--ceeb4a17-6191-46b0-a351-c97a8211c03e.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function corsFor(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const colaboradorId = String(body?.colaborador_id ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!colaboradorId || !email) {
      return new Response(JSON.stringify({ error: "colaborador_id e email são obrigatórios" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, service);

    // Verifica colaborador e empresa
    const { data: colab, error: cErr } = await admin
      .from("dp_colaboradores")
      .select("id, company_id, nome, user_id")
      .eq("id", colaboradorId)
      .single();
    if (cErr || !colab) {
      return new Response(JSON.stringify({ error: "Colaborador não encontrado" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Verifica se o solicitante é admin/owner DESTA empresa específica (não papel global).
    const { data: isSuper } = await admin.rpc("has_role", {
      _user_id: userRes.user.id, _role: "super_admin",
    });
    const { data: company } = await admin
      .from("companies").select("user_id").eq("id", colab.company_id).single();
    const isOwner = company?.user_id === userRes.user.id;
    // Checa membership como admin/owner na empresa alvo.
    let isCompanyAdmin = false;
    if (!isOwner && !isSuper) {
      const { data: member } = await admin
        .from("company_members")
        .select("role")
        .eq("company_id", colab.company_id)
        .eq("user_id", userRes.user.id)
        .maybeSingle();
      isCompanyAdmin = member?.role === "admin" || member?.role === "owner";
    }
    if (!isSuper && !isOwner && !isCompanyAdmin) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Cria ou reutiliza usuário
    let targetUserId: string | null = null;
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = existing.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) {
      targetUserId = found.id;
    } else {
      const redirectTo = (req.headers.get("origin") ?? ALLOWED_ORIGINS[0]) + "/dp/meu";
      const invite = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (invite.error || !invite.data.user) {
        return new Response(JSON.stringify({ error: invite.error?.message ?? "Falha ao convidar" }), {
          status: 500, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      targetUserId = invite.data.user.id;
    }

    // Vincula ao colaborador
    const { error: linkErr } = await admin
      .from("dp_colaboradores")
      .update({ user_id: targetUserId, email_portal: email })
      .eq("id", colaboradorId);
    if (linkErr) {
      return new Response(JSON.stringify({ error: linkErr.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Atribui papel dp_colaborador
    await admin.from("user_roles").upsert(
      { user_id: targetUserId, role: "dp_colaborador" },
      { onConflict: "user_id,role" },
    );

    return new Response(
      JSON.stringify({ ok: true, user_id: targetUserId, reused: !!found }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
