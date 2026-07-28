// Lista items na Pluggy e apaga aqueles sem correspondência local
// (nem em open_finance_connections nem em pluggy_v2_connections).
// Body: { company_id: uuid } — apenas para autorização (admin/owner da empresa).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { listItems, deleteItem, safePluggyError } from "../_shared/pluggy-client.ts";

const BodySchema = z.object({ company_id: z.string().uuid() });

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthenticated" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseUser = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: userErr } = await supabaseUser.auth.getClaims(token);
  if (userErr || !claims?.claims?.sub) return json(401, { error: "unauthenticated" });
  const userId = claims.claims.sub as string;

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return json(400, { error: "invalid_body" });
  }

  const supabase = createClient(url, service);

  const { data: allowed, error: roleErr } = await supabase.rpc("is_company_admin_or_owner", {
    _user_id: userId,
    _company_id: parsed.company_id,
  });
  if (roleErr || !allowed) return json(403, { error: "forbidden" });

  // Coleta todos os pluggy_item_id conhecidos localmente (qualquer empresa).
  const known = new Set<string>();
  const { data: v1 } = await supabase.from("open_finance_connections").select("pluggy_item_id");
  (v1 ?? []).forEach((r: any) => r.pluggy_item_id && known.add(r.pluggy_item_id));
  const { data: v2 } = await supabase.from("pluggy_v2_connections").select("pluggy_item_id");
  (v2 ?? []).forEach((r: any) => r.pluggy_item_id && known.add(r.pluggy_item_id));

  let deleted_count = 0;
  const errors: string[] = [];
  try {
    let page = 1;
    for (;;) {
      const res = await listItems({ page, pageSize: 100 });
      const results = (res as any)?.results ?? [];
      for (const item of results) {
        if (!item?.id || known.has(item.id)) continue;
        try {
          await deleteItem(item.id);
          deleted_count++;
        } catch (e) {
          errors.push(`${item.id}: ${(e as Error).message}`);
        }
      }
      const total = (res as any)?.total ?? results.length;
      const pageSize = (res as any)?.pageSize ?? 100;
      if (page * pageSize >= total || results.length === 0) break;
      page++;
      if (page > 50) break; // safety
    }
  } catch (e) {
    return json(502, { error: "pluggy_error", detail: safePluggyError(e) });
  }

  return json(200, { deleted_count, errors });
});
