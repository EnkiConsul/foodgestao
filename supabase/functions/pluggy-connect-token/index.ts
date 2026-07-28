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
    return allowedHosts.has(url.hostname) || url.hostname.endsWith('.lovable.app');
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
    const oauthRedirectUri = isAllowedOauthRedirectUri(body?.oauth_redirect_uri)
      ? body.oauth_redirect_uri
      : undefined;

    const result = await createConnectToken(itemId, {
      oauthRedirectUri,
      clientUserId: claims.claims.sub,
    });
    return new Response(JSON.stringify({ accessToken: result.accessToken }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('pluggy-connect-token error', e);
    return new Response(JSON.stringify({ error: 'internal_error', message: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
