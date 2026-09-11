import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const adminAuth = createClient(SUPABASE_URL, SERVICE_ROLE);
    // Valida via claims (compatível com signing keys). Fallback para getUser.
    let callerId: string | null = null;
    const authApi = adminAuth.auth as unknown as {
      getClaims?: (t: string) => Promise<{ data?: { claims?: { sub?: string } } }>;
    };
    if (typeof authApi.getClaims === "function") {
      const { data: claimsData } = await authApi.getClaims(token);
      callerId = claimsData?.claims?.sub ?? null;
    }
    if (!callerId) {
      const { data: userData } = await adminAuth.auth.getUser(token);
      callerId = userData?.user?.id ?? null;
    }
    if (!callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isSuper, error: roleErr } = await admin.rpc("is_super_admin", {
      _user_id: callerId,
    });
    if (roleErr || !isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profiles, error: profErr } = await admin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (profErr) throw profErr;

    // Page through auth users
    const authMap = new Map<string, any>();
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      for (const u of data.users) {
        authMap.set(u.id, {
          email: u.email,
          phone: u.phone,
          email_confirmed_at: u.email_confirmed_at,
          last_sign_in_at: u.last_sign_in_at,
          created_at: u.created_at,
        });
      }
      if (data.users.length < perPage) break;
      page++;
      if (page > 20) break;
    }

    // Empresas vinculadas (dono via companies.user_id, convidado via company_members)
    const { data: companies } = await admin
      .from("companies")
      .select("id, name, trade_name, user_id");
    const { data: members } = await admin
      .from("company_members")
      .select("company_id, user_id, role");

    const companyById = new Map<string, any>();
    (companies ?? []).forEach((c: any) => companyById.set(c.id, c));

    const companiesByUser = new Map<string, any[]>();
    const push = (userId: string | null, entry: any) => {
      if (!userId) return;
      const list = companiesByUser.get(userId) ?? [];
      if (list.some((e) => e.id === entry.id)) return;
      list.push(entry);
      companiesByUser.set(userId, list);
    };
    (companies ?? []).forEach((c: any) =>
      push(c.user_id, { id: c.id, name: c.trade_name || c.name, role: "owner" }),
    );
    (members ?? []).forEach((m: any) => {
      const c = companyById.get(m.company_id);
      if (!c) return;
      push(m.user_id, {
        id: c.id,
        name: c.trade_name || c.name,
        role: c.user_id === m.user_id ? "owner" : m.role || "member",
      });
    });

    const users = (profiles ?? []).map((p: any) => ({
      ...p,
      auth: authMap.get(p.user_id) ?? null,
      companies: companiesByUser.get(p.user_id) ?? [],
    }));


    return new Response(JSON.stringify({ users }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
