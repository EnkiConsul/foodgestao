// Bloco 5 (P0-5) — Desconexão remota do item na Pluggy (DELETE /items/{id}).
//
// Fluxo:
//   1. Autoriza (service-role OU admin/owner via JWT).
//   2. Lê a conexão; ignora se já marcada com remote_deleted_at.
//   3. Chama DELETE /items/{id} na Pluggy (com retry via cliente compartilhado).
//   4. Em sucesso: marca remote_deleted_at, needs_remote_delete=false.
//   5. Em falha transitória: deixa needs_remote_delete=true para retry pelo cron.
//
// Body: { connection_id: uuid } ou { pluggy_item_id: string }
// verify_jwt = false (chamado por cron e por UI admin com token do usuário).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { deleteItem, safePluggyError } from "../_shared/pluggy-client.ts";

const BodySchema = z.union([
  z.object({ connection_id: z.string().uuid() }),
  z.object({ pluggy_item_id: z.string().min(1).max(128) }),
]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthenticated" });
  const token = authHeader.substring("Bearer ".length);

  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch { return json(400, { error: "invalid_body" }); }

  const supabase = createClient(url, service);

  // Localiza a conexão.
  const query = "connection_id" in body
    ? supabase.from("open_finance_connections").select("id, company_id, pluggy_item_id, remote_deleted_at").eq("id", body.connection_id)
    : supabase.from("open_finance_connections").select("id, company_id, pluggy_item_id, remote_deleted_at").eq("pluggy_item_id", body.pluggy_item_id);

  const { data: conn } = await query.maybeSingle();
  if (!conn) return json(404, { error: "connection_not_found" });

  // Se não é service-role, exige admin/owner da company.
  const isServiceRole = token === service;
  if (!isServiceRole) {
    const supabaseUser = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabaseUser.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthenticated" });
    const { data: allowed } = await supabase.rpc("is_company_admin_or_owner", {
      _user_id: userData.user.id,
      _company_id: conn.company_id,
    });
    if (!allowed) return json(403, { error: "forbidden" });
  }

  if (conn.remote_deleted_at) {
    return json(200, { ok: true, already_deleted: true });
  }

  const result = await deleteItem(conn.pluggy_item_id);
  const notFound = !result.ok && result.httpStatus === 404;
  if (!result.ok && !notFound) {
    // Falha transitória → agenda retry pelo worker durável.
    const errMsg = safePluggyError(result.error, result.httpStatus);
    await supabase.rpc("pluggy_remote_delete_finalize_failure", {
      _id: conn.id,
      _error: errMsg,
      _max_attempts: 10,
    });
    return json(202, {
      ok: false,
      queued_for_retry: true,
      connection_id: conn.id,
      error: errMsg,
    });
  }

  await supabase.rpc("pluggy_remote_delete_finalize_success", { _id: conn.id });
  return json(200, { ok: true, connection_id: conn.id, already_deleted: notFound });
});
