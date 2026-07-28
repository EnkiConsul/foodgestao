import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getItem, listAccounts, listTransactions } from '../_shared/pluggy.ts';

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
          const { data: newAcc } = await admin.from('accounts').insert({
            user_id: ownerUserId,
            company_id: effectiveCompanyId,
            name: acc.name ?? acc.marketingName ?? item?.connector?.name ?? 'Conta bancária',
            account_type: 'corrente',
            context: 'pj',
            initial_balance: 0,
            current_balance: 0,
            color: '#1B3A5C',
            icon: 'wallet',
            is_active: true,
            bank_slug: bankSlug,
            account_number: acc.number ?? null,
          }).select('id').single();
          if (newAcc?.id) {
            await admin.from('pluggy_accounts')
              .update({ linked_account_id: newAcc.id })
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
        const rawDesc: string = t.description ?? t.descriptionRaw ?? '';
        const amt = Number(t.amount ?? 0);
        const pd = t.paymentData ?? null;
        const receiverName: string | null = pd?.receiver?.name ?? null;
        const payerName: string | null = pd?.payer?.name ?? null;
        const method: string | null = pd?.paymentMethod ?? null;
        const counterparty = amt < 0 ? receiverName : payerName;

        // If bank returned a generic label, rewrite using paymentData counterparty
        const generic = /^\s*(transf(er[eê]ncia)?\s+(enviada|recebida)\s+pix|pix\s+(enviado|recebido)|ted|doc)\b/i;
        let description = rawDesc;
        if (counterparty && (generic.test(rawDesc) || !rawDesc.trim())) {
          const verb = amt < 0 ? 'enviado para' : 'recebido de';
          const label = method === 'PIX' || /pix/i.test(rawDesc) ? 'Pix' : (method ? method : 'Transferência');
          description = `${label} ${verb} ${counterparty}`;
        }

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
