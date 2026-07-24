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

    // Sincroniza contas + auto-cria contas bancárias / cartões locais e faz
    // o vínculo em open_finance_accounts.local_account_id / local_credit_card_id.
    // Isso permite que pluggy-sync ingira transações sem passo manual de mapeamento.
    let accountsSynced = 0;
    let accountsLinkedAuto = 0;
    try {
      const accounts = await listAccounts(item.id);
      for (const acc of accounts) {
        const isCredit = String(acc.type ?? "").toUpperCase() === "CREDIT";
        const isBank = String(acc.type ?? "").toUpperCase() === "BANK";

        // 1) Upsert em open_finance_accounts (idempotente).
        const { data: ofAcc, error: ofAccErr } = await admin
          .from("open_finance_accounts")
          .upsert(
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
          )
          .select("id, local_account_id, local_credit_card_id")
          .single();

        if (ofAccErr || !ofAcc) {
          console.warn("[pluggy-item-register] of_account_upsert_failed", { code: ofAccErr?.code });
          continue;
        }
        accountsSynced++;

        // 2) Auto-criação da conta/cartão local — apenas se ainda não vinculado.
        try {
          if (isBank && !ofAcc.local_account_id) {
            const localAccountId = await createLocalBankAccount(admin, {
              userId,
              companyId: reqRow.company_id as string,
              institutionName: item.connector?.name ?? "Banco",
              institutionColor: item.connector?.primaryColor ?? null,
              acc,
              now,
            });
            if (localAccountId) {
              await admin
                .from("open_finance_accounts")
                .update({
                  local_account_id: localAccountId,
                  auto_import: true,
                  ownership_status: "linked_auto",
                  updated_at: now,
                })
                .eq("id", ofAcc.id);
              accountsLinkedAuto++;
            }
          } else if (isCredit && !ofAcc.local_credit_card_id) {
            const localCardId = await createLocalCreditCard(admin, {
              userId,
              companyId: reqRow.company_id as string,
              institutionName: item.connector?.name ?? "Banco",
              acc,
              now,
            });
            if (localCardId) {
              await admin
                .from("open_finance_accounts")
                .update({
                  local_credit_card_id: localCardId,
                  auto_import: true,
                  ownership_status: "linked_auto",
                  updated_at: now,
                })
                .eq("id", ofAcc.id);
              accountsLinkedAuto++;
            }
          }
        } catch (linkErr) {
          console.warn("[pluggy-item-register] auto_link_failed", {
            provider_account_id: acc.id,
            err: linkErr instanceof Error ? linkErr.message : String(linkErr),
          });
        }
      }
    } catch (err) {
      console.warn("[pluggy-item-register] accounts_sync_failed", err);
    }

    return json({
      ok: true,
      connection_id: connection.id,
      accounts_synced: accountsSynced,
      accounts_linked_auto: accountsLinkedAuto,
      item_status: item.status,
    });
  } catch (e) {
    console.error("[pluggy-item-register] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

// ---------- helpers ---------------------------------------------------------

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseTransferNumber(raw: string | null | undefined): {
  agency: string | null;
  account: string | null;
} {
  if (!raw) return { agency: null, account: null };
  // Formatos comuns Pluggy: "0001/12345-6" ou "0001-12345-6" ou "12345-6".
  const parts = String(raw).split(/[\/\-\s]/).filter(Boolean);
  if (parts.length >= 3) {
    return {
      agency: parts[0],
      account: parts.slice(1).join("-"),
    };
  }
  if (parts.length === 2) {
    return { agency: null, account: parts.join("-") };
  }
  return { agency: null, account: raw };
}

function mapAccountType(subtype: string | null | undefined): "corrente" | "poupanca" {
  const s = String(subtype ?? "").toUpperCase();
  if (s === "SAVINGS_ACCOUNT") return "poupanca";
  return "corrente";
}

function extractLast4(masked: string | null | undefined): string | null {
  if (!masked) return null;
  const digits = String(masked).replace(/\D+/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function dayFromDate(iso: string | null | undefined, fallback: number): number {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return fallback;
  const dd = d.getUTCDate();
  return dd >= 1 && dd <= 31 ? dd : fallback;
}

async function createLocalBankAccount(
  admin: ReturnType<typeof createClient>,
  args: {
    userId: string;
    companyId: string;
    institutionName: string;
    institutionColor: string | null;
    acc: {
      name?: string;
      subtype?: string;
      balance?: number | null;
      number?: string | null;
      bankData?: { transferNumber?: string };
    };
    now: string;
  },
): Promise<string | null> {
  const { userId, companyId, institutionName, institutionColor, acc, now } = args;
  const rawName = `${institutionName} — ${acc.name ?? "Conta"}`;
  const last4 = extractLast4(acc.number);
  const nameWithSuffix = last4 ? `${rawName} (…${last4})` : rawName;
  const name = nameWithSuffix.length > 60 ? nameWithSuffix.slice(0, 60) : nameWithSuffix;
  const { agency, account } = parseTransferNumber(acc.bankData?.transferNumber ?? null);
  const balance = typeof acc.balance === "number" ? acc.balance : 0;

  const { data, error } = await admin
    .from("accounts")
    .insert({
      user_id: userId,
      company_id: companyId,
      context: "pj",
      name,
      account_type: mapAccountType(acc.subtype),
      initial_balance: balance,
      current_balance: balance,
      bank_slug: slugify(institutionName),
      color: institutionColor ?? "#1B3A5C",
      icon: "landmark",
      agency,
      account_number: account,
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[pluggy-item-register] local_bank_insert_failed", { code: error.code });
    return null;
  }
  return (data as { id: string }).id;
}

async function createLocalCreditCard(
  admin: ReturnType<typeof createClient>,
  args: {
    userId: string;
    companyId: string;
    institutionName: string;
    acc: {
      name?: string;
      number?: string | null;
      creditData?: {
        creditLimit?: number | null;
        balanceCloseDate?: string | null;
        balanceDueDate?: string | null;
        brand?: string | null;
      };
    };
    now: string;
  },
): Promise<string | null> {
  const { userId, companyId, institutionName, acc, now } = args;
  const brand = (acc.creditData?.brand ?? "other").toString().toLowerCase().slice(0, 40);
  const last4 = extractLast4(acc.number);
  const creditLimit = typeof acc.creditData?.creditLimit === "number"
    ? acc.creditData.creditLimit
    : 0;

  const { data, error } = await admin
    .from("credit_cards")
    .insert({
      user_id: userId,
      company_id: companyId,
      context: "pj",
      brand,
      last4,
      holder_name: acc.name ?? null,
      issuer: institutionName,
      credit_limit: creditLimit,
      closing_day: dayFromDate(acc.creditData?.balanceCloseDate, 1),
      due_day: dayFromDate(acc.creditData?.balanceDueDate, 10),
      autopay: false,
      interest_rate_monthly: 0,
      minimum_payment_percent: 0,
      is_corporate: true,
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[pluggy-item-register] local_card_insert_failed", { code: error.code });
    return null;
  }
  return (data as { id: string }).id;
}
        }
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
