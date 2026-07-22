import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import {
  corsHeaders,
  getItem,
  listAccounts,
  listTransactions,
  triggerItemUpdate,
  updateItemWebhook,
  pluggyWebhookUrl,
  PluggyApiError,
} from "../_shared/pluggy.ts";

type StatusResolution = {
  dbStatus: string;
  message: string | null;
  needsReconnect: boolean;
};

/**
 * Traduz item.status + item.executionStatus da Pluggy em um status canônico
 * armazenado em bank_connections.status e uma mensagem legível.
 */
function resolvePluggyStatus(
  itemStatus: string | null | undefined,
  execStatus: string | null | undefined,
): StatusResolution {
  const s = (itemStatus ?? "").toUpperCase();
  const e = (execStatus ?? "").toUpperCase();

  // Erros terminais que exigem reconexão
  const reconnectExec = new Set([
    "USER_AUTHORIZATION_PENDING",
    "USER_AUTHORIZATION_NOT_GRANTED",
    "USER_INPUT_TIMEOUT",
    "USER_CREDENTIALS_INVALID",
    "INVALID_CREDENTIALS",
    "INVALID_CREDENTIALS_MFA",
    "ACCOUNT_LOCKED",
    "ACCOUNT_NEEDS_ACTION",
    "ALREADY_LOGGED_IN",
  ]);
  const execMessages: Record<string, string> = {
    USER_AUTHORIZATION_PENDING: "Ação necessária: reconecte para autorizar a coleta (MFA/token).",
    USER_AUTHORIZATION_NOT_GRANTED: "O consentimento não foi concedido. Reconecte para autorizar.",
    USER_INPUT_TIMEOUT: "Tempo esgotado aguardando entrada do usuário. Reconecte.",
    USER_CREDENTIALS_INVALID: "Credenciais inválidas. Reconecte a instituição.",
    INVALID_CREDENTIALS: "Credenciais inválidas. Reconecte a instituição.",
    INVALID_CREDENTIALS_MFA: "MFA inválido. Reconecte a instituição.",
    ACCOUNT_LOCKED: "Conta bloqueada pela instituição. Acesse o app do banco e reconecte.",
    ACCOUNT_NEEDS_ACTION: "A instituição requer uma ação sua. Acesse o banco e reconecte.",
    ALREADY_LOGGED_IN: "Sessão duplicada na instituição. Reconecte após sair do app do banco.",
    SITE_NOT_AVAILABLE: "Instituição indisponível no momento. Tente novamente mais tarde.",
    CONNECTION_ERROR: "Falha de conexão com a instituição. Tente novamente em instantes.",
    USER_NOT_SUPPORTED: "Este tipo de conta não expõe extrato via Open Finance.",
  };

  if (s === "WAITING_USER_INPUT" || s === "WAITING_USER_ACTION") {
    return {
      dbStatus: "waiting_user_input",
      message: execMessages[e] ?? "Ação necessária: reconecte para completar a autenticação.",
      needsReconnect: true,
    };
  }
  if (s === "LOGIN_ERROR" || reconnectExec.has(e)) {
    return {
      dbStatus: "login_error",
      message: execMessages[e] ?? "Credenciais expiradas. Reconecte a instituição.",
      needsReconnect: true,
    };
  }
  if (s === "OUTDATED") {
    return {
      dbStatus: "outdated",
      message: execMessages[e] ?? "Consentimento desatualizado. Reconecte para renovar.",
      needsReconnect: true,
    };
  }
  if (s === "UPDATING" || s === "CREATING") {
    return { dbStatus: "updating", message: null, needsReconnect: false };
  }
  if (s === "UPDATED" || s === "" || s === "ACTIVE" || s === "PARTIAL_SUCCESS") {
    return { dbStatus: "updated", message: null, needsReconnect: false };
  }
  return {
    dbStatus: s.toLowerCase() || "updated",
    message: execMessages[e] ?? null,
    needsReconnect: false,
  };
}

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
    let needsReconnect = false;
    let itemUpdateTriggered = false;
    const perAccount: Array<{
      providerAccountId: string;
      imported: number;
      error?: string;
      pagesFetched?: number;
      resultsSeen?: number;
    }> = [];

    try {
      const item = await getItem(conn.provider_item_id);
      const providerAccounts = await listAccounts(conn.provider_item_id);

      const { data: connAccounts } = await admin
        .from("bank_connection_accounts")
        .select("id, provider_account_id, account_id, auto_import, last_synced_tx_date")
        .eq("connection_id", connectionId);

      const byProviderId = new Map((connAccounts ?? []).map((a) => [a.provider_account_id, a]));

      for (const pa of providerAccounts) {
        const local = byProviderId.get(pa.id);
        if (!local) {
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

        const fromDate = fullResync
          ? undefined
          : (local.last_synced_tx_date ??
            new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10));

        let page = 1;
        let latestDate: string | null = null;
        let importedAcct = 0;
        let resultsSeen = 0;
        let acctError: string | undefined;

        try {
          while (true) {
            const resp = await listTransactions({
              accountId: pa.id,
              from: fromDate,
              page,
              pageSize: 500,
            });
            resultsSeen += resp.results.length;
            console.log(JSON.stringify({
              scope: "pluggy-sync",
              connectionId,
              providerAccountId: pa.id,
              page,
              received: resp.results.length,
              totalPages: resp.totalPages,
            }));
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
                console.error(JSON.stringify({
                  scope: "pluggy-sync",
                  step: "upsert_tx",
                  connectionId,
                  providerAccountId: pa.id,
                  providerTxId: tx.id,
                  error: upErr.message,
                }));
                continue;
              }
              totalImported += 1;
              importedAcct += 1;
              if (!latestDate || txDate > latestDate) latestDate = txDate;
            }
            if (page >= resp.totalPages) break;
            page += 1;
          }
        } catch (e) {
          if (e instanceof PluggyApiError && e.status === 410) {
            // Produto TRANSACTIONS não coletado — dispara update do item na Pluggy.
            acctError = "Pluggy ainda não coletou transações para esta conta. Iniciamos uma atualização; tente sincronizar novamente em alguns minutos.";
            if (!itemUpdateTriggered) {
              try {
                await triggerItemUpdate(conn.provider_item_id);
                itemUpdateTriggered = true;
                console.log(JSON.stringify({
                  scope: "pluggy-sync",
                  step: "trigger_item_update",
                  connectionId,
                  itemId: conn.provider_item_id,
                }));
              } catch (upe) {
                const msg = (upe as Error).message;
                console.error(JSON.stringify({
                  scope: "pluggy-sync",
                  step: "trigger_item_update_failed",
                  connectionId,
                  error: msg,
                }));
                if (upe instanceof PluggyApiError && (upe.status === 401 || upe.status === 403)) {
                  needsReconnect = true;
                  acctError = "É necessário reconectar esta instituição para autorizar a coleta de lançamentos.";
                } else if (upe instanceof PluggyApiError && upe.status === 409) {
                  // Rate limit da Pluggy: no máximo 1 update por hora.
                  let waitMin = 60;
                  try {
                    const parsed = JSON.parse(upe.body ?? "{}");
                    const lastUpdatedAt: string | undefined =
                      parsed?.data?.lastUpdatedAt ?? parsed?.lastUpdatedAt;
                    const freqHours: number = parsed?.data?.minUpdateFrequencyAllowedInHours ?? 1;
                    if (lastUpdatedAt) {
                      const nextAllowed = new Date(lastUpdatedAt).getTime() + freqHours * 3600 * 1000;
                      const diffMs = nextAllowed - Date.now();
                      waitMin = Math.max(1, Math.ceil(diffMs / 60000));
                    }
                  } catch { /* noop */ }
                  acctError = `A Pluggy só permite atualizar esta conexão a cada 1 hora. Aguarde ~${waitMin} minuto(s) e sincronize novamente.`;
                }
              }
            }
          } else {
            acctError = (e as Error).message;
            console.error(JSON.stringify({
              scope: "pluggy-sync",
              step: "list_tx_failed",
              connectionId,
              providerAccountId: pa.id,
              error: acctError,
            }));
          }
        }

        perAccount.push({
          providerAccountId: pa.id,
          imported: importedAcct,
          error: acctError,
          pagesFetched: page,
          resultsSeen,
        });

        await admin
          .from("bank_connection_accounts")
          .update({
            last_synced_at: new Date().toISOString(),
            last_synced_tx_date: latestDate ?? local.last_synced_tx_date ?? null,
          })
          .eq("id", local.id);
      }

      // Se pelo menos uma conta pediu update, deixa status como 'updating'
      // para o usuário saber que a Pluggy está trabalhando.
      const finalStatus = itemUpdateTriggered
        ? "updating"
        : (item.status ?? "active").toLowerCase();

      await admin
        .from("bank_connections")
        .update({
          status: finalStatus,
          consent_expires_at: item.consentExpiresAt ?? null,
          last_sync_at: new Date().toISOString(),
          last_error: itemUpdateTriggered
            ? "Coletando lançamentos na Pluggy — tente sincronizar novamente em alguns minutos."
            : null,
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
      JSON.stringify({
        imported: totalImported,
        error: lastError,
        needsReconnect,
        itemUpdateTriggered,
        perAccount,
      }),
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
