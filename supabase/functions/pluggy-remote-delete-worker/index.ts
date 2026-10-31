// Worker da fila de remoção remota de itens na Pluggy (pg_cron a cada 5 min).
//
// Fila = colunas needs_remote_delete/remote_delete_* em pluggy_connections,
// alimentada por pluggy-disconnect-item (DELETE falhou) e pluggy-sync-item
// (itens substituídos por nova autorização do mesmo banco).
// - claim em lote com FOR UPDATE SKIP LOCKED (pluggy_remote_delete_claim)
// - DELETE /items/{id}; 404 conta como sucesso (deleteItem já trata)
// - sucesso → provider_delete_status = 'ok'; falha → backoff exponencial e
//   dead letter após 10 tentativas (pluggy_remote_delete_finalize_failure)
//
// verify_jwt = false — protegido pelo header x-worker-secret.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { secretMatches } from '../_shared/secret.ts';
import { deleteItem } from '../_shared/pluggy.ts';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 10;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const expected = Deno.env.get('WEBHOOK_WORKER_SECRET') ?? Deno.env.get('PLUGGY_CRON_SECRET');
  const provided = req.headers.get('x-worker-secret');
  const ok = secretMatches(provided, expected)
    || secretMatches(provided, Deno.env.get('PLUGGY_CRON_SECRET'));
  if (!ok) return new Response('forbidden', { status: 403, headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: rows, error } = await admin.rpc('pluggy_remote_delete_claim', {
    _batch: BATCH_SIZE, _lease_seconds: 120,
  });
  if (error) {
    console.error('pluggy-remote-delete-worker: claim falhou', error.message);
    return new Response(JSON.stringify({ error: 'claim_failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{ id: string; ok: boolean }> = [];
  for (const r of (rows ?? []) as Array<{ id: string; pluggy_item_id: string }>) {
    try {
      await deleteItem(r.pluggy_item_id);
      await admin.rpc('pluggy_remote_delete_finalize_success', { _id: r.id });
      results.push({ id: r.id, ok: true });
    } catch (e) {
      await admin.rpc('pluggy_remote_delete_finalize_failure', {
        _id: r.id, _error: String(e).slice(0, 300), _max_attempts: MAX_ATTEMPTS,
      });
      results.push({ id: r.id, ok: false });
    }
  }

  return new Response(JSON.stringify({
    claimed: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
