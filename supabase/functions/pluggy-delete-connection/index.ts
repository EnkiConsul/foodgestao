import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, deleteItem } from "../_shared/pluggy.ts";

const BodySchema = z.object({
  connectionId: z.string().uuid(),
  force: z.boolean().optional().default(false),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { connectionId, force } = parsed.data;

    const { data: canManage, error: canErr } = await userClient.rpc(
      "can_manage_bank_connection",
      { _connection_id: connectionId },
    );
    if (canErr) throw canErr;
    if (!canManage) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se force=true, exigir super_admin
    let isSuperAdmin = false;
    if (force) {
      const userId = (claimsData.claims as { sub?: string }).sub;
      const { data: roleRow } = await userClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();
      isSuperAdmin = !!roleRow;
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Somente super admin pode forçar remoção" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conn } = await admin
      .from("bank_connections")
      .select("id, provider_item_id")
      .eq("id", connectionId)
      .maybeSingle();

    // Revogar consentimento no Pluggy ANTES de apagar localmente
    if (conn?.provider_item_id) {
      try {
        await deleteItem(conn.provider_item_id);
      } catch (e) {
        const msg = (e as Error).message;
        console.error("[pluggy-delete-connection] deleteItem falhou", {
          connectionId,
          providerItemId: conn.provider_item_id,
          error: msg,
        });
        if (!force) {
          return new Response(
            JSON.stringify({
              error: `Falha ao revogar consentimento no Pluggy: ${msg}`,
              pluggyError: true,
            }),
            {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    // Remove vínculo com contas internas antes de apagar a conexão
    await admin
      .from("bank_connection_accounts")
      .update({ account_id: null, auto_import: false })
      .eq("connection_id", connectionId);
    await admin.from("bank_connection_accounts").delete().eq("connection_id", connectionId);
    await admin.from("bank_connections").delete().eq("id", connectionId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pluggy-delete-connection]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
