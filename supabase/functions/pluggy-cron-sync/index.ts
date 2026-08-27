import { secretMatches } from '../_shared/secret.ts';
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

const BATCH_SIZE = Number(Deno.env.get('PLUGGY_CRON_BATCH_SIZE') ?? '25');
const PARALLELISM = Number(Deno.env.get('PLUGGY_CRON_PARALLELISM') ?? '6');
const ITEM_TIMEOUT_MS = Number(Deno.env.get('PLUGGY_CRON_ITEM_TIMEOUT_MS') ?? '45000');
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

  // 1) Lote de conexões vencidas, mais antigas primeiro (fair queueing)
  const { data: conns, error: connErr } = await admin
    .from('pluggy_connections')
    .select('id, pluggy_item_id, sync_attempts')
    .not('status', 'in', '("deleted","login_error")')
    .lt('sync_attempts', MAX_ATTEMPTS)
    .lte('next_sync_at', new Date().toISOString())
    .order('next_sync_at', { ascending: true })
    .limit(BATCH_SIZE);

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

  // 3) Claim: empurra o next_sync_at do lote para frente antes de trabalhar,
  //    evitando que uma execução concorrente do cron pegue as mesmas conexões.
  await admin
    .from('pluggy_connections')
    .update({
      next_sync_at: minutesFromNow(10),
      last_sync_attempt_at: new Date().toISOString(),
    })
    .in('id', ids);

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
        body: JSON.stringify({ item_id: c.pluggy_item_id }),
      });

      if (res.ok) {
        await admin.from('pluggy_connections').update({
          sync_attempts: 0,
          next_sync_at: minutesFromNow(SUCCESS_INTERVAL_MIN),
          last_sync_status: 'success',
          last_sync_error: null,
        }).eq('id', c.id);
        return { item: c.pluggy_item_id, ok: true };
      }

      const detail = (await res.text().catch(() => '')).slice(0, 500);
      const attempts = (c.sync_attempts ?? 0) + 1;
      await admin.from('pluggy_connections').update({
        sync_attempts: attempts,
        next_sync_at: minutesFromNow(backoffMinutes(attempts)),
        last_sync_status: attempts >= MAX_ATTEMPTS ? 'dead_letter' : 'error',
        last_sync_error: `HTTP ${res.status}: ${detail}`,
      }).eq('id', c.id);
      console.error('pluggy-cron-sync: item falhou', {
        requestId, item: c.pluggy_item_id, status: res.status, attempts,
      });
      return { item: c.pluggy_item_id, ok: false, status: res.status, attempts };
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

  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => r.ok === false || r.error).length;
  console.log('pluggy-cron-sync: lote concluído', {
    requestId, claimed: candidates.length, ok, failed,
  });

  return new Response(JSON.stringify({
    request_id: requestId,
    claimed: candidates.length,
    ok,
    failed,
    results,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
