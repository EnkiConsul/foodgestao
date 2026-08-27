// supabase/functions/pluggy-webhook-worker/index.ts
// Worker da fila de webhooks da Pluggy (pg_cron a cada minuto).
//
// - claim de lote com FOR UPDATE SKIP LOCKED (dois workers nunca pegam o mesmo evento)
// - eventos de sync chamam `pluggy-sync-item` (idempotente por pluggy_transaction_id)
// - transactions/deleted: descarta o extrato a conciliar e marca para revisão o que
//   já virou lançamento no sistema (nunca apaga automaticamente)
// - item/deleted e item/error: atualizam a conexão; erro de credencial vai direto
//   para dead letter (retentar não resolve)
// - falha temporária → retry com backoff exponencial; no limite → dead letter
//
// verify_jwt = false — protegido pelo header secreto interno (WEBHOOK_WORKER_SECRET,
// com fallback para PLUGGY_CRON_SECRET, o segredo compartilhado dos jobs internos).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Comparação de segredos em tempo constante (inline: o bundler desta função não
 * resolve `../_shared/`). Segredo aceito SOMENTE por cabeçalho.
 */
function secretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!expected || !provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}


const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WORKER_SECRET = Deno.env.get('WEBHOOK_WORKER_SECRET') ?? Deno.env.get('PLUGGY_CRON_SECRET');

const BATCH_SIZE = Number(Deno.env.get('PLUGGY_WEBHOOK_BATCH_SIZE') ?? '10');
const LEASE_SECONDS = 180;
const UPDATE_WINDOW_DAYS = Number(Deno.env.get('PLUGGY_UPDATE_WINDOW_DAYS') ?? '90');
const MAX_RUN_MS = 50_000;

const SYNC_EVENTS = new Set([
  'item/created',
  'item/updated',
  'item/login_succeeded',
  'item/waiting_user_input',
  'transactions/created',
  'transactions/updated',
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type Admin = SupabaseClient;

class FatalEventError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/** Lançamentos removidos na origem (Open Finance). */
async function handleTransactionsDeleted(admin: Admin, payload: any) {
  const ids: string[] = (
    payload?.transactionIds ?? payload?.transactionsIds ?? payload?.transactions ?? []
  )
    .map((t: any) => (typeof t === 'string' ? t : t?.id))
    .filter((v: any): v is string => typeof v === 'string' && v.length > 0);

  if (ids.length === 0) return { discarded: 0, flagged: 0 };

  let discarded = 0;
  let flagged = 0;

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);

    // 1. Extrato ainda não conciliado → descartar
    const { data: ignored, error: igErr } = await admin
      .from('pluggy_staging_transactions')
      .update({ status: 'ignored' })
      .in('pluggy_transaction_id', chunk)
      .in('status', ['pending', 'duplicate'])
      .select('id');
    if (igErr) throw new Error(`staging_discard: ${igErr.message}`);
    discarded += ignored?.length ?? 0;

    // 2. Já virou lançamento no sistema → marcar para revisão (não apagar)
    const { data: flaggedRows, error: flErr } = await admin
      .from('transactions')
      .update({ needs_review: true, review_reason: 'removido_na_origem' })
      .in('pluggy_transaction_id', chunk)
      .select('id');
    if (flErr) throw new Error(`transactions_flag: ${flErr.message}`);
    flagged += flaggedRows?.length ?? 0;
  }

  return { discarded, flagged };
}

async function handleItemDeleted(admin: Admin, itemId: string | null) {
  if (!itemId) return;
  await admin.from('pluggy_connections')
    .update({ status: 'deleted', last_sync_status: 'item_deleted_at_provider' })
    .eq('pluggy_item_id', itemId)
    .neq('status', 'deleted');
}

