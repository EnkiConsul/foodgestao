// Emits a short-lived Pluggy connect token for the widget.
//
// Contract (Bloco 2 — Correção P0):
//   1. Autentica o usuário e valida a empresa.
//   2. Cria a solicitação local (status='created') ANTES de pedir o token à Pluggy.
//      → clientUserId enviado à Pluggy = "ofreq:<request_id>" (correlação única).
//   3. Cria o Connect Token via /connect_token com payload em `options`.
//   4. Em sucesso: marca a solicitação como 'token_created' e persiste
//      token_created_at / token_expires_at / correlation_expires_at.
//   5. Em falha: marca a solicitação como 'failed' com error_code seguro.
//   6. Idempotência por (company_id, idempotency_key) — duplo clique reutiliza a
//      solicitação ativa mais recente sem duplicar consumo da Pluggy.
//
// Body: { company_id: uuid, item_id?: string, idempotency_key?: string }
//   - item_id: apenas em fluxos de update/reconnect (raiz do payload Pluggy).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { createConnectToken, safePluggyError } from "../_shared/pluggy-client.ts";

// Connect Token vive por ~30 min (curto). Correlação (autorização bancária
// assíncrona) precisa continuar válida por muito mais tempo — o usuário pode
// levar horas até completar o consentimento no aplicativo do banco.
const CONNECT_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min
const CORRELATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

const BodySchema = z.object({
  company_id: z.string().uuid(),
  item_id: z.string().min(1).max(128).optional(),
  idempotency_key: z.string().min(1).max(128).optional(),
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

  // Authz: admin/owner da empresa.
  const { data: allowed, error: roleErr } = await supabase.rpc("is_company_admin_or_owner", {
    _user_id: userId,
    _company_id: parsed.company_id,
  });
  if (roleErr || !allowed) return json(403, { error: "forbidden" });

  const mode: "new" | "reconnect" = parsed.item_id ? "reconnect" : "new";

  // 1) Idempotência: se o cliente reenviar com a mesma idempotency_key e a
  //    solicitação anterior ainda estiver viva com token válido, reutiliza.
  if (parsed.idempotency_key) {
    const { data: existing } = await supabase
      .from("open_finance_connection_requests")
      .select("id, status, token_expires_at, metadata")
      .eq("company_id", parsed.company_id)
      .eq("idempotency_key", parsed.idempotency_key)
      .in("status", ["created", "token_created", "awaiting_authorization"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      existing &&
      existing.status === "token_created" &&
      existing.token_expires_at &&
      new Date(existing.token_expires_at).getTime() > Date.now()
    ) {
      const cachedToken = (existing.metadata as { access_token?: string } | null)
        ?.access_token;
      if (cachedToken) {
        return json(200, {
          access_token: cachedToken,
          request_id: existing.id,
          reused: true,
        });
      }
    }
  }

  // 2) Cria a solicitação PRIMEIRO — precisamos do request_id para o clientUserId.
  const { data: reqRow, error: insErr } = await supabase
    .from("open_finance_connection_requests")
    .insert({
      company_id: parsed.company_id,
      requested_by_user_id: userId,
      status: "created",
      mode,
      pluggy_item_id: parsed.item_id ?? null,
      idempotency_key: parsed.idempotency_key ?? null,
      correlation_expires_at: new Date(Date.now() + CORRELATION_TTL_MS).toISOString(),
    })
    .select("id")
    .single();

  if (insErr || !reqRow?.id) {
    console.error("[connect-token] failed to insert request", insErr?.message);
    return json(500, { error: "request_persist_failed" });
  }

  const requestId = reqRow.id as string;
  const clientUserId = `ofreq:${requestId}`;
  // Depois que o webhook global (pluggy-webhook-configure) estiver ativo e
  // confirmado, defina PLUGGY_USE_GLOBAL_WEBHOOK=true para parar de enviar
  // webhookUrl por Connect Token e evitar entregas duplicadas.
  const useGlobalWebhook = (Deno.env.get("PLUGGY_USE_GLOBAL_WEBHOOK") ?? "").toLowerCase() === "true";
  const webhookUrl = useGlobalWebhook ? undefined : `${url}/functions/v1/pluggy-webhook`;

  // 3) Cria o Connect Token na Pluggy com payload em `options`.
  const result = await createConnectToken({
    clientUserId,
    ...(webhookUrl ? { webhookUrl } : {}),
    avoidDuplicates: true,
    itemId: parsed.item_id,
  });

  if (!result.ok) {
    const errorCode = safePluggyError(result.error, result.httpStatus);
    // Falha não apaga o registro — permite retry controlado e auditoria.
    await supabase
      .from("open_finance_connection_requests")
      .update({
        status: "failed",
        error: errorCode,
        error_code: errorCode,
        completed_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    return json(502, { error: errorCode, request_id: requestId });
  }

  const now = new Date();
  const tokenExpires = new Date(now.getTime() + CONNECT_TOKEN_TTL_MS);

  // 4) Marca a solicitação como token_created e persiste os marcos.
  //    Guardamos o access_token em metadata para permitir a idempotência acima
  //    (nunca é retornado em logs — apenas devolvido ao mesmo requester).
  const { error: updErr } = await supabase
    .from("open_finance_connection_requests")
    .update({
      status: "token_created",
      token_created_at: now.toISOString(),
      token_expires_at: tokenExpires.toISOString(),
      metadata: { access_token: result.data.accessToken, client_user_id: clientUserId },
    })
    .eq("id", requestId);

  if (updErr) {
    console.error("[connect-token] failed to mark token_created", updErr.message);
    // Não é fatal — o token está válido; apenas a rastreabilidade fica degradada.
  }

  return json(200, {
    access_token: result.data.accessToken,
    request_id: requestId,
    client_user_id: clientUserId,
    token_expires_at: tokenExpires.toISOString(),
  });
});
