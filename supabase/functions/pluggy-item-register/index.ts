// pluggy-item-register
// Registra localmente um item Pluggy recém-criado (ou reconectado) via
// Pluggy Connect Widget. É a ponte entre o `onSuccess` do widget no frontend
// e a tabela `open_finance_connections` — sem esta chamada, o worker não
// consegue correlacionar webhooks com a empresa.
//
// Body:
//   { request_id: uuid, item_id: string }
//
// Regras:
//   - Autenticado. Chamador precisa ser admin/owner da company do request.
//   - Idempotente: se já existe `open_finance_connections` para (provider,
//     item_id), apenas atualiza metadados e associa ao request.
//   - Sincroniza contas (open_finance_accounts) básicas para exibir no UI —
//     a sincronização de transações fica a cargo do `pluggy-sync` (Bloco 5+).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { getItem, listAccounts, PluggyError } from "../_shared/pluggy.ts";

const BodySchema = z.object({
  request_id: z.string().uuid(),
  item_id: z.string().min(8).max(128),
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
    const { request_id, item_id } = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Recupera o request e valida propriedade + validade.
    const { data: reqRow, error: reqErr } = await admin
      .from("open_finance_connection_requests")
      .select("id, company_id, requested_by, mode, existing_connection_id, status, expires_at")
      .eq("id", request_id)
      .maybeSingle();
    if (reqErr) return json({ error: "request_lookup_failed" }, 500);
    if (!reqRow) return json({ error: "request_not_found" }, 404);
    if (reqRow.requested_by !== userId) return json({ error: "forbidden_request_owner" }, 403);
    if (new Date(reqRow.expires_at as string).getTime() < Date.now()) {
      await admin
        .from("open_finance_connection_requests")
        .update({ status: "expired" })
        .eq("id", reqRow.id);
      return json({ error: "request_expired" }, 410);
    }

    const { data: isAdmin } = await admin.rpc("is_company_admin_or_owner", {
      _user_id: userId,
      _company_id: reqRow.company_id,
    });
    if (!isAdmin) return json({ error: "forbidden_company_role" }, 403);

    // Busca o item na Pluggy.
    let item;
    try {
      item = await getItem(item_id);
    } catch (err) {
      if (err instanceof PluggyError) {
        return json({ error: "pluggy_error", code: err.code }, err.status >= 500 ? 502 : 400);
      }
      return json({ error: "pluggy_error" }, 502);
    }

    const now = new Date().toISOString();
    const connectorId = item.connector?.id != null ? String(item.connector.id) : null;

    // Upsert da conexão (idempotente por provider+provider_item_id).
    const connectionPatch = {
      company_id: reqRow.company_id as string,
      provider: "pluggy",
      provider_item_id: item.id,
      connection_request_id: reqRow.id as string,
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
      last_successful_sync_at: String(item.status ?? "").toUpperCase() === "UPDATED"
        ? item.lastUpdatedAt ?? now : null,
      next_auto_sync_at: item.nextAutoSyncAt ?? null,
      is_active: true,
      disconnected_at: null,
      needs_reconnect: false,
      updated_at: now,
    } as const;

    const { data: connection, error: upsertErr } = await admin
      .from("open_finance_connections")
      .upsert(connectionPatch, { onConflict: "provider,provider_item_id" })
      .select("id, company_id")
      .single();
    if (upsertErr || !connection) {
      console.error("[pluggy-item-register] upsert_failed", { code: upsertErr?.code });
      return json({ error: "connection_upsert_failed" }, 500);
    }

    // Marca o request como completed.
    await admin
      .from("open_finance_connection_requests")
      .update({
        status: "completed",
        used_at: now,
        completed_at: now,
      })
      .eq("id", reqRow.id);

    // Sincroniza contas (metadados apenas — ligação com contas locais é
    // manual, no frontend, e transações vêm em Bloco 5+).
    let accountsSynced = 0;
    try {
      const accounts = await listAccounts(item.id);
      for (const acc of accounts) {
        const isCredit = String(acc.type ?? "").toUpperCase() === "CREDIT";
        await admin.from("open_finance_accounts").upsert(
          {
            company_id: reqRow.company_id,
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
            available_credit_limit: isCredit ? acc.creditData?.availableCreditLimit ?? null : null,
            balance_close_date: isCredit ? acc.creditData?.balanceCloseDate ?? null : null,
            balance_due_date: isCredit ? acc.creditData?.balanceDueDate ?? null : null,
            card_brand: isCredit ? acc.creditData?.brand ?? null : null,
            last_synced_at: now,
            updated_at: now,
          },
          { onConflict: "connection_id,provider_account_id" },
        );
        accountsSynced++;
      }
    } catch (err) {
      console.warn("[pluggy-item-register] accounts_sync_failed", err);
    }

    return json({
      ok: true,
      connection_id: connection.id,
      accounts_synced: accountsSynced,
      item_status: item.status,
    });
  } catch (e) {
    console.error("[pluggy-item-register] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
