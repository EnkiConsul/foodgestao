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

    // A Pluggy responde 400 quando o itemId não é um UUID válido.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(itemId.trim())) {
      return new Response(JSON.stringify({
        error: 'item_id_invalid',
        message: 'O identificador da conexão (item_id) não é válido. Copie o item_id exato da Pluggy.',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If user-authenticated, verify company membership (super admins bypass)
    if (userId && companyId) {
      const { data: isSuper } = await admin
        .from('user_roles').select('role')
        .eq('user_id', userId).eq('role', 'super_admin').maybeSingle();
      if (!isSuper) {
        const { data: mem } = await admin
          .from('company_members').select('id')
          .eq('company_id', companyId).eq('user_id', userId).maybeSingle();
        if (!mem) {
          return new Response(JSON.stringify({ error: 'forbidden' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }


    // Look up existing connection (if any)
    const { data: existing } = await admin
      .from('pluggy_connections')
      .select('id, company_id')
      .eq('pluggy_item_id', itemId)
      .maybeSingle();

    // Fallback: resolve company via connect request (service-role/webhook path,
    // quando o navegador não conclui o fluxo — ex.: Open Finance por QR Code).
    let connectRequestId: string | null =
      typeof body?.connect_request_id === 'string' ? body.connect_request_id : null;

    if (!existing && !companyId) {
      // 1ª tentativa: solicitação aberta e válida
      // 2ª tentativa (tolerância): solicitação recente, mesmo expirada, nas últimas 24h
      const toleranceFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      for (const attempt of ['open', 'tolerance'] as const) {
        let q = admin
          .from('pluggy_connect_requests')
          .select('id, company_id, user_id');

        if (attempt === 'open') {
          q = q.eq('status', 'open').gt('expires_at', new Date().toISOString());
        } else {
          q = q.neq('status', 'completed').gte('created_at', toleranceFrom);
        }

        if (connectRequestId) q = q.eq('id', connectRequestId);
        else q = q.or(`resolved_item_id.eq.${itemId},resolved_item_id.is.null`);

        const { data: reqRow } = await q
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (reqRow) {
          companyId = reqRow.company_id;
          connectRequestId = reqRow.id;
          break;
        }
      }
    }

    // Último fallback: resolver a empresa pelo clientUserId gravado no item da
    // Pluggy. Cobre o caso em que nenhuma solicitação foi registrada (ex.: o
    // usuário autorizou pelo app do banco muito depois, ou o token foi criado
    // sem company_id).
    if (!existing && !companyId) {
      try {
        const probe = await getItem(itemId);
        const clientUserId: string | null = probe?.clientUserId ?? null;
        if (clientUserId) {
          const { data: memberships } = await admin
            .from('company_members')
            .select('company_id, companies!inner(id, is_active)')
            .eq('user_id', clientUserId)
            .eq('companies.is_active', true);
          if (memberships?.length === 1) {
            companyId = memberships[0].company_id;
            console.log(`resolved company via clientUserId ${clientUserId} -> ${companyId}`);
          } else {
            console.error(
              `cannot resolve company for item ${itemId}: clientUserId=${clientUserId} companies=${memberships?.length ?? 0}`,
            );
          }
        }
      } catch (e) {
        console.error('clientUserId company resolution failed', e);
      }
    }

    if (!existing && !companyId) {
      return new Response(JSON.stringify({ error: 'company_id_required_on_first_connect' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    if (connectRequestId) {
      await admin
        .from('pluggy_connect_requests')
        .update({
          resolved_item_id: itemId,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', connectRequestId);
    }

    const effectiveCompanyId = existing?.company_id ?? companyId!;

    // 1) Fetch item metadata (e, quando aplicável, dispara uma nova coleta no banco)
    let item = await getItem(itemId);
    const skipRefresh = body?.refresh === false || isFirstConnect;
    const itemStatus = String(item?.status ?? '').toUpperCase();
    const itemExec = String(item?.executionStatus ?? '').toUpperCase();
    const isRunning = itemStatus === 'UPDATING' || itemExec === 'CREATED' || itemExec === 'UPDATING';

    if (!skipRefresh && itemStatus !== 'WAITING_USER_INPUT') {
      try {
        if (!isRunning) {
          await refreshItem(itemId);
        }
        item = await waitForItem(itemId, 45000);
      } catch (e) {
        console.error('pluggy refresh failed', e);
        item = await getItem(itemId);
      }
    } else if (isRunning) {
      item = await waitForItem(itemId, 45000);
    }


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

    // Contas cuja sincronização está pausada (conta bancária local desativada).
    // A conexão continua ativa; apenas ignoramos essas contas neste ciclo.
    const { data: pausedRows } = await admin
      .from('pluggy_accounts')
      .select('pluggy_account_id')
      .eq('connection_id', conn.id)
      .not('sync_paused_at', 'is', null);
    const pausedIds = new Set((pausedRows ?? []).map((r: any) => r.pluggy_account_id));

    for (const acc of accounts) {
      if (pausedIds.has(acc.id)) continue;
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
            // Religa e remove qualquer pausa herdada de um vínculo anterior.
            await admin.from('pluggy_accounts')
              .update({
                linked_account_id: targetAccountId,
                sync_paused_at: null,
                sync_paused_reason: null,
              })
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
      if (pausedIds.has(acc.id)) continue;
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
          provider_id: (t.providerId ?? null) || null,
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

      // Dedupe pelo identificador original do banco (providerId): quando o banco
      // reprocessa um lançamento, o Pluggy emite um novo id para o MESMO
      // lançamento. Sem isso ele entraria duas vezes na conciliação.
      const providerIds = rows.map((r) => r.provider_id).filter((v): v is string => !!v);
      const byProvider = new Map<string, { id: string; status: string; pluggy_transaction_id: string }>();
      for (let i = 0; i < providerIds.length; i += 200) {
        const slice = providerIds.slice(i, i + 200);
        const { data: prev } = await admin
          .from('pluggy_staging_transactions')
          .select('id, status, provider_id, pluggy_transaction_id')
          .eq('company_id', effectiveCompanyId)
          .eq('pluggy_account_id', acc.id)
          .in('provider_id', slice)
          .neq('status', 'duplicate');
        for (const p of prev ?? []) {
          if (p.provider_id) byProvider.set(p.provider_id, p as never);
        }
      }

      const toInsert: typeof rows = [];
      for (const r of rows) {
        const prev = r.provider_id ? byProvider.get(r.provider_id) : undefined;
        if (!prev) {
          toInsert.push(r);
          continue;
        }
        if (prev.pluggy_transaction_id === r.pluggy_transaction_id) {
          // Mesma versão: só reenriquece a descrição se ainda estiver pendente.
          if (prev.status === 'pending') {
            await admin
              .from('pluggy_staging_transactions')
              .update({ description: r.description, counterparty_name: r.counterparty_name, raw: r.raw })
              .eq('id', prev.id);
          }
          continue;
        }
        if (prev.status === 'pending') {
          // Versão nova do mesmo lançamento do banco: atualiza no lugar.
          await admin
            .from('pluggy_staging_transactions')
            .update({
              pluggy_transaction_id: r.pluggy_transaction_id,
              description: r.description,
              counterparty_name: r.counterparty_name,
              amount: r.amount,
              date: r.date,
              category_pluggy: r.category_pluggy,
              type: r.type,
              raw: r.raw,
            })
            .eq('id', prev.id);
        } else {
          // Já conciliado: registra a nova versão como duplicada (fora da tela).
          await admin
            .from('pluggy_staging_transactions')
            .upsert({ ...r, status: 'duplicate' as never }, {
              onConflict: 'pluggy_transaction_id',
              ignoreDuplicates: true,
            });
        }
      }

      // Chunked upsert to avoid oversized payloads
      const chunkSize = 200;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error } = await admin
          .from('pluggy_staging_transactions')
          .upsert(chunk, { onConflict: 'pluggy_transaction_id', ignoreDuplicates: true });
        if (error) console.error('staging upsert error', error);
      }

      // Reprocessa a descrição de itens sem providerId que foram importados
      // antes com rótulo genérico (o upsert acima ignora duplicados).
      for (const r of toInsert) {
        if (r.provider_id) continue;
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
      ok: true,
      connection_id: conn.id,
      accounts: accounts.length,
      transactions: staged,
      first_connect: !!isFirstConnect,
      item_status: item?.status ?? null,
      execution_status: item?.executionStatus ?? null,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('pluggy-sync-item error', e);
    const msg = String(e);
    // Item inexistente/inválido na Pluggy não é falha do servidor.
    if (msg.includes('get_item_failed: 400') || msg.includes('get_item_failed: 404')) {
      return new Response(JSON.stringify({
        error: 'item_not_found_in_pluggy',
        message: 'A Pluggy não reconhece este item_id com as credenciais atuais (produção). Verifique se o item foi criado neste ambiente.',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'sync_failed', message: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
