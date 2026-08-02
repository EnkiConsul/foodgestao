import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { pluggyFetch } from '../_shared/pluggy.ts';

/**
 * Diagnóstico (super admin): lista os itens existentes na Pluggy e indica
 * quais já estão materializados em `pluggy_connections`. Útil quando o cliente
 * autoriza no banco (QR Code / app) e a conexão não aparece na plataforma.
 *
 * Body opcional: { client_user_id?: string, email?: string }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isSuper } = await admin.rpc('is_super_admin', { _user_id: userData.user.id });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    let clientUserId: string | null =
      typeof body?.client_user_id === 'string' ? body.client_user_id : null;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;

    // Resolve o usuário pelo e-mail, quando informado
    if (!clientUserId && email) {
      let page = 1;
      while (page <= 10 && !clientUserId) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        const found = data?.users?.find((u) => (u.email ?? '').toLowerCase() === email);
        if (found) clientUserId = found.id;
        if (!data?.users?.length || data.users.length < 1000) break;
        page += 1;
      }
    }


    const res = await pluggyFetch('/items?pageSize=200');
    if (!res.ok) {
      const detail = await res.text();
      console.error(`pluggy list items failed [${res.status}]: ${detail}`);
      return new Response(
        JSON.stringify({ error: 'pluggy_request_failed', status: res.status, details: detail }),
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const json = await res.json();
    const results: any[] = Array.isArray(json?.results) ? json.results : [];

    const filtered = clientUserId
      ? results.filter((it) => String(it?.clientUserId ?? '') === clientUserId)
      : results;

    const itemIds = filtered.map((it) => String(it?.id)).filter(Boolean);
    const { data: conns } = itemIds.length
      ? await admin
          .from('pluggy_connections')
          .select('id, company_id, pluggy_item_id, status')
          .in('pluggy_item_id', itemIds)
      : { data: [] as any[] };
    const connByItem = new Map((conns ?? []).map((c: any) => [c.pluggy_item_id, c]));

    const items = filtered.map((it) => {
      const conn = connByItem.get(String(it?.id));
      return {
        item_id: it?.id ?? null,
        connector_name: it?.connector?.name ?? null,
        connector_id: it?.connector?.id ?? null,
        status: it?.status ?? null,
        execution_status: it?.executionStatus ?? null,
        client_user_id: it?.clientUserId ?? null,
        created_at: it?.createdAt ?? null,
        updated_at: it?.updatedAt ?? null,
        error: it?.error ?? null,
        linked: !!conn,
        linked_company_id: conn?.company_id ?? null,
      };
    });

    return new Response(
      JSON.stringify({ client_user_id: clientUserId, total: results.length, items }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('pluggy-admin-find-items error', e);
    return new Response(JSON.stringify({ error: 'internal_error', message: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
