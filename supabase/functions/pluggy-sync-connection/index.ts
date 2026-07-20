import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, getItem, listAccounts, listTransactions } from "../_shared/pluggy.ts";

const BodySchema = z.object({
  connectionId: z.string().uuid(),
  fullResync: z.boolean().optional(),
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
    const { connectionId, fullResync } = parsed.data;

    // Autorização — reaproveita a RPC existente
    const { data: canSync, error: canErr } = await userClient.rpc("can_sync_bank_connection", {
      _connection_id: connectionId,
    });
    if (canErr) throw canErr;
    if (!canSync) {
      return new Response(JSON.stringify({ error: "Sem permissão para sincronizar" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conn, error: connErr } = await admin
      .from("bank_connections")
      .select("id, provider_item_id, status")
      .eq("id", connectionId)
      .single();
    if (connErr || !conn) throw connErr ?? new Error("Conexão não encontrada");

    // Marca updating
    await admin
      .from("bank_connections")
      .update({ status: "updating" })
      .eq("id", connectionId);

    let totalImported = 0;
    let lastError: string | null = null;

    try {
      const item = await getItem(conn.provider_item_id);
      const providerAccounts = await listAccounts(conn.provider_item_id);

      // Atualiza saldos + metadados das contas do provedor
      const { data: connAccounts } = await admin
        .from("bank_connection_accounts")
        .select("id, provider_account_id, account_id, auto_import, last_synced_tx_date")
        .eq("connection_id", connectionId);

      const byProviderId = new Map((connAccounts ?? []).map((a) => [a.provider_account_id, a]));

      for (const pa of providerAccounts) {
        const local = byProviderId.get(pa.id);
        if (!local) {
          // conta nova apareceu no provider — cria
          await admin.from("bank_connection_accounts").insert({
            connection_id: connectionId,
            provider_account_id: pa.id,
            provider_name: pa.name,
            provider_number: pa.number ?? null,
            provider_type: pa.type ?? null,
            provider_subtype: pa.subtype ?? null,
            provider_balance: pa.balance ?? null,
            currency_code: pa.currencyCode ?? "BRL",
            auto_import: true,
          });
          continue;
        }
        await admin
          .from("bank_connection_accounts")
          .update({ provider_balance: pa.balance ?? null })
          .eq("id", local.id);

        if (!local.account_id || !local.auto_import) continue;

        // Determina janela de sincronização
        const fromDate = fullResync
          ? undefined
          : (local.last_synced_tx_date ??
            new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10));

        let page = 1;
        let latestDate: string | null = null;
         
        while (true) {
          const resp = await listTransactions({
            accountId: pa.id,
            from: fromDate,
            page,
            pageSize: 500,
          });
          for (const tx of resp.results) {
            const txDate = tx.date.slice(0, 10);
            const amount = Math.abs(tx.amount);
            const txType = tx.amount >= 0 ? "receita" : "despesa";
            const { error: upErr } = await admin.rpc("pluggy_upsert_transaction", {
              _account_id: local.account_id,
              _provider_tx_id: tx.id,
              _description: tx.description ?? tx.descriptionRaw ?? "Importado via Open Finance",
              _amount: amount,
              _transaction_date: txDate,
              _transaction_type: txType,
            });
            if (upErr) {
              console.error("upsert tx", tx.id, upErr);
              continue;
            }
            totalImported += 1;
            if (!latestDate || txDate > latestDate) latestDate = txDate;
          }
          if (page >= resp.totalPages) break;
          page += 1;
        }

        await admin
          .from("bank_connection_accounts")
          .update({
            last_synced_at: new Date().toISOString(),
            last_synced_tx_date: latestDate ?? local.last_synced_tx_date ?? null,
          })
          .eq("id", local.id);
      }

      await admin
        .from("bank_connections")
        .update({
          status: (item.status ?? "active").toLowerCase(),
          consent_expires_at: item.consentExpiresAt ?? null,
          last_sync_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", connectionId);
    } catch (e) {
      lastError = (e as Error).message;
      await admin
        .from("bank_connections")
        .update({ status: "login_error", last_error: lastError })
        .eq("id", connectionId);
    }

    return new Response(
      JSON.stringify({ imported: totalImported, error: lastError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[pluggy-sync-connection]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
