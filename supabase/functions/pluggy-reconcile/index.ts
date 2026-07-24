// pluggy-reconcile
// Recupera itens Pluggy que foram criados via widget mas nunca chegaram a ser
// registrados localmente (ex.: usuário fechou o widget antes do onSuccess ou
// o webhook de ITEM_CREATED foi rejeitado por assinatura inválida).
//
// Fluxo:
//   - Autenticado. Chamador precisa ser admin/owner da company.
//   - Lista itens no Pluggy filtrando por clientUserId=`company:<id>`.
//   - Para cada item ainda não presente em open_finance_connections, faz o
//     mesmo upsert que pluggy-item-register e sincroniza contas básicas.
//   - Marca requests token_created recentes como completed quando reconciliados.
//
// Body: { company_id: uuid }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { getItem, listAccounts, listItemsByClientUser, PluggyError } from "../_shared/pluggy.ts";

const BodySchema = z.object({
  company_id: z.string().uuid(),
  // Opcional: itemId específico do Pluggy (usar quando a listagem por
  // clientUserId não estiver disponível no plano/ambiente Pluggy).
  item_id: z.string().min(8).max(128).optional(),
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "validation_failed" }, 400);
    const { company_id } = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: isAdmin, error: roleErr } = await admin.rpc("is_company_admin_or_owner", {
      _user_id: userId,
      _company_id: company_id,
    });
    if (roleErr) return json({ error: "authorization_check_failed", details: roleErr.message }, 500);
    if (!isAdmin) return json({ error: "forbidden_company_role" }, 403);

    // Lista itens no Pluggy vinculados a essa company.
    let pluggyItems;
    try {
      pluggyItems = await listItemsByClientUser(`company:${company_id}`);
    } catch (err) {
      if (err instanceof PluggyError) {
        return json({ error: "pluggy_error", code: err.code, details: err.message }, 502);
      }
      return json({ error: "pluggy_error" }, 502);
    }

    if (!pluggyItems.length) {
      return json({ ok: true, recovered: 0, item_ids: [], message: "no_items_found" });
    }

    // Já registrados localmente
    const providerItemIds = pluggyItems.map((i) => i.id);
    const { data: existing } = await admin
      .from("open_finance_connections")
      .select("provider_item_id")
      .eq("provider", "pluggy")
      .eq("company_id", company_id)
      .in("provider_item_id", providerItemIds);
    const alreadyRegistered = new Set((existing ?? []).map((r) => r.provider_item_id));

    // Request pendente mais recente (dentro da validade) para associar
    const { data: pendingReq } = await admin
      .from("open_finance_connection_requests")
      .select("id, expires_at")
      .eq("company_id", company_id)
      .eq("requested_by", userId)
      .eq("status", "token_created")
      .is("used_at", null)
      .gte("expires_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const anchorRequestId = pendingReq?.[0]?.id ?? null;

    const recovered: string[] = [];
    const errors: Array<{ item_id: string; error: string }> = [];

    for (const summary of pluggyItems) {
      if (alreadyRegistered.has(summary.id)) continue;

      try {
        // Fetch fresco para garantir metadados atualizados
        const item = await getItem(summary.id);
        const now = new Date().toISOString();
        const connectorId = item.connector?.id != null ? String(item.connector.id) : null;

        const { data: connection, error: upsertErr } = await admin
          .from("open_finance_connections")
          .upsert(
            {
              company_id,
              provider: "pluggy",
              provider_item_id: item.id,
              connection_request_id: anchorRequestId,
              connected_by_user_id: userId,
              connector_id: connectorId,
              institution_name: item.connector?.name ?? null,
              institution_logo_url: item.connector?.imageUrl ?? null,
              institution_primary_color: item.connector?.primaryColor ?? null,
              item_status: item.status ?? null,
              execution_status: item.executionStatus ?? null,
              provider_error_code: item.error?.code ?? null,
              provider_error_message: item.error?.message ?? null,
              last_sync_at: item.lastUpdatedAt ?? now,
              last_successful_sync_at:
                String(item.status ?? "").toUpperCase() === "UPDATED"
                  ? item.lastUpdatedAt ?? now
                  : null,
              next_auto_sync_at: item.nextAutoSyncAt ?? null,
              is_active: true,
              disconnected_at: null,
              needs_reconnect: false,
              updated_at: now,
            },
            { onConflict: "provider,provider_item_id" },
          )
          .select("id")
          .single();

        if (upsertErr || !connection) {
          errors.push({ item_id: item.id, error: upsertErr?.message ?? "upsert_failed" });
          continue;
        }

        // Sincroniza contas
        try {
          const accounts = await listAccounts(item.id);
          for (const acc of accounts) {
            const isCredit = String(acc.type ?? "").toUpperCase() === "CREDIT";
            await admin.from("open_finance_accounts").upsert(
              {
                company_id,
                connection_id: connection.id,
                provider: "pluggy",
                provider_account_id: acc.id,
                provider_type: acc.type,
                provider_subtype: acc.subtype ?? null,
                provider_name: acc.name,
                provider_marketing_name: acc.marketingName ?? null,
                provider_number_masked: acc.number ?? null,
                currency_code: acc.currencyCode ?? null,
                provider_balance: acc.balance ?? null,
                available_balance: acc.bankData?.closingBalance ?? null,
                credit_limit: isCredit ? acc.creditData?.creditLimit ?? null : null,
                available_credit_limit: isCredit
                  ? acc.creditData?.availableCreditLimit ?? null
                  : null,
                balance_close_date: isCredit ? acc.creditData?.balanceCloseDate ?? null : null,
                balance_due_date: isCredit ? acc.creditData?.balanceDueDate ?? null : null,
                card_brand: isCredit ? acc.creditData?.brand ?? null : null,
                last_synced_at: now,
                updated_at: now,
              },
              { onConflict: "connection_id,provider_account_id" },
            );
          }
        } catch (err) {
          console.warn("[pluggy-reconcile] accounts_sync_failed", err);
        }

        recovered.push(item.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        errors.push({ item_id: summary.id, error: msg });
      }
    }

    // Se recuperou algo, finaliza o request pendente
    if (recovered.length > 0 && anchorRequestId) {
      const now = new Date().toISOString();
      await admin
        .from("open_finance_connection_requests")
        .update({ status: "completed", used_at: now, completed_at: now })
        .eq("id", anchorRequestId);
    }

    return json({
      ok: true,
      recovered: recovered.length,
      item_ids: recovered,
      total_pluggy_items: pluggyItems.length,
      errors,
    });
  } catch (e) {
    console.error("[pluggy-reconcile] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
