import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getItem, listAccounts, listTransactions, refreshItem, waitForItem } from '../_shared/pluggy.ts';
import { buildDescription, counterpartyName } from '../_shared/tx-description.ts';
import { extractCounterpartyDocument } from '../_shared/counterparty-doc.ts';
import { materializePluggyItemV2 } from '../_shared/pluggy-v2-materialize.ts';



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
    let itemId: string | undefined = body?.item_id;
    companyId = body?.company_id ?? null;
    const isFirstConnect = body?.first_connect === true;

    // Verificação manual após consentimento no app do banco. Alguns fluxos de
    // Open Finance não retornam ao Connect e o webhook pode chegar sem ter sido
    // correlacionado à solicitação. Nesse caso, localizamos entre os eventos
    // recentes o Item cujo clientUserId pertence ao usuário desta solicitação.
    const requestedConnectRequestId =
      typeof body?.connect_request_id === 'string' ? body.connect_request_id : null;
    if (!itemId && requestedConnectRequestId && userId) {
      const { data: requestRow } = await admin
        .from('pluggy_connect_requests')
        .select('id, company_id, user_id, resolved_item_id, created_at')
        .eq('id', requestedConnectRequestId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!requestRow) {
        return new Response(JSON.stringify({ error: 'connect_request_not_found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      companyId = requestRow.company_id;
      itemId = requestRow.resolved_item_id ?? undefined;

      if (!itemId) {
        const { data: events } = await admin
          .from('pluggy_webhook_events')
          .select('pluggy_item_id')
          .not('pluggy_item_id', 'is', null)
          .gte('created_at', requestRow.created_at)
          .order('created_at', { ascending: false })
          .limit(50);

        const candidates = [...new Set((events ?? [])
          .map((event) => event.pluggy_item_id as string | null)
          .filter((id): id is string => Boolean(id)))];

        for (const candidate of candidates) {
          try {
            const candidateItem = await getItem(candidate);
            if (candidateItem?.clientUserId === userId) {
              itemId = candidate;
              break;
            }
          } catch {
            // Um evento antigo/inválido não deve impedir a busca dos demais.
          }
        }
      }
    }

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
    let connectRequestId: string | null = requestedConnectRequestId;

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
          const candidates = new Set<string>();
          const { data: memberships } = await admin
            .from('company_members')
            .select('company_id, companies!inner(id, is_active)')
            .eq('user_id', clientUserId)
            .eq('companies.is_active', true);
          for (const m of memberships ?? []) candidates.add(m.company_id as string);

          // Donos podem não ter linha em company_members.
          const { data: owned } = await admin
            .from('companies')
            .select('id')
            .eq('user_id', clientUserId)
            .eq('is_active', true);
          for (const c of owned ?? []) candidates.add(c.id as string);

          if (candidates.size === 1) {
            companyId = [...candidates][0];
            console.log(`resolved company via clientUserId ${clientUserId} -> ${companyId}`);
          } else {
            console.error(
              `cannot resolve company for item ${itemId}: clientUserId=${clientUserId} companies=${candidates.size}`,
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


    const effectiveCompanyId = existing?.company_id ?? companyId;
    if (!effectiveCompanyId) {
      return new Response(JSON.stringify({ error: 'company_id_required_on_first_connect' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Fetch item metadata (e, quando aplicável, dispara uma nova coleta no banco)
    let item;
    try {
      item = await getItem(itemId);
    } catch (error) {
      const message = String(error);
      if (connectRequestId && (message.includes('get_item_failed: 400') || message.includes('get_item_failed: 404'))) {
        await admin
          .from('pluggy_connect_requests')
            .update({ status: 'error', last_error: 'item_not_found_in_production' })
          .eq('id', connectRequestId);
      }
      throw error;
    }

    // Só conclui a solicitação depois que a Pluggy confirmou que o item existe
    // no ambiente atual. Isso evita persistir IDs antigos de sandbox como se a
    // conexão em produção tivesse sido concluída.
    if (connectRequestId) {
      await admin
        .from('pluggy_connect_requests')
        .update({
          resolved_item_id: itemId,
          status: 'completed',
          completed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', connectRequestId);
    }
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
    // Documentos da própria empresa (titulares das contas conectadas): nunca
    // devem ser tratados como contraparte do lançamento.
    const ownDocuments = (accounts as any[])
      .map((a) => a?.taxNumber ?? a?.owner?.taxNumber ?? null)
      .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);

    // Nome/razão social e CNPJ cadastrados: em créditos o Pluggy às vezes
    // devolve a própria empresa como `merchant`.
    const ownNames: string[] = [];
    try {
      const { data: ownCompany } = await admin
        .from('companies')
        .select('name, trade_name, cnpj')
        .eq('id', effectiveCompanyId)
        .maybeSingle();
      if (ownCompany?.name) ownNames.push(ownCompany.name);
      if (ownCompany?.trade_name) ownNames.push(ownCompany.trade_name);
      if (ownCompany?.cnpj) ownDocuments.push(ownCompany.cnpj);
    } catch (_e) { /* opcional */ }

    const enrichOptions = { ownDocuments, ownNames };

    for (const acc of accounts) {
      if (pausedIds.has(acc.id)) continue;
      const txs = await listTransactions(acc.id, fmt(from), fmt(to));
      if (txs.length === 0) continue;
      const rows = txs.map((t: any) => {
        const amt = Number(t.amount ?? 0);
        const counterparty = counterpartyName(t, enrichOptions);
        const description = buildDescription(t, enrichOptions);
        const doc = extractCounterpartyDocument(t, ownDocuments);


        return {
          company_id: effectiveCompanyId,
          connection_id: conn.id,
          pluggy_account_id: acc.id,
          pluggy_transaction_id: t.id,
          provider_id: (t.providerId ?? null) || null,
          date: (t.date ?? t.transactionDate ?? '').slice(0, 10),
          description,
          counterparty_name: counterparty,
          counterparty_document: doc.document,
          counterparty_document_type: doc.documentType,
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
              .update({
                description: r.description,
                counterparty_name: r.counterparty_name,
                counterparty_document: r.counterparty_document,
                counterparty_document_type: r.counterparty_document_type,
                raw: r.raw,
              })
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
              counterparty_document: r.counterparty_document,
              counterparty_document_type: r.counterparty_document_type,
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
          .update({
            description: r.description,
            counterparty_name: r.counterparty_name,
            counterparty_document: r.counterparty_document,
            counterparty_document_type: r.counterparty_document_type,
          })
          .eq('pluggy_transaction_id', r.pluggy_transaction_id)
          .eq('status', 'pending')
          .neq('description', r.description);
        if (error) console.error('staging re-enrich error', error);
      }
      staged += rows.length;

    }

    // Materialização V2: mantém cópia persistente e imutável de contas + lançamentos
    // em pluggy_v2_*. Falhas aqui não quebram a sincronização V1, apenas são logadas.
    try {
      const v2Result = await materializePluggyItemV2({
        supabase: admin,
        pluggyItemId: itemId,
        companyId: effectiveCompanyId,
        createdBy: userId,
        triggerSource: userId ? 'manual' : 'webhook',
        sourceWebhookEventId: null,
        fullSync: isFirstConnect,
      });
      console.log('pluggy-v2 materialized', {
        itemId,
        companyId: effectiveCompanyId,
        accounts: v2Result.accountsSynced,
        transactions: v2Result.transactionsIngested,
      });
    } catch (v2Err) {
      console.error('pluggy-v2 materialization failed (non-fatal)', {
        itemId,
        error: v2Err instanceof Error ? v2Err.message : String(v2Err),
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      item_id: itemId,
      connection_id: conn.id,
      accounts: accounts.length,
      transactions: staged,
      v2_materialized: true,
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
        message: 'Esta conexão não existe no ambiente de produção. Inicie uma nova conexão Open Finance; IDs antigos de sandbox não podem ser vinculados.',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'sync_failed', message: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
