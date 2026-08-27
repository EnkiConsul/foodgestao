// supabase/functions/pluggy-webhook/index.ts
// Endpoint público (verify_jwt = false), validado por segredo compartilhado.
//
// Este endpoint APENAS registra o evento na fila (inbox) `pluggy_webhook_events`.
// O processamento (sincronização, deleções) é feito por `pluggy-webhook-worker`
// via pg_cron, com tentativas, backoff exponencial e dead letter.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const webhookSecret = Deno.env.get('PLUGGY_WEBHOOK_SECRET') ?? '';
  const provided = req.headers.get('x-webhook-secret') ??
    new URL(req.url).searchParams.get('secret') ?? '';
  if (!webhookSecret || provided !== webhookSecret) {
    return new Response('forbidden', { status: 403, headers: corsHeaders });
  }

  let payload: any;
  try { payload = await req.json(); } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const eventId: string | null = payload?.eventId ?? payload?.id ?? null;
  const eventType: string = payload?.event ?? payload?.type ?? '';
  const itemId: string | null = payload?.itemId ?? payload?.item?.id ?? null;

  // eventId é obrigatório: sem ele não há proteção contra evento duplicado.
  if (!eventId || typeof eventId !== 'string' || !eventType) {
    console.error('pluggy-webhook: missing event id/type', { eventType, hasId: !!eventId, itemId });
    return json({ error: 'missing_event_id' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error } = await admin.from('pluggy_webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
    pluggy_item_id: itemId,
    payload,
    status: 'pending',
    next_attempt_at: new Date().toISOString(),
  });

  if (error) {
    if (error.code === '23505' || String(error.message).includes('duplicate')) {
      return json({ ok: true, deduped: true });
    }
    console.error('pluggy-webhook: enqueue error', error);
    return json({ error: 'enqueue_failed' }, 500);
  }

  return json({ ok: true, queued: true });
});
