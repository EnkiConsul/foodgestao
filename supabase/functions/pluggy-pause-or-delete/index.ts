import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { deleteItem } from '../_shared/pluggy.ts';

// Chamada após a desativação de uma conta bancária local.
// Se ainda existir alguma conta Open Finance ativa na mesma conexão, apenas
// confirmamos a pausa. Se todas ficaram pausadas, encerramos o item na Pluggy.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: claims } = await anon.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const accountId = typeof body?.account_id === 'string' ? body.account_id : null;
    if (!accountId) return json({ error: 'account_id_required' }, 400);

    const { data: ofAcc } = await admin
      .from('pluggy_accounts')
      .select('id, connection_id, pluggy_account_id, company_id')
      .eq('linked_account_id', accountId)
      .maybeSingle();
    if (!ofAcc) return json({ ok: true, scope: 'no_link' });

    const { data: mem } = await admin
      .from('company_members').select('id')
      .eq('company_id', ofAcc.company_id).eq('user_id', userId).maybeSingle();
    if (!mem) return json({ error: 'forbidden' }, 403);

    const { count: activeCount } = await admin
      .from('pluggy_accounts')
      .select('id', { head: true, count: 'exact' })
      .eq('connection_id', ofAcc.connection_id)
      .is('sync_paused_at', null);

    if ((activeCount ?? 0) > 0) return json({ ok: true, scope: 'paused' });

    const { data: conn } = await admin
      .from('pluggy_connections')
      .select('id, pluggy_item_id')
      .eq('id', ofAcc.connection_id)
      .maybeSingle();
    if (!conn) return json({ ok: true, scope: 'paused' });

    try {
      await deleteItem(conn.pluggy_item_id);
    } catch (e) {
      console.warn('pluggy deleteItem failed:', String(e));
      return json({ ok: false, scope: 'delete_failed' });
    }

    await admin.from('pluggy_staging_transactions')
      .delete().eq('connection_id', conn.id).eq('status', 'pending');
    await admin.from('pluggy_connections').delete().eq('id', conn.id);

    return json({ ok: true, scope: 'connection_deleted' });
  } catch (e) {
    return json({ error: String(e) }, 400);
  }
});
