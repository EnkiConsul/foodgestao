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
import { classifySyncResult, type SyncBody } from '../_shared/syncOutcome.ts';
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
/** Espera mínima entre duas coletas da mesma conexão (rajadas do provedor). */
const SYNC_COOLDOWN_MIN = Number(Deno.env.get('PLUGGY_SYNC_COOLDOWN_MIN') ?? '15');
/** Janela em que um item pendente de vínculo manual não é reprocessado. */
const PENDING_LINK_SUPPRESS_HOURS = Number(
  Deno.env.get('PLUGGY_PENDING_LINK_SUPPRESS_HOURS') ?? '24',
);

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
    // Conexão já revogada pelo usuário mantém o estado "revoked" (auditoria).
    .not('status', 'in', '("deleted","revoked")');
}

/** Indisponibilidade do banco (não é erro de credencial): vale retentar. */
function isTemporaryBankOutage(detail: string): boolean {
  const d = detail.toLowerCase();
  return d.includes('not available') || d.includes('maintenance') ||
    d.includes('unavailable') || d.includes('indisponí') || d.includes('manutenç') ||
    d.includes('timeout') || d.includes('try again');
}

async function handleItemError(admin: Admin, itemId: string | null, payload: any) {
  const detail = String(
    payload?.error?.message ?? payload?.error?.code ?? payload?.executionStatus ?? 'item_error',
  ).slice(0, 500);
  const temporary = isTemporaryBankOutage(detail);
  if (itemId) {
    await admin.from('pluggy_connections')
      .update({
        // O enum de status não tem estado "temporário": mantém `error` e
        // diferencia pelo motivo, que é o que a tela mostra ao usuário.
        status: 'error',
        last_error: detail,
        last_sync_status: temporary ? 'bank_unavailable' : 'item_error',
      })
      .eq('pluggy_item_id', itemId);
  }
  // Banco fora do ar é temporário: deixa o backoff da fila retentar depois.
  if (temporary) throw new Error(`bank_unavailable: ${detail}`);
  // Erro no item exige ação do usuário (credencial/MFA): retentar não resolve.
  throw new FatalEventError(`item_error: ${detail}`, 'item_error');
}

type SyncHints = {
  /** Janela ampla (dias) — só para eventos de atualização retroativa. */
  windowDays?: number;
  /** Conta específica informada pelo evento (evita varrer todas). */
  accountId?: string | null;
  /** Data mínima das transações novas informada pelo evento. */
  minDate?: string | null;
};

async function triggerSync(itemId: string, hints: SyncHints = {}) {
  const payload: Record<string, unknown> = { item_id: itemId };
  if (hints.windowDays) payload.days = hints.windowDays;
  if (hints.accountId) payload.account_ids = [hints.accountId];
  if (hints.minDate) payload.min_date = hints.minDate;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/pluggy-sync-item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify(payload),
  });


  const raw = await res.text().catch(() => '');
  let body: SyncBody | null = null;
  try { body = raw ? JSON.parse(raw) as SyncBody : null; } catch { body = null; }

  if (res.status === 409 && raw.includes('duplicate_account_other_company')) {
    // Contas já ligadas em outra empresa: só uma pessoa pode decidir se a
    // duplicidade é aceitável. O worker não confirma nada — retentar cinco
    // vezes gera o mesmo 409 e esconde a pendência.
    throw new FatalEventError(
      `pending_manual_link: contas do item ${itemId} já ligadas em outra empresa`,
      'pending_manual_link',
    );
  }

  if (raw.includes('company_id_required') || raw.includes('company_conflict')) {
    // Empresa não resolvida ou conflito entre empresas: aguarda revisão humana
    // em /admin/pluggy-status — retentar cinco vezes não decide nada.
    throw new FatalEventError(
      `pending_manual_link: empresa não resolvida para o item ${itemId}`,
      'pending_manual_link',
    );
  }

  // HTTP 200 não é conclusão: parcial, pendente e erro precisam de nova tentativa
  // pelo backoff da fila, em vez de virar "processado".
  const outcome = classifySyncResult({ httpStatus: res.status, body });
  if (outcome.status === 'success' || outcome.status === 'skipped') return;
  // PARTIAL_SUCCESS do próprio banco (sem falha de gravação nossa): o que veio
  // já foi importado e o status parcial fica registrado na conexão. Retentar
  // o mesmo evento não faz o banco devolver as contas faltantes — a próxima
  // coleta do banco gera um evento novo.
  if (
    outcome.status === 'partial_success' &&
    String(body?.execution_status ?? '').toUpperCase() === 'PARTIAL_SUCCESS' &&
    (body?.write_failures ?? 0) === 0 &&
    body?.v2_materialized !== false
  ) {
    console.warn(`pluggy-webhook-worker: item ${itemId} coleta parcial do banco — registrada sem retentativa`);
    return;
  }
  throw new Error(`sync_${outcome.status}: ${outcome.detail ?? `HTTP ${res.status}`}`);
}

