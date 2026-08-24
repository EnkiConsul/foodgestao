import { corsHeaders, createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const BodySchema = z.object({
  cnpj: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 14),
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceRoleKey) return json({ error: "Backend unavailable" }, 503);

    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.slice("Bearer ".length);
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsError || typeof userId !== "string") return json({ error: "Unauthorized" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "CNPJ inválido." }, 400);

    const admin = createClient(url, serviceRoleKey);
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id, user_id")
      .eq("cnpj", parsed.data.cnpj)
      .eq("profile_type", "empresarial")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) return json({ status: "available" });
    if (company.user_id === userId) return json({ status: "accessible", company_id: company.id });

    const { data: membership, error: membershipError } = await admin
      .from("company_members")
      .select("company_id")
      .eq("company_id", company.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (membership) return json({ status: "accessible", company_id: company.id });

    return json({ status: "registered" });
  } catch (error) {
    console.error("[check-onboarding-cnpj] failed", error);
    return json({ error: "Não foi possível verificar o CNPJ." }, 500);
  }
});