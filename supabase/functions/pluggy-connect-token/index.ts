import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createConnectToken, pluggyFetch } from '../_shared/pluggy.ts';

function isAllowedOauthRedirectUri(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password || url.hash) return false;
    const allowedHosts = new Set([
      'foodgestao.lovable.app',
      'aveto360.com',
      'www.aveto360.com',
    ]);
    return allowedHosts.has(url.hostname)
      || url.hostname.endsWith('.lovable.app')
      || url.hostname.endsWith('.lovableproject.com');
  } catch {
    return false;
  }
}

/**
 * Lista os connectorIds elegíveis: apenas conectores Open Finance **regulados**
 * (autorização no app/site do banco), excluindo conexões diretas por credencial
 * e conectores que exigem credenciais de aplicação (Client Id/Secret, chave
 * privada e certificado digital) — ex.: "Inter Empresas".
 */
async function listFriendlyConnectorIds(): Promise<number[] | undefined> {
  try {
    const res = await pluggyFetch('/connectors?countries=BR&sandbox=false');
    if (!res.ok) return undefined;
    const data = await res.json();
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) return undefined;

    const blockedField = (c: any) => {
      const label = `${c?.label ?? ''} ${c?.name ?? ''}`.toLowerCase();
      const type = String(c?.type ?? '').toLowerCase();
      return type === 'file'
        || /certificad|certificate|private\s*key|chave\s*privada|client\s*(id|secret)/.test(label);
    };

    const friendly = results.filter((c) => {
      const creds: any[] = Array.isArray(c?.credentials) ? c.credentials : [];
      return !creds.some(blockedField);
    });

    // Pluggy marca conectores regulados (Open Finance) com isOpenFinance/oauth.
    const regulated = friendly.filter((c) => c?.isOpenFinance === true || c?.oauth === true);

    // Fallback seguro: se a flag não vier no payload, não zera a lista.
    const chosen = regulated.length ? regulated : friendly;

    const ids = chosen
      .map((c) => Number(c?.id))
      .filter((id) => Number.isFinite(id));

    console.log('connectors filter', {
      total: results.length,
      friendly: friendly.length,
      regulated: regulated.length,
      returned: ids.length,
      fallback: regulated.length === 0,
    });

    return ids.length ? ids : undefined;
  } catch (e) {
    console.error('listFriendlyConnectorIds failed', e);
    return undefined;
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
    // `probe: true` é usado apenas pelo painel admin para validar credenciais
    // (não abre o widget, portanto não precisa de empresa).
    const isProbe = body?.probe === true;
    const oauthRedirectUri = isAllowedOauthRedirectUri(body?.oauth_redirect_uri)
      ? body.oauth_redirect_uri
      : undefined;

    // Sem company_id não há como vincular o item quando a autorização termina
    // fora do navegador (Open Finance por QR Code). Recusamos o token para
    // evitar conexões órfãs, em vez de apenas logar o problema.
    if (!companyId && !isProbe) {
      console.error('connect_token_without_company_id', { user: claims.claims.sub });
      return new Response(JSON.stringify({
        error: 'company_id_required',
        message: 'Selecione a empresa antes de iniciar a conexão Open Finance.',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Registra a intenção de conexão para permitir concluir a conexão pelo
    // webhook quando o navegador não retornar (ex.: Open Finance por QR Code).
    let connectRequestId: string | null = null;
    let clientUserId = claims.claims.sub as string;
    if (!companyId) {
      // Apenas o probe do painel admin chega aqui.
    } else {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const userId = claims.claims.sub as string;
      const { data: mem } = await admin
        .from('company_members').select('id')
        .eq('company_id', companyId).eq('user_id', userId).maybeSingle();
      let allowed = !!mem;
      if (!allowed) {
        // Donos da empresa podem não ter linha em company_members.
        const { data: owned } = await admin
          .from('companies').select('id')
          .eq('id', companyId).eq('user_id', userId).maybeSingle();
        allowed = !!owned;
      }
      if (!allowed) {
        console.error('connect_token_company_not_member', { user: userId, companyId });
        return new Response(JSON.stringify({
          error: 'forbidden',
          message: 'Você não tem acesso a esta empresa.',
        }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
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
            // Fluxos de Open Finance por QR Code/app do banco podem levar
            // horas até a autorização final; 1h era curto demais.
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
          .select('id')
          .maybeSingle();
        if (reqErr || !reqRow?.id) {
          console.error('connect_request insert failed', reqErr?.message ?? 'missing id');
          return new Response(JSON.stringify({
            error: 'connect_request_failed',
            message: 'Não foi possível registrar a solicitação de conexão. Tente novamente.',
          }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        connectRequestId = reqRow?.id ?? null;
        // Usa o ID da solicitação como correlação nativa na Pluggy. Assim, se o
        // usuário concluir no app do banco e o widget não voltar ao navegador, o
        // backend consegue identificar exatamente qual autorização terminou.
        clientUserId = `ofreq:${connectRequestId}`;
      }
    }

    let result: { accessToken: string };
    try {
      result = await createConnectToken(itemId, {
        oauthRedirectUri,
        clientUserId,
      });
    } catch (e) {
      if (connectRequestId) {
        const admin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        await admin
          .from('pluggy_connect_requests')
          .update({ status: 'error', last_error: String(e).slice(0, 500) })
          .eq('id', connectRequestId);
      }
      throw e;
    }


    const connectorIds = itemId ? undefined : await listFriendlyConnectorIds();

    return new Response(JSON.stringify({ accessToken: result.accessToken, connectRequestId, connectorIds }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('pluggy-connect-token error', e);
    return new Response(JSON.stringify({ error: 'internal_error', message: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