/** O item existe em alguma conexão do sistema (v1 ou v2)? */
async function itemIsKnown(admin: Admin, itemId: string): Promise<boolean> {
  const [v1, v2] = await Promise.all([
    admin.from('pluggy_connections').select('id', { count: 'exact', head: true })
      .eq('pluggy_item_id', itemId),
    admin.from('pluggy_v2_connections').select('id', { count: 'exact', head: true })
      .eq('pluggy_item_id', itemId),
  ]);
  return (v1.count ?? 0) > 0 || (v2.count ?? 0) > 0;
}


/** Conexão sincronizada há pouco: rajada do provedor não vira nova coleta. */
async function inCooldown(admin: Admin, itemId: string): Promise<boolean> {
  if (!(SYNC_COOLDOWN_MIN > 0)) return false;
  const { data, error } = await admin.rpc('pluggy_connection_in_cooldown', {
    _item_id: itemId,
    _cooldown_minutes: SYNC_COOLDOWN_MIN,
  });
  if (error) {
    console.warn('pluggy-webhook-worker: cooldown check falhou', error.message);
    return false;
  }
  return data === true;
}

/**
 * Item já aguardando vínculo manual: novos eventos não repetem a tentativa
 * (isso gerava dezenas de descartes silenciosos para a mesma conexão).
 */
async function awaitingManualLink(admin: Admin, itemId: string): Promise<boolean> {
  const since = new Date(Date.now() - PENDING_LINK_SUPPRESS_HOURS * 3600_000).toISOString();
  const { count } = await admin
    .from('pluggy_webhook_events')
    .select('id', { count: 'exact', head: true })
    .eq('pluggy_item_id', itemId)
    .eq('error_code', 'pending_manual_link')
    .gte('created_at', since);
  return (count ?? 0) > 0;
}

/** Abre ocorrência na Auditoria de Erros do Backoffice (dedup por item). */
async function registrarPendenciaVinculo(admin: Admin, itemId: string, detalhe: string) {
  const { error } = await admin.rpc('app_error_log_record', {
    _fingerprint: `open_finance:pending_manual_link:${itemId}`,
    _message: `Conexão bancária aguardando vínculo manual (item ${itemId})`,
    _surface: 'open_finance',
    _route: '/admin/pluggy-status',
    _action: 'pluggy_webhook_worker',
    _severity: 'warning',
    _source: 'edge',
    _code: 'pending_manual_link',
    _user_message: 'Uma conexão bancária parou de atualizar e precisa ser vinculada a uma empresa no Backoffice.',
    _details: { pluggy_item_id: itemId, detalhe },
  });
  if (error) console.warn('pluggy-webhook-worker: falha ao registrar pendência', error.message);
}

