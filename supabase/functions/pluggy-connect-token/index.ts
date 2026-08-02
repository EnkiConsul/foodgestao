import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createConnectToken } from '../_shared/pluggy.ts';

function isAllowedOauthRedirectUri(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password || url.hash) return false;
    const allowedHosts = new Set([
      'foodgestao.lovable.app',
      'gestor360food.com',
      'www.gestor360food.com',
    ]);
    return allowedHosts.has(url.hostname)
      || url.hostname.endsWith('.lovable.app')
      || url.hostname.endsWith('.lovableproject.com');
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: cErr } = await supabase.auth.getClaims(token);
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const itemId = typeof body?.item_id === 'string' ? body.item_id : undefined;
    const companyId = typeof body?.company_id === 'string' ? body.company_id : undefined;
    const oauthRedirectUri = isAllowedOauthRedirectUri(body?.oauth_redirect_uri)
      ? body.oauth_redirect_uri
      : undefined;

    const result = await createConnectToken(itemId, {
      oauthRedirectUri,
      clientUserId: claims.claims.sub,
    });

    // Registra a intenção de conexão para permitir concluir a conexão pelo
    // webhook quando o navegador não retornar (ex.: Open Finance por QR Code).
    let connectRequestId: string | null = null;
    if (companyId) {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const userId = claims.claims.sub as string;
      const { data: mem } = await admin
        .from('company_members').select('id')
        .eq('company_id', companyId).eq('user_id', userId).maybeSingle();
      if (mem) {
        // Expira solicitações antigas do mesmo usuário/empresa
        await admin
          .from('pluggy_connect_requests')
          .update({ status: 'expired' })
          .eq('user_id', userId)
          .eq('company_id', companyId)
          .eq('status', 'open');

        const { data: reqRow, error: reqErr } = await admin
          .from('pluggy_connect_requests')
          .insert({
            company_id: companyId,
            user_id: userId,
            item_id_to_update: itemId ?? null,
            resolved_item_id: itemId ?? null,
          })
          .select('id')
          .maybeSingle();
        if (reqErr) console.error('connect_request insert failed', reqErr.message);
        connectRequestId = reqRow?.id ?? null;
      }
    }

    return new Response(JSON.stringify({ accessToken: result.accessToken, connectRequestId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('pluggy-connect-token error', e);
    return new Response(JSON.stringify({ error: 'internal_error', message: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
