import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getItem, listAccounts, listTransactions, refreshItem, waitForItem } from '../_shared/pluggy.ts';
import { buildDescription, counterpartyName } from '../_shared/tx-description.ts';


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    let companyId: string | null = null;

    // If called from user, require JWT + explicit company_id in body
    if (authHeader?.startsWith('Bearer ')) {
      const anon = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace('Bearer ', '');
      const { data: claims } = await anon.auth.getClaims(token);
      userId = claims?.claims?.sub ?? null;
    }

    const body = await req.json().catch(() => ({}));
    const itemId: string | undefined = body?.item_id;
    companyId = body?.company_id ?? null;
    const isFirstConnect = body?.first_connect === true;

    if (!itemId) {
      return new Response(JSON.stringify({ error: 'item_id_required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If user-authenticated, verify company membership
    if (userId && companyId) {
      const { data: mem } = await admin
        .from('company_members').select('id')
        .eq('company_id', companyId).eq('user_id', userId).maybeSingle();
      if (!mem) {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Look up existing connection (if any)
    const { data: existing } = await admin
      .from('pluggy_connections')
      .select('id, company_id')
      .eq('pluggy_item_id', itemId)
      .maybeSingle();

    if (!existing && !companyId) {
      return new Response(JSON.stringify({ error: 'company_id_required_on_first_connect' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const effectiveCompanyId = existing?.company_id ?? companyId!;

    // 1) Fetch item metadata
    const item = await getItem(itemId);

    const connectionPayload = {
      company_id: effectiveCompanyId,
      pluggy_item_id: itemId,
      connector_id: item?.connector?.id ?? null,
      connector_name: item?.connector?.name ?? null,
      connector_image_url: item?.connector?.imageUrl ?? null,
      status: (item?.status ?? 'updated').toLowerCase(),
      execution_status: item?.executionStatus ?? null,
      last_synced_at: new Date().toISOString(),
      last_error: item?.error ?? null,
      created_by: userId,
    };

    const { data: conn, error: connErr } = await admin
      .from('pluggy_connections')
      .upsert(connectionPayload, { onConflict: 'pluggy_item_id' })
      .select('id')
      .single();
    if (connErr) throw connErr;

    // 2) Accounts — mirror to pluggy_accounts and auto-materialize local `accounts` for BANK type
    const accounts = await listAccounts(itemId);
    const connectorName: string = (item?.connector?.name ?? '').toLowerCase();
    let bankSlug: string | null = null;
    if (connectorName) {
      const { data: bankRows } = await admin.from('banks').select('slug, name').eq('is_active', true);
      const match = (bankRows ?? []).find((b: any) =>
        connectorName.includes(String(b.slug).toLowerCase()) ||
        connectorName.includes(String(b.name).toLowerCase()),
      );
      bankSlug = match?.slug ?? null;
    }

    for (const acc of accounts) {
      const { data: upserted } = await admin.from('pluggy_accounts').upsert({
        connection_id: conn.id,
        company_id: effectiveCompanyId,
        pluggy_account_id: acc.id,
        type: acc.type ?? null,
        subtype: acc.subtype ?? null,
        name: acc.name ?? acc.marketingName ?? null,
        number_masked: acc.number ?? null,
        balance: acc.balance ?? null,
        currency_code: acc.currencyCode ?? 'BRL',
        raw: acc,
      }, { onConflict: 'pluggy_account_id' })
        .select('id, linked_account_id')
        .single();

      if (upserted && !upserted.linked_account_id && (acc.type ?? '').toUpperCase() === 'BANK') {
        const ownerUserId = userId ?? (await admin
          .from('pluggy_connections').select('created_by').eq('id', conn.id).maybeSingle()).data?.created_by;
        if (ownerUserId) {
          // Dedup: 1) check if another pluggy_account in the same company already links to a local account
          //        matching this connector (bank_slug + account_number). Reuse that link.
          let existingAccountId: string | null = null;
          const accNumber = acc.number ?? null;

          // 1a) Prior pluggy_accounts row already linked (e.g., previous connection for the same bank/number)
          const { data: priorLinked } = await admin
            .from('pluggy_accounts')
            .select('linked_account_id')
            .eq('company_id', effectiveCompanyId)
            .eq('number_masked', accNumber)
            .not('linked_account_id', 'is', null)
            .limit(1)
            .maybeSingle();
          if (priorLinked?.linked_account_id) existingAccountId = priorLinked.linked_account_id;

          // 1b) Local accounts table match by company + bank_slug + account_number
          if (!existingAccountId && (bankSlug || accNumber)) {
            let q = admin.from('accounts').select('id').eq('company_id', effectiveCompanyId).eq('is_active', true);
            if (bankSlug) q = q.eq('bank_slug', bankSlug);
            if (accNumber) q = q.eq('account_number', accNumber);
            const { data: match } = await q.limit(1).maybeSingle();
            if (match?.id) existingAccountId = match.id;
          }

          let targetAccountId = existingAccountId;
          const ofBalance = typeof acc.balance === 'number' ? acc.balance : null;
          if (!targetAccountId) {
            const { data: newAcc } = await admin.from('accounts').insert({
              user_id: ownerUserId,
              company_id: effectiveCompanyId,
              name: acc.name ?? acc.marketingName ?? item?.connector?.name ?? 'Conta bancária',
              account_type: 'corrente',
              context: 'pj',
              initial_balance: ofBalance ?? 0,
              current_balance: ofBalance ?? 0,
              color: '#1B3A5C',
              icon: 'wallet',
              is_active: true,
              bank_slug: bankSlug,
              account_number: accNumber,
            }).select('id').single();
            targetAccountId = newAcc?.id ?? null;
          } else if (ofBalance !== null) {
            // Atualiza o saldo da conta local a partir do saldo reportado pelo Open Finance.
            // Usa RPC que habilita a flag do motor financeiro para contornar o guard.
            await admin.rpc('sync_of_account_balance', {
              _account_id: targetAccountId,
              _new_balance: ofBalance,
            });
          }

          if (targetAccountId) {
            await admin.from('pluggy_accounts')
              .update({ linked_account_id: targetAccountId })
              .eq('id', upserted.id);
          }
        }
      }
    }

    // 3) Transactions — últimos 30 dias
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    let staged = 0;
    for (const acc of accounts) {
      const txs = await listTransactions(acc.id, fmt(from), fmt(to));
      if (txs.length === 0) continue;
      const rows = txs.map((t: any) => {
        const amt = Number(t.amount ?? 0);
        const counterparty = counterpartyName(t);
        const description = buildDescription(t);

        return {
          company_id: effectiveCompanyId,
          connection_id: conn.id,
          pluggy_account_id: acc.id,
          pluggy_transaction_id: t.id,
          date: (t.date ?? t.transactionDate ?? '').slice(0, 10),
          description,
          counterparty_name: counterparty,
          amount: t.amount ?? 0,
          currency_code: t.currencyCode ?? 'BRL',
          category_pluggy: t.category ?? null,
          type: t.type ?? (amt >= 0 ? 'CREDIT' : 'DEBIT'),
          raw: t,
          status: 'pending' as const,
        };
      });

      // Chunked upsert to avoid oversized payloads
      const chunkSize = 200;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await admin
          .from('pluggy_staging_transactions')
          .upsert(chunk, { onConflict: 'pluggy_transaction_id', ignoreDuplicates: true });
        if (error) console.error('staging upsert error', error);
      }

      // Reprocessa a descrição de itens ainda pendentes que foram importados
      // antes com rótulo genérico (o upsert acima ignora duplicados).
      for (const r of rows) {
        const { error } = await admin
          .from('pluggy_staging_transactions')
          .update({ description: r.description, counterparty_name: r.counterparty_name })
          .eq('pluggy_transaction_id', r.pluggy_transaction_id)
          .eq('status', 'pending')
          .neq('description', r.description);
        if (error) console.error('staging re-enrich error', error);
      }
      staged += rows.length;

    }

    return new Response(JSON.stringify({
      ok: true, connection_id: conn.id, accounts: accounts.length, transactions: staged, first_connect: !!isFirstConnect,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('pluggy-sync-item error', e);
    return new Response(JSON.stringify({ error: 'sync_failed', message: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
