import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Chamada após a desativação de uma conta bancária local.
// Apenas garante que a conta vinculada fique com a sincronização pausada.
// A conexão na Pluggy é preservada (nada é excluído no provedor).
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

    // Desativar a conta NUNCA remove a conexão na Pluggy: garantimos apenas
    // que a conta local vinculada esteja com a sincronização pausada.
    await admin.from('pluggy_accounts')
      .update({ sync_paused_at: new Date().toISOString(), sync_paused_reason: 'account_inactive' })
      .eq('id', ofAcc.id)
      .is('sync_paused_at', null);

    return json({ ok: true, scope: 'paused' });
  } catch (e) {
    return json({ error: String(e) }, 400);
  }
});
