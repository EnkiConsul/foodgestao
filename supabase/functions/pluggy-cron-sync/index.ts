import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Called by pg_cron with a shared secret in header
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const cronSecret = Deno.env.get('PLUGGY_CRON_SECRET') ?? '';
  const provided = req.headers.get('x-cron-secret') ??
    new URL(req.url).searchParams.get('secret') ?? '';
  if (!cronSecret || provided !== cronSecret) {
    return new Response('forbidden', { status: 403, headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: conns } = await admin
    .from('pluggy_connections')
    .select('pluggy_item_id')
    .not('status', 'in', '("deleted","login_error")');

  const results: any[] = [];
  for (const c of conns ?? []) {
    try {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/pluggy-sync-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ item_id: c.pluggy_item_id }),
      });
      results.push({ item: c.pluggy_item_id, ok: res.ok });
    } catch (e) {
      results.push({ item: c.pluggy_item_id, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ synced: results.length, results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
