import { secretMatches } from '../_shared/secret.ts';
import { classifySyncResult, type SyncBody } from '../_shared/syncOutcome.ts';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Despachante de sincronização Open Finance.
// Chamado pelo pg_cron com um segredo compartilhado no header.
//
// Escala: em vez de percorrer TODAS as conexões sequencialmente (o que estoura o
// wall-clock da function conforme a base cresce), este job:
//   1. claim: pega apenas um LOTE de conexões vencidas (next_sync_at <= now)
//   2. executa com paralelismo limitado
//   3. reagenda cada conexão com backoff progressivo em caso de falha
//      e dead-letter após MAX_ATTEMPTS falhas consecutivas.
// Assim o tempo de execução é constante e previsível, independente do nº de tenants.

// Dimensionamento (pior caso, todas as conexões estourando o timeout):
//   ondas = ceil(BATCH_SIZE / PARALLELISM) = ceil(12 / 6) = 2
//   tempo = ondas × ITEM_TIMEOUT_MS = 2 × 50s = 100s  (< 120s do limite)
// O sync-item espera no máximo SYNC_WAIT_MS (20s) pela coleta e ainda tem
// ~30s para gravar contas/lançamentos antes do abort de 50s.
// Rodando a cada 10 min, cada execução atende até 12 conexões (≈1.700/dia).
const BATCH_SIZE = 12;
const PARALLELISM = 6;
const ITEM_TIMEOUT_MS = 50_000;
const SYNC_WAIT_MS = 20_000;
const SUCCESS_INTERVAL_MIN = Number(Deno.env.get('PLUGGY_CRON_INTERVAL_MIN') ?? '60');
const MAX_ATTEMPTS = 6;

/** Backoff progressivo: 5min, 15min, 45min, 2h15, 6h45, 20h */
function backoffMinutes(attempts: number): number {
  return Math.min(5 * Math.pow(3, Math.max(0, attempts - 1)), 60 * 20);
}

function minutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const cronSecret = Deno.env.get('PLUGGY_CRON_SECRET') ?? '';
  // Segredo SOMENTE por cabeçalho (query string vaza em logs/referer).
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!secretMatches(provided, cronSecret)) {
    return new Response('forbidden', { status: 403, headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Coletas presas por timeout da function não fecham sozinhas.
  const { error: reapErr } = await admin.rpc('pluggy_reap_stale_sync_runs', {
    _timeout_minutes: 15,
  });
  if (reapErr) console.warn('pluggy-cron-sync: reaper falhou', { requestId, error: reapErr.message });



  // 1) Claim atômico (FOR UPDATE SKIP LOCKED): duas execuções simultâneas
  //    nunca recebem a mesma conexão. O lease empurra next_sync_at.
  const { data: conns, error: connErr } = await admin.rpc('pluggy_connections_claim_due', {
    _batch: BATCH_SIZE, _lease_minutes: 10,
  });

  if (connErr) {
    console.error('pluggy-cron-sync: falha ao listar conexões', { requestId, error: connErr.message });
    return new Response(JSON.stringify({ error: 'list_failed', request_id: requestId }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const candidates = conns ?? [];
  if (candidates.length === 0) {
    return new Response(JSON.stringify({ request_id: requestId, claimed: 0, results: [] }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 2) Contas pausadas: se todas as contas espelhadas de uma conexão estão
  //    pausadas (conta bancária local desativada), não gastamos chamada na Pluggy.
  const ids = candidates.map((c: any) => c.id);
  const { data: pAccounts } = await admin
    .from('pluggy_accounts')
    .select('connection_id, sync_paused_at')
    .in('connection_id', ids);
  const hasActiveAccount = new Set(
    (pAccounts ?? []).filter((a: any) => !a.sync_paused_at).map((a: any) => a.connection_id),
  );
  const knownConnections = new Set((pAccounts ?? []).map((a: any) => a.connection_id));

  async function syncOne(c: any) {
    if (knownConnections.has(c.id) && !hasActiveAccount.has(c.id)) {
      await admin.from('pluggy_connections').update({
        next_sync_at: minutesFromNow(SUCCESS_INTERVAL_MIN * 4),
        last_sync_status: 'skipped_paused',
        last_sync_error: null,
      }).eq('id', c.id);
      return { item: c.pluggy_item_id, skipped: 'sync_paused' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ITEM_TIMEOUT_MS);
    try {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/pluggy-sync-item`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'x-request-id': requestId,
        },
        body: JSON.stringify({ item_id: c.pluggy_item_id, wait_ms: SYNC_WAIT_MS }),
      });

      // HTTP 200 não é sucesso: o corpo diz se a coleta concluiu, ficou
      // parcial, continua em andamento ou foi ignorada.
      const raw = await res.text().catch(() => '');
      let body: SyncBody | null = null;
      try { body = raw ? JSON.parse(raw) as SyncBody : null; } catch { body = null; }
      const outcome = classifySyncResult({ httpStatus: res.status, body });

      if (outcome.status === 'success') {
        await admin.from('pluggy_connections').update({
          sync_attempts: 0,
          next_sync_at: minutesFromNow(SUCCESS_INTERVAL_MIN),
          last_sync_status: 'success',
          last_sync_error: null,
        }).eq('id', c.id);
        return { item: c.pluggy_item_id, ok: true, status: 'success' };
      }

      if (outcome.status === 'skipped') {
        await admin.from('pluggy_connections').update({
          sync_attempts: 0,
          next_sync_at: minutesFromNow(SUCCESS_INTERVAL_MIN * 4),
          last_sync_status: 'skipped',
          last_sync_error: outcome.detail,
        }).eq('id', c.id);
        return { item: c.pluggy_item_id, ok: false, status: 'skipped', skipped: outcome.detail };
      }

      // Coleta parcial (ex.: Pix "em análise", extrato incompleto do banco)
      // não é falha: segue no ritmo normal e nunca vira dead-letter.
      if (outcome.status === 'partial_success') {
        await admin.from('pluggy_connections').update({
          sync_attempts: 0,
          next_sync_at: minutesFromNow(SUCCESS_INTERVAL_MIN),
          last_sync_status: 'partial_success',
          last_sync_error: outcome.detail ?? null,
        }).eq('id', c.id);
        return { item: c.pluggy_item_id, ok: false, status: 'partial_success', detail: outcome.detail };
      }

      const attempts = (c.sync_attempts ?? 0) + 1;
      const esgotou = attempts >= MAX_ATTEMPTS && outcome.status === 'error';
      await admin.from('pluggy_connections').update({
        sync_attempts: attempts,
        next_sync_at: minutesFromNow(backoffMinutes(attempts)),
        last_sync_status: esgotou ? 'dead_letter' : outcome.status,
        last_sync_error: outcome.detail ?? `HTTP ${res.status}`,
      }).eq('id', c.id);
      console.error('pluggy-cron-sync: item não concluiu', {
        requestId, item: c.pluggy_item_id, http: res.status, status: outcome.status, attempts,
      });
      return {
        item: c.pluggy_item_id,
        ok: false,
        status: outcome.status,
        http: res.status,
        attempts,
        detail: outcome.detail,
      };
    } catch (e) {
      const attempts = (c.sync_attempts ?? 0) + 1;
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from('pluggy_connections').update({
        sync_attempts: attempts,
        next_sync_at: minutesFromNow(backoffMinutes(attempts)),
        last_sync_status: attempts >= MAX_ATTEMPTS ? 'dead_letter' : 'error',
        last_sync_error: msg.slice(0, 500),
      }).eq('id', c.id);
      console.error('pluggy-cron-sync: exceção no item', {
        requestId, item: c.pluggy_item_id, attempts, error: msg,
      });
      return { item: c.pluggy_item_id, error: msg, attempts };
    } finally {
      clearTimeout(timer);
    }
  }

  // 4) Execução com paralelismo limitado
  const results: any[] = [];
  for (let start = 0; start < candidates.length; start += PARALLELISM) {
    const window = candidates.slice(start, start + PARALLELISM);
    results.push(...await Promise.all(window.map(syncOne)));
  }

  // Contadores reais por estado: parcial e pendente não são sucesso nem falha.
  const conta = (s: string) => results.filter((r) => r.status === s).length;
  const ok = results.filter((r) => r.ok === true).length;
  const partial = conta('partial_success');
  const pending = conta('pending');
  const skipped = conta('skipped');
  const failed = results.filter((r) => r.status === 'error' || r.error).length;
  console.log('pluggy-cron-sync: lote concluído', {
    requestId, claimed: candidates.length, ok, partial, pending, skipped, failed,
  });

  return new Response(JSON.stringify({
    request_id: requestId,
    claimed: candidates.length,
    ok,
    partial,
    pending,
    skipped,
    failed,
    results,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
