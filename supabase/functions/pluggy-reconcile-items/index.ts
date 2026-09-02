// Reconciliação de conexões Open Finance "órfãs".
//
// Quando o widget da Pluggy não devolve o item ao navegador (autorização por
// QR Code / app do banco, mais de um banco na mesma sessão, aba fechada) e o
// webhook não chega, o item existe na Pluggy mas nunca é materializado aqui.
// Esta função procura esses itens e importa os que pertencem à empresa.
//
// Correlação: o token de conexão grava `clientUserId = ofreq:<connect_request_id>`,
// e a solicitação guarda a empresa. Só importamos itens correlacionados a uma
// solicitação da própria empresa (nunca confiamos em company_id do payload).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getItem, listItemsV2 } from '../_shared/pluggy.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOOKBACK_HOURS = 72;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const anon = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await anon.auth.getClaims(authHeader.replace('Bearer ', ''));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return json({ error: 'unauthorized' }, 401);

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const companyId = typeof body?.company_id === 'string' ? body.company_id : null;
    if (!companyId || !UUID_RE.test(companyId)) return json({ error: 'company_id_required' }, 400);

    // Autorização: membro, dono ou super admin.
    const [{ data: isSuper }, { data: mem }, { data: owned }] = await Promise.all([
      admin.from('user_roles').select('role').eq('user_id', userId).eq('role', 'super_admin').maybeSingle(),
      admin.from('company_members').select('id').eq('company_id', companyId).eq('user_id', userId).maybeSingle(),
      admin.from('companies').select('id').eq('id', companyId).eq('user_id', userId).maybeSingle(),
    ]);
    if (!isSuper && !mem && !owned) return json({ error: 'forbidden' }, 403);

    // Solicitações recentes desta empresa: são as chaves de correlação válidas.
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString();
    const { data: requests } = await admin
      .from('pluggy_connect_requests')
      .select('id, user_id, resolved_item_id, created_at')
      .eq('company_id', companyId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);

    const requestIds = (requests ?? []).map((r) => r.id as string);
    const allowedClientUserIds = new Set<string>([
      ...requestIds.map((id) => `ofreq:${id}`),
      ...new Set((requests ?? []).map((r) => r.user_id as string)),
    ]);

    // Itens já conhecidos localmente (qualquer empresa) — não reimportar.
    const { data: knownConns } = await admin
      .from('pluggy_connections')
      .select('pluggy_item_id, company_id, status');
    const known = new Map(
      (knownConns ?? []).map((c) => [c.pluggy_item_id as string, c as Record<string, unknown>]),
    );

    // 1. Candidatos: listagem por cursor filtrada por clientUserId de cada
    //    solicitação (endpoint opt-in na Pluggy) + item já resolvido na linha.
    const candidates = new Map<string, any>();
    let listUnavailable: { http_status: number; error?: string } | null = null;

    for (const clientUserId of allowedClientUserIds) {
      let after: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const res = await listItemsV2({ clientUserId, after });
        if (!res.ok) {
          if (res.httpStatus === 401 || res.httpStatus === 403 || res.httpStatus === 404) {
            listUnavailable = { http_status: res.httpStatus, error: res.error };
          } else {
            console.error('list_items_v2_failed', res.httpStatus, res.error);
          }
          break;
        }
        for (const it of res.results) {
          if (it?.id) candidates.set(it.id, it);
        }
        if (!res.next) break;
        after = res.next;
      }
      if (listUnavailable) break;
    }

    // 2. Caminho alternativo: itens já apontados pelas solicitações + eventos de
    //    webhook recentes (cobre o caso da listagem não estar habilitada).
    const fallbackIds = new Set<string>();
    for (const r of requests ?? []) {
      if (r.resolved_item_id) fallbackIds.add(r.resolved_item_id as string);
    }
    const { data: events } = await admin
      .from('pluggy_webhook_events')
      .select('pluggy_item_id')
      .not('pluggy_item_id', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100);
    for (const e of events ?? []) fallbackIds.add(e.pluggy_item_id as string);

    for (const id of fallbackIds) {
      if (candidates.has(id)) continue;
      try {
        candidates.set(id, await getItem(id));
      } catch (e) {
        console.warn('reconcile: get_item failed', id, String(e).slice(0, 160));
      }
    }

    // 3. Importa os itens correlacionados a esta empresa e ainda não conhecidos.
    const imported: Array<Record<string, unknown>> = [];
    const skipped: Array<Record<string, unknown>> = [];

    for (const [itemId, item] of candidates) {
      const clientUserId = (item?.clientUserId as string | undefined) ?? null;
      const connectorName = item?.connector?.name ?? null;
      const existing = known.get(itemId);

      if (existing && existing.status !== 'deleted') {
        skipped.push({ item_id: itemId, connector_name: connectorName, reason: 'already_linked' });
        continue;
      }
      if (!clientUserId || !allowedClientUserIds.has(clientUserId)) {
        skipped.push({ item_id: itemId, connector_name: connectorName, reason: 'other_company' });
        continue;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/pluggy-sync-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({
          item_id: itemId,
          company_id: companyId,
          first_connect: true,
        }),
      });
      const detail = await res.text();
      if (!res.ok) {
        console.error('reconcile: sync failed', itemId, res.status, detail.slice(0, 300));
        skipped.push({
          item_id: itemId,
          connector_name: connectorName,
          reason: 'sync_failed',
          http_status: res.status,
          detail: detail.slice(0, 300),
        });
        continue;
      }
      let parsed: any = null;
      try { parsed = JSON.parse(detail); } catch { /* resposta não-JSON */ }
      imported.push({
        item_id: itemId,
        connector_name: connectorName,
        accounts: parsed?.accounts ?? null,
        transactions: parsed?.transactions ?? null,
      });
    }

    return json({
      ok: true,
      company_id: companyId,
      checked: candidates.size,
      imported,
      skipped,
      list_unavailable: listUnavailable,
    });
  } catch (e) {
    console.error('pluggy-reconcile-items error', e);
    return json({ error: 'internal_error', message: String(e).slice(0, 300) }, 500);
  }
});
