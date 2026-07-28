// V2 — Mint de Connect Token isolado
// Grava metadados em pluggy_v2_connect_requests SEM persistir o access_token
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createConnectToken } from "../_shared/pluggy-client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // Flag de habilitação
    if ((Deno.env.get("PLUGGY_V2_ENABLED") ?? "false").toLowerCase() !== "true") {
      return json({ error: "pluggy_v2_disabled" }, 503);
    }

    // Auth via getClaims (validação local do JWT)
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthenticated" }, 401);
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: claimsData, error: claimsErr } = await supabaseUser.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "unauthenticated" }, 401);
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const companyId: string | undefined = body?.companyId;
    const intent: "create" | "reconnect" | "update" = body?.intent ?? "create";
    const targetItemId: string | undefined = body?.targetItemId;
    const connectorId: number | undefined = body?.connectorId;

    if (!companyId) return json({ error: "missing_company_id" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verifica membership
    const { data: member } = await supabase
      .from("company_members")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return json({ error: "forbidden" }, 403);

    // Client user id estável (permite reconexão)
    const clientUserId = `pv2:${companyId}:${userId}`;

    // Cria connect token
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pluggy-v2-webhook`;
    const oauthRedirectUrl = body?.oauthRedirectUrl ?? null;
    const tokenResp = await createConnectToken({
      clientUserId,
      webhookUrl,
      itemId: intent === "reconnect" ? targetItemId : undefined,
      oauthRedirectUrl,
      avoidDuplicates: intent === "create",
    });

    // Grava metadados (sem token). token_expires_at é ~30min pela Pluggy.
    const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: reqRow } = await supabase
      .from("pluggy_v2_connect_requests")
      .insert({
        company_id: companyId,
        user_id: userId,
        client_user_id: clientUserId,
        connector_id: connectorId ?? null,
        intent,
        target_item_id: targetItemId ?? null,
        status: "token_created",
        token_expires_at: tokenExpiresAt,
        metadata: { oauth_redirect_url: oauthRedirectUrl },
      })
      .select("id")
      .single();

    return json({
      requestId: reqRow?.id,
      accessToken: tokenResp.accessToken,
      clientUserId,
    });
  } catch (e) {
    console.error("[pluggy-v2-connect-token] error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
