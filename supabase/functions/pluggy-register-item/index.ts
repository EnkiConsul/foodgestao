import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, getItem, listAccounts, updateItemWebhook, pluggyWebhookUrl } from "../_shared/pluggy.ts";

const BodySchema = z.object({
  itemId: z.string().min(1),
  context: z.enum(["pf", "pj"]),
  companyId: z.string().uuid().nullable().optional(),
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
    const userId = claimsData.claims.sub as string;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { itemId, context, companyId } = parsed.data;

    if (context === "pj" && !companyId) {
      return new Response(JSON.stringify({ error: "companyId requerido no contexto PJ" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica se o usuário é membro da empresa (PJ)
    if (context === "pj" && companyId) {
      const { data: member } = await userClient
        .from("company_members")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!member) {
        return new Response(JSON.stringify({ error: "Usuário não é membro desta empresa" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const item = await getItem(itemId);

    // Vincula webhookUrl ao item (idempotente) — necessário para receber
    // notificações item/updated quando a Pluggy termina de coletar dados.
    const hook = pluggyWebhookUrl();
    if (hook && item.webhookUrl !== hook) {
      try {
        await updateItemWebhook(itemId, hook);
      } catch (whErr) {
        console.warn("[pluggy-register-item] falha ao registrar webhook:", (whErr as Error).message);
      }
    }

    const accounts = await listAccounts(itemId);

    // Upsert bank_connections (chave lógica: user + provider + provider_item_id)
    const { data: existing } = await admin
      .from("bank_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "pluggy")
      .eq("provider_item_id", itemId)
      .maybeSingle();

    let connectionId: string;
    const connPayload = {
      user_id: userId,
      context,
      company_id: context === "pj" ? companyId : null,
      provider: "pluggy",
      provider_item_id: itemId,
      institution_name: item.connector?.name ?? null,
      institution_logo_url: item.connector?.imageUrl ?? null,
      status: (item.status ?? "active").toLowerCase(),
      consent_expires_at: item.consentExpiresAt ?? null,
      last_sync_at: new Date().toISOString(),
      last_error: null as string | null,
    };
    if (existing) {
      const { error } = await admin
        .from("bank_connections")
        .update(connPayload)
        .eq("id", existing.id);
      if (error) throw error;
      connectionId = existing.id;
    } else {
      const { data, error } = await admin
        .from("bank_connections")
        .insert(connPayload)
        .select("id")
        .single();
      if (error) throw error;
      connectionId = data.id;
    }

    // Upsert accounts do provedor
    for (const acc of accounts) {
      const { data: existingAcc } = await admin
        .from("bank_connection_accounts")
        .select("id")
        .eq("connection_id", connectionId)
        .eq("provider_account_id", acc.id)
        .maybeSingle();
      const accPayload = {
        connection_id: connectionId,
        provider_account_id: acc.id,
        provider_name: acc.name,
        provider_number: acc.number ?? null,
        provider_type: acc.type ?? null,
        provider_subtype: acc.subtype ?? null,
        provider_balance: acc.balance ?? null,
        currency_code: acc.currencyCode ?? "BRL",
        auto_import: true,
      };
      if (existingAcc) {
        await admin.from("bank_connection_accounts").update(accPayload).eq("id", existingAcc.id);
      } else {
        await admin.from("bank_connection_accounts").insert(accPayload);
      }
    }

    return new Response(JSON.stringify({ connectionId, accounts: accounts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pluggy-register-item]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