async function processEvent(
  admin: Admin,
  ev: { event_type: string; pluggy_item_id: string | null; payload: any },
) {
  const type = ev.event_type;
  const itemId = ev.pluggy_item_id ?? ev.payload?.itemId ?? ev.payload?.item?.id ?? null;

  // Item desconhecido: só é ruído para eventos que dependem de uma conexão já
  // existente. Em eventos de coleta o item PODE ser uma autorização nova cujo
  // navegador nunca voltou — nesse caso seguimos e deixamos o `pluggy-sync-item`
  // resolver a empresa pela solicitação de conexão validada.
  if (itemId && !SYNC_EVENTS.has(type) && !(await itemIsKnown(admin, itemId))) {
    console.log(`pluggy-webhook-worker: item ${itemId} desconhecido — evento ignorado`);
    return;
  }

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

    if (await awaitingManualLink(admin, itemId)) {
      console.log(`pluggy-webhook-worker: item ${itemId} aguardando vínculo manual — evento suspenso`);
      return;
    }

    // Atualizações retroativas precisam de janela ampla; coletas rotineiras não.
    const isRetroactive = type === 'transactions/updated';
    if (!isRetroactive && await inCooldown(admin, itemId)) {
      console.log(`pluggy-webhook-worker: item ${itemId} sincronizado há menos de ${SYNC_COOLDOWN_MIN} min — coleta dispensada`);
      return;
    }

    const accountId = typeof ev.payload?.accountId === 'string' ? ev.payload.accountId : null;
    const minDate = typeof ev.payload?.transactionsMinDate === 'string'
      ? ev.payload.transactionsMinDate.slice(0, 10)
      : null;

    await triggerSync(itemId, {
      windowDays: isRetroactive ? UPDATE_WINDOW_DAYS : undefined,
      accountId: type === 'transactions/created' ? accountId : null,
      minDate: type === 'transactions/created' ? minDate : null,
    });
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

  // Coletas presas (timeout da function) não fecham sozinhas: encerra antes de
  // trabalhar, para que o histórico de execuções reflita a realidade.
  const { data: reaped, error: reapErr } = await admin.rpc('pluggy_reap_stale_sync_runs', {
    _timeout_minutes: 15,
  });
  if (reapErr) console.warn('pluggy-webhook-worker: reaper falhou', reapErr.message);
  else if ((reaped as number | null) && Number(reaped) > 0) {
    console.warn(`pluggy-webhook-worker: ${reaped} execução(ões) travada(s) encerrada(s)`);
  }

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

  let processed = 0, retried = 0, dead = 0, skipped = 0, consolidated = 0;

  // Rajada do provedor: login_succeeded + item/updated + transactions/created
  // chegam juntos para o mesmo item. Apenas o primeiro dispara a coleta; os
  // demais são concluídos como consolidados no lote.
  const itemJaProcessadoNoLote = new Set<string>();

  for (const ev of events) {
    if (Date.now() - startedAt > MAX_RUN_MS) { skipped++; continue; }

    const evItemId = ev.pluggy_item_id ?? ev.payload?.itemId ?? ev.payload?.item?.id ?? null;
    if (evItemId && SYNC_EVENTS.has(ev.event_type) && ev.event_type !== 'transactions/updated') {
      if (itemJaProcessadoNoLote.has(evItemId)) {
        await admin.rpc('pluggy_webhook_finalize_success', { _event_id: ev.id, _worker: workerId });
        consolidated++;
        continue;
      }
      itemJaProcessadoNoLote.add(evItemId);
    }

    try {
      await processEvent(admin, ev);
      await admin.rpc('pluggy_webhook_finalize_success', { _event_id: ev.id, _worker: workerId });
      processed++;
    } catch (e) {
      const fatal = e instanceof FatalEventError;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`pluggy-webhook-worker: event ${ev.event_id} failed`, msg);
      const code = fatal ? (e as FatalEventError).code : 'processing_error';
      if (code === 'pending_manual_link' && evItemId) {
        await registrarPendenciaVinculo(admin, evItemId, msg);
      }
      const { data: status } = await admin.rpc('pluggy_webhook_finalize_failure', {
        _event_id: ev.id, _worker: workerId, _error: msg,
        _error_code: code,
        _fatal: fatal,
      });
      if (status === 'dead_letter') dead++; else retried++;
    }
  }

  return json({
    ok: true, worker: workerId, claimed: events.length,
    processed, retried, dead, skipped, consolidated, reaped: reaped ?? 0,
  });

});
