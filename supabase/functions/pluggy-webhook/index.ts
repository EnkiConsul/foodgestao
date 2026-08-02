import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Public webhook — validated via shared secret in header or query
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const webhookSecret = Deno.env.get('PLUGGY_WEBHOOK_SECRET') ?? '';
  const provided = req.headers.get('x-webhook-secret') ??
    new URL(req.url).searchParams.get('secret') ?? '';
  if (!webhookSecret || provided !== webhookSecret) {
    return new Response('forbidden', { status: 403, headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let payload: any;
  try { payload = await req.json(); } catch {
    return new Response('bad_request', { status: 400, headers: corsHeaders });
  }

  const eventId = payload?.eventId ?? payload?.id ?? crypto.randomUUID();
  const eventType = payload?.event ?? payload?.type ?? 'unknown';
  const itemId = payload?.itemId ?? payload?.item?.id ?? null;

  // Idempotency insert
  const { error: insErr } = await admin.from('pluggy_webhook_events').insert({
    event_id: eventId, event_type: eventType, pluggy_item_id: itemId, payload,
  });
  if (insErr && !String(insErr.message).includes('duplicate')) {
    console.error('webhook insert error', insErr);
  }

  // Trigger sync for item events
  const syncEvents = [
    'item/created',
    'item/updated',
    'item/login_succeeded',
    'item/waiting_user_input',
    'transactions/created',
    'transactions/updated',
  ];
  if (itemId && syncEvents.includes(eventType)) {
    try {
      const syncUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pluggy-sync-item`;
      const res = await fetch(syncUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ item_id: itemId }),
      });
      if (!res.ok) {
        const detail = await res.text();
        console.error(`webhook sync failed [${res.status}]: ${detail}`);
        // Quando a empresa não pôde ser resolvida, o item fica pendente de
        // vínculo manual em /admin/pluggy-status (não é descartado).
        const pending = detail.includes('company_id_required');
        await admin.from('pluggy_webhook_events')
          .update({
            error: pending
              ? `pending_manual_link: empresa não resolvida para o item ${itemId}`
              : `sync_failed_${res.status}: ${detail.slice(0, 500)}`,
          })
          .eq('event_id', eventId);
      } else {
        await admin.from('pluggy_webhook_events')
          .update({ processed_at: new Date().toISOString(), error: null })
          .eq('event_id', eventId);
      }
    } catch (e) {
      console.error('webhook sync trigger failed', e);
      await admin.from('pluggy_webhook_events')
        .update({ error: String(e) })
        .eq('event_id', eventId);
    }
  }


  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
