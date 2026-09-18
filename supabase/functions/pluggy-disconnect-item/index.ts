import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { deleteItem } from '../_shared/pluggy.ts';

// Três operações distintas sobre uma conexão Open Finance:
//  - mode 'pause'  : pausa as coletas automáticas (consentimento preservado)
//  - mode 'resume' : retoma as coletas
//  - mode 'revoke' : revoga o consentimento (DELETE /items na Pluggy) e marca a
//                    conexão como desconectada, PRESERVANDO histórico e registros.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
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
    const connection_id = body?.connection_id as string | undefined;
    const pluggy_account_id = body?.pluggy_account_id as string | undefined;
    const mode = (typeof body?.mode === 'string' ? body.mode : 'revoke') as 'pause' | 'resume' | 'revoke';
    if (!connection_id) throw new Error('connection_id_required');
    if (!['pause', 'resume', 'revoke'].includes(mode)) throw new Error('invalid_mode');

    const { data: conn } = await admin
      .from('pluggy_connections')
      .select('id, company_id, pluggy_item_id, connector_name, status')
      .eq('id', connection_id)
      .maybeSingle();
    if (!conn) throw new Error('connection_not_found');

    // Pausar, retomar ou revogar altera a origem dos lançamentos: exige dono ou
    // permissão de edição, não apenas participação na empresa.
    const { data: canEdit } = await admin.rpc('pluggy_user_can_manage_accounts', {
      _user_id: userId,
      _company_id: conn.company_id,
    });
    if (canEdit !== true) throw new Error('forbidden');

    const audit = async (action: string, details: Record<string, unknown>) => {
      try {
        await admin.rpc('insert_audit_log', {
          _action: action,
          _entity_type: 'pluggy_connection',
          _entity_id: conn.id,
          _details: {
            company_id: conn.company_id,
            connector_name: conn.connector_name,
            pluggy_item_id: conn.pluggy_item_id,
            actor: userId,
            ...details,
          },
        });
      } catch (e) {
        console.warn('audit log falhou (continuando):', e);
      }
    };

    // --- Pausar / retomar: nada é enviado à Pluggy ---------------------------
    if (mode === 'pause' || mode === 'resume') {
      const patch = mode === 'pause'
        ? { sync_paused_at: new Date().toISOString(), sync_paused_reason: 'user_paused' }
        : { sync_paused_at: null, sync_paused_reason: null };
      const { error } = await admin.from('pluggy_accounts')
        .update(patch).eq('connection_id', conn.id);
      if (error) throw new Error(`pause_failed: ${error.message}`);
      await admin.from('pluggy_connections')
        .update({ last_sync_status: mode === 'pause' ? 'user_paused' : null })
        .eq('id', conn.id);
      await audit(mode === 'pause' ? 'pluggy_connection_paused' : 'pluggy_connection_resumed', {});
      return json({ ok: true, scope: mode });
    }

    // --- Revogar: remoção pontual de conta quando o banco segue em uso ------
    // "Em uso" = conta Open Finance vinculada a uma conta financeira ou a um
    // cartão do sistema. Contas órfãs/pendentes não seguram a conexão.
    if (pluggy_account_id) {
      const [{ data: emUso }, { data: pAcc }] = await Promise.all([
        admin.from('pluggy_accounts')
          .select('id')
          .eq('connection_id', conn.id)
          .neq('id', pluggy_account_id)
          .or('linked_account_id.not.is.null,linked_credit_card_id.not.is.null'),
        // A conta precisa pertencer a ESTA conexão autorizada — sem isso seria
        // possível apagar a conta Open Finance de outra empresa.
        admin.from('pluggy_accounts').select('id, pluggy_account_id')
          .eq('id', pluggy_account_id)
          .eq('connection_id', conn.id)
          .maybeSingle(),
      ]);
      if (pluggy_account_id && !pAcc) throw new Error('account_not_in_connection');
      if ((emUso?.length ?? 0) > 0 && pAcc) {
        await admin.from('pluggy_staging_transactions')
          .delete().eq('connection_id', conn.id)
          .eq('pluggy_account_id', pAcc.pluggy_account_id).eq('status', 'pending');
        await admin.from('pluggy_accounts').delete().eq('id', pAcc.id);
        await audit('pluggy_account_unlinked', { pluggy_account_id });
        return json({ ok: true, scope: 'account' });
      }
    }

    // --- Revogação do consentimento ----------------------------------------
    let providerDeleteStatus = 'ok';
    try {
      await deleteItem(conn.pluggy_item_id);
    } catch (e) {
      providerDeleteStatus = `failed: ${String(e).slice(0, 200)}`;
      console.warn('pluggy deleteItem failed (revogacao local segue):', e);
    }

    const nowIso = new Date().toISOString();
    // A conexão NÃO é apagada: fica marcada como desconectada, preservando
    // contas espelhadas, staging, conciliações e histórico financeiro.
    const { error: updErr } = await admin.from('pluggy_connections')
      .update({
        status: 'revoked',
        revoked_at: nowIso,
        revoked_by: userId,
        revoke_reason: typeof body?.reason === 'string' ? body.reason.slice(0, 300) : 'user_revoked',
        provider_delete_status: providerDeleteStatus,
        last_sync_status: 'revoked',
        last_sync_error: null,
      })
      .eq('id', conn.id);
    if (updErr) throw new Error(`revoke_failed: ${updErr.message}`);

    // Sem consentimento, nenhuma conta pode voltar a sincronizar.
    await admin.from('pluggy_accounts')
      .update({ sync_paused_at: nowIso, sync_paused_reason: 'connection_revoked' })
      .eq('connection_id', conn.id);

    await audit('pluggy_connection_revoked', { provider_delete_status: providerDeleteStatus });

    // A sincronização parou aqui, mas se o banco não confirmou o cancelamento do
    // consentimento a revogação está PENDENTE — não pode ser anunciada como
    // concluída.
    const revogacaoPendente = providerDeleteStatus !== 'ok';
    return json({
      ok: !revogacaoPendente,
      scope: 'connection',
      provider_delete_status: providerDeleteStatus,
      revocation_pending: revogacaoPendente,
      message: revogacaoPendente
        ? 'A sincronização foi interrompida, mas o banco ainda não confirmou o cancelamento da autorização. Tente novamente ou cancele também no aplicativo do banco.'
        : 'Autorização cancelada.',
    }, revogacaoPendente ? 202 : 200);
  } catch (e) {
    const msg = String(e);
    const status = msg.includes('forbidden') ? 403 : 400;
    return json({ error: msg }, status);
  }
});
