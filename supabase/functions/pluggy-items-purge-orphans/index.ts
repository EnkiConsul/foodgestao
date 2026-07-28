// Purga itens Pluggy órfãos: presentes no lado da Pluggy mas sem registro em
// open_finance_connections. Útil quando o widget acusa "Você já possui uma
// conexão com este acesso" mas nada aparece em Contas Bancárias.
//
// Body: { company_id: uuid, dry_run?: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { deleteItem, listItems, safePluggyError } from "../_shared/pluggy-client.ts";

const BodySchema = z.object({
  company_id: z.string().uuid(),
  dry_run: z.boolean().optional(),
});

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
  const { data: claims, error: claimsErr } = await supabaseUser.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) return json(401, { error: "unauthenticated" });
  const userId = claims.claims.sub as string;

  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch { return json(400, { error: "invalid_body" }); }

  const supabase = createClient(url, service);

  const { data: allowed } = await supabase.rpc("is_company_admin_or_owner", {
    _user_id: userId,
    _company_id: body.company_id,
  });
  if (!allowed) return json(403, { error: "forbidden" });

  // 1) Lista itens conhecidos em nossa base (para todas as empresas — a Pluggy
  //    não segrega por company, então qualquer item registrado é "conhecido").
  const { data: known, error: knownErr } = await supabase
    .from("open_finance_connections")
    .select("pluggy_item_id");
  if (knownErr) {
    console.error("[purge-orphans] load known failed", knownErr.message);
    return json(500, { error: "load_known_failed" });
  }
  const knownSet = new Set((known ?? []).map((r) => r.pluggy_item_id).filter(Boolean) as string[]);

  // 2) Lista todos os itens no lado Pluggy (paginado).
  const orphans: string[] = [];
  const inspected: string[] = [];
  let page = 1;
  while (true) {
    const resp = await listItems({ page, pageSize: 100 });
    if (!resp.ok) {
      return json(502, { error: safePluggyError(resp.error, resp.httpStatus) });
    }
    for (const it of resp.data.results ?? []) {
      inspected.push(it.id);
      if (!knownSet.has(it.id)) orphans.push(it.id);
    }
    if (page >= (resp.data.totalPages ?? 1)) break;
    page++;
    if (page > 20) break; // safety
  }

  if (body.dry_run) {
    return json(200, { inspected_count: inspected.length, orphans_count: orphans.length, orphans });
  }

  // 3) Deleta órfãos.
  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of orphans) {
    const r = await deleteItem(id);
    if (r.ok) deleted.push(id);
    else failed.push({ id, error: safePluggyError(r.error, r.httpStatus) });
  }

  console.log(`[purge-orphans] inspected=${inspected.length} deleted=${deleted.length} failed=${failed.length}`);

  return json(200, {
    inspected_count: inspected.length,
    deleted_count: deleted.length,
    failed_count: failed.length,
    deleted,
    failed,
  });
});