async function handleItemError(admin: Admin, itemId: string | null, payload: any) {
  const detail = String(
    payload?.error?.message ?? payload?.error?.code ?? payload?.executionStatus ?? 'item_error',
  ).slice(0, 500);
  if (itemId) {
    await admin.from('pluggy_connections')
      .update({ status: 'error', last_error: detail, last_sync_status: 'item_error' })
      .eq('pluggy_item_id', itemId);
  }
  // Erro no item exige ação do usuário (credencial/MFA): retentar não resolve.
  throw new FatalEventError(`item_error: ${detail}`, 'item_error');
}

async function triggerSync(itemId: string, windowDays?: number) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pluggy-sync-item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify(windowDays ? { item_id: itemId, days: windowDays } : { item_id: itemId }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    if (detail.includes('company_id_required')) {
      // Item sem empresa resolvida: precisa de vínculo manual em /admin/pluggy-status.
      throw new FatalEventError(
        `pending_manual_link: empresa não resolvida para o item ${itemId}`,
        'pending_manual_link',
      );
    }
    throw new Error(`sync_failed_${res.status}: ${detail}`);
  }
  await res.text();
}

async function processEvent(
  admin: Admin,
  ev: { event_type: string; pluggy_item_id: string | null; payload: any },
) {
  const type = ev.event_type;
  const itemId = ev.pluggy_item_id ?? ev.payload?.itemId ?? ev.payload?.item?.id ?? null;

  if (type === 'transactions/deleted') {
    await handleTransactionsDeleted(admin, ev.payload);
    return;
  }
  if (type === 'item/deleted') {
    await handleItemDeleted(admin, itemId);
    return;
  }
  if (type === 'item/error' || type === 'item/login_error') {
    await handleItemError(admin, itemId, ev.payload);
    return;
  }
  if (SYNC_EVENTS.has(type)) {
    if (!itemId) throw new FatalEventError('missing_item_id', 'missing_item_id');
    // Alterações na origem podem atingir lançamentos antigos: a janela padrão de
    // 30 dias nunca os reprocessaria.
    await triggerSync(itemId, type === 'transactions/updated' ? UPDATE_WINDOW_DAYS : undefined);
    return;
  }
  // Evento sem tratamento: registrado e concluído (nada a fazer).
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Segredo SOMENTE por cabeçalho (query string vaza em logs/referer).
  const provided = req.headers.get('x-worker-secret') ??
    req.headers.get('x-cron-secret');
  if (!secretMatches(provided, WORKER_SECRET)) {
    return new Response('forbidden', { status: 403, headers: corsHeaders });
  }

  const admin: Admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const workerId = `pluggy-worker-${crypto.randomUUID().slice(0, 8)}`;
  const startedAt = Date.now();

  const { data: claimed, error: claimErr } = await admin.rpc('pluggy_webhook_claim', {
    _worker: workerId, _batch: BATCH_SIZE, _lease_seconds: LEASE_SECONDS,
  });
  if (claimErr) {
    console.error('pluggy-webhook-worker: claim failed', claimErr);
    return json({ error: 'claim_failed', detail: claimErr.message }, 500);
  }

  const events = (claimed ?? []) as Array<{
    id: string; event_id: string; event_type: string;
    pluggy_item_id: string | null; payload: any;
    attempt_count: number; max_attempts: number;
  }>;

  let processed = 0, retried = 0, dead = 0, skipped = 0;

  for (const ev of events) {
    if (Date.now() - startedAt > MAX_RUN_MS) { skipped++; continue; }
    try {
      await processEvent(admin, ev);
      await admin.rpc('pluggy_webhook_finalize_success', { _event_id: ev.id, _worker: workerId });
      processed++;
    } catch (e) {
      const fatal = e instanceof FatalEventError;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`pluggy-webhook-worker: event ${ev.event_id} failed`, msg);
      const { data: status } = await admin.rpc('pluggy_webhook_finalize_failure', {
        _event_id: ev.id, _worker: workerId, _error: msg,
        _error_code: fatal ? (e as FatalEventError).code : 'processing_error',
        _fatal: fatal,
      });
      if (status === 'dead_letter') dead++; else retried++;
    }
  }

  return json({ ok: true, worker: workerId, claimed: events.length, processed, retried, dead, skipped });
});
