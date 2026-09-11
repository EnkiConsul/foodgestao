import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";

const BodySchema = z.object({ companyId: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonError(req, "unauthorized");
    const token = authHeader.slice("Bearer ".length).trim();
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return jsonError(req, "internal");

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const userId = userData.user?.id;
    if (userError || !userId) return jsonError(req, "unauthorized", userError);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError(req, "invalid_input", parsed.error.flatten());

    const { data: allowed, error: accessError } = await admin.rpc("is_company_admin_or_owner", {
      _user_id: userId,
      _company_id: parsed.data.companyId,
    });
    if (accessError || !allowed) return jsonError(req, "forbidden", accessError);

    const { data: apuradoEm, error } = await admin.rpc("dp_refresh_my_company_pending", {
      p_company_id: parsed.data.companyId,
    });
    if (error) return jsonError(req, "internal", error);
    return jsonResponse(req, 200, { apuradoEm });
  } catch (error) {
    return jsonError(req, "internal", error);
  }
});