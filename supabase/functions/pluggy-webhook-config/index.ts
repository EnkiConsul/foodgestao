import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  createWebhook,
  listWebhooks,
  updateWebhook,
  type PluggyWebhook,
} from '../_shared/pluggy-client.ts';

/**
 * Configuração do webhook da Pluggy — somente super_admin.
 *
 * SEGURANÇA: o segredo do webhook NUNCA é devolvido ao cliente nem embutido na
 * URL (query string vaza em logs de acesso, histórico e referer). Ele é
 * registrado na Pluggy como cabeçalho `x-webhook-secret`, conforme
 * https://docs.pluggy.ai/docs/webhooks#webhook-headers.
 *
 * GET  -> diagnóstico: URL base, se o segredo está configurado e se o webhook
 *         registrado na Pluggy já usa o cabeçalho correto.
 * POST -> cria/atualiza o webhook "all" na Pluggy com o cabeçalho do segredo.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims) return json({ error: 'unauthorized' }, 401);

  const userId = claims.claims.sub as string;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: isSuper } = await admin.rpc('has_role', { _user_id: userId, _role: 'super_admin' });
  if (!isSuper) return json({ error: 'forbidden' }, 403);

  const secret = Deno.env.get('PLUGGY_WEBHOOK_SECRET') ?? '';
  if (!secret) return json({ error: 'secret_not_configured' }, 500);

  const baseUrl = `${supabaseUrl}/functions/v1/pluggy-webhook`;
  const HEADER = 'x-webhook-secret';

  const describe = (hook: PluggyWebhook) => ({
    id: hook.id,
    url: hook.url,
    event: hook.event,
    disabled: !!hook.disabledAt,
    // Nunca devolvemos o valor do segredo — só se o cabeçalho está presente.
    has_secret_header: !!(hook.headers && Object.keys(hook.headers)
      .some((k) => k.toLowerCase() === HEADER)),
  });

  const listed = await listWebhooks();
  if (!listed.ok) return json({ error: listed.error }, 502);
  const hooks = listed.data?.results ?? [];
  const mine = hooks.filter((h) => (h.url ?? '').split('?')[0] === baseUrl);

  if (req.method === 'GET') {
    return json({
      base_url: baseUrl,
      secret_header: HEADER,
      has_secret: true,
      webhooks: mine.map(describe),
      needs_setup: mine.length === 0 ||
        mine.some((h) => !describe(h).has_secret_header || h.url !== baseUrl),
    });
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Cria ou corrige o webhook: URL limpa (sem segredo) + segredo em cabeçalho.
  const target = mine.find((h) => h.event === 'all') ?? mine[0];
  const payload = { url: baseUrl, event: 'all', headers: { [HEADER]: secret } };
  const result = target
    ? await updateWebhook(target.id, payload)
    : await createWebhook(payload);
  if (!result.ok) return json({ error: result.error }, 502);

  return json({
    ok: true,
    action: target ? 'updated' : 'created',
    base_url: baseUrl,
    secret_header: HEADER,
    webhook: describe(result.data),
  });
});
