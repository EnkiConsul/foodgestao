import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { deleteItem } from '../_shared/pluggy.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: claims } = await anon.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { connection_id, pluggy_account_id } = await req.json();
    if (!connection_id) throw new Error('connection_id_required');

    const { data: conn } = await admin
      .from('pluggy_connections')
      .select('id, company_id, pluggy_item_id')
      .eq('id', connection_id)
      .maybeSingle();
    if (!conn) throw new Error('connection_not_found');

    const { data: mem } = await admin
      .from('company_members').select('id')
      .eq('company_id', conn.company_id).eq('user_id', userId).maybeSingle();
    if (!mem) throw new Error('forbidden');

    // Quando a conexão possui mais de uma conta Open Finance e o chamador aponta
    // uma conta específica, removemos apenas aquela conta — o banco (item Pluggy)
    // continua conectado para as demais contas.
    if (pluggy_account_id) {
      const [{ count }, { data: pAcc }] = await Promise.all([
        admin.from('pluggy_accounts').select('id', { head: true, count: 'exact' }).eq('connection_id', conn.id),
        admin.from('pluggy_accounts').select('id, pluggy_account_id').eq('id', pluggy_account_id).maybeSingle(),
      ]);
      if ((count ?? 0) > 1 && pAcc) {
        await admin.from('pluggy_staging_transactions')
          .delete().eq('connection_id', conn.id)
          .eq('pluggy_account_id', pAcc.pluggy_account_id).eq('status', 'pending');
        await admin.from('pluggy_accounts').delete().eq('id', pAcc.id);
        return new Response(JSON.stringify({ ok: true, scope: 'account' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }


    try { await deleteItem(conn.pluggy_item_id); } catch (e) {
      console.warn('pluggy deleteItem failed (continuing):', e);
    }
    // Remove pending staging first, then connection (cascade drops accounts + all staging)
    await admin.from('pluggy_staging_transactions')
      .delete().eq('connection_id', conn.id).eq('status', 'pending');
    await admin.from('pluggy_connections').delete().eq('id', conn.id);

    return new Response(JSON.stringify({ ok: true, scope: 'connection' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
