import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface BrasilApiCnpj {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  email: string | null;
  ddd_telefone_1: string | null;
  ddd_telefone_2: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  descricao_situacao_cadastral: string | null;
}

// TTL do cache: 30 dias
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => null);
    const raw = typeof body?.cnpj === 'string' ? body.cnpj : '';
    const force = body?.force === true;
    const cnpj = raw.replace(/\D/g, '');

    if (cnpj.length !== 14) {
      return json({ error: 'CNPJ inválido. Deve conter 14 dígitos.' }, 400);
    }

    // 1) Check cache
    if (!force) {
      const { data: cached, error: cacheErr } = await supabaseAdmin
        .from('cnpj_cache')
        .select('payload, fetched_at')
        .eq('cnpj', cnpj)
        .maybeSingle();

      if (cacheErr) console.error('cnpj_cache read error', cacheErr);

      if (cached) {
        const age = Date.now() - new Date(cached.fetched_at).getTime();
        if (age < CACHE_TTL_MS) {
          return json({ ...(cached.payload as object), _cached: true, _fetched_at: cached.fetched_at }, 200);
        }
      }
    }

    // 2) Fetch from BrasilAPI (timeout 8s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let resp: Response;
    try {
      resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const isAbort = (fetchErr as Error)?.name === 'AbortError';
      console.error('BrasilAPI network error', fetchErr);
      const stale = await readStale(cnpj);
      if (stale) {
        return json({ ...(stale.payload as object), _cached: true, _stale: true, _fetched_at: stale.fetched_at, _warning: 'stale' }, 200);
      }
      return json({
        error: isAbort
          ? 'A consulta à Receita Federal demorou demais para responder. Tente novamente em instantes.'
          : 'Não foi possível contatar a Receita Federal agora. Verifique sua conexão e tente novamente.',
        code: isAbort ? 'timeout' : 'network_error',
      }, 504);
    }
    clearTimeout(timeoutId);

    if (resp.status === 404) {
      return json({ error: 'CNPJ não encontrado na base da Receita Federal.', code: 'not_found' }, 404);
    }
    if (resp.status === 429) {
      const stale = await readStale(cnpj);
      if (stale) {
        return json({ ...(stale.payload as object), _cached: true, _stale: true, _fetched_at: stale.fetched_at, _warning: 'rate_limited' }, 200);
      }
      return json({
        error: 'Muitas consultas em pouco tempo. Aguarde alguns segundos e tente novamente.',
        code: 'rate_limited',
      }, 429);
    }
    if (!resp.ok) {
      const text = await resp.text();
      console.error('BrasilAPI error', resp.status, text);
      const stale = await readStale(cnpj);
      if (stale) {
        return json({ ...(stale.payload as object), _cached: true, _stale: true, _fetched_at: stale.fetched_at, _warning: 'upstream_error' }, 200);
      }
      return json({
        error: 'A Receita Federal está temporariamente indisponível. Por favor, tente novamente em alguns minutos.',
        code: 'upstream_unavailable',
        status: resp.status,
      }, 502);
    }

    const data = (await resp.json()) as BrasilApiCnpj;

    const formatPhone = (p: string | null) => {
      if (!p) return null;
      const d = p.replace(/\D/g, '');
      if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
      if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return p;
    };
    const formatCep = (c: string | null) => {
      if (!c) return null;
      const d = c.replace(/\D/g, '');
      return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : c;
    };

    const parts = [
      data.logradouro,
      data.numero,
      data.complemento,
      data.bairro,
      data.municipio && data.uf ? `${data.municipio} - ${data.uf}` : data.municipio || data.uf,
      formatCep(data.cep),
    ].filter(Boolean);

    const payload = {
      cnpj: data.cnpj,
      razao_social: data.razao_social ?? null,
      nome_fantasia: data.nome_fantasia ?? null,
      email: data.email ?? null,
      telefone: formatPhone(data.ddd_telefone_1 || data.ddd_telefone_2),
      logradouro: data.logradouro ?? null,
      numero: data.numero ?? null,
      complemento: data.complemento ?? null,
      bairro: data.bairro ?? null,
      municipio: data.municipio ?? null,
      uf: data.uf ?? null,
      cep: formatCep(data.cep),
      situacao: data.descricao_situacao_cadastral ?? null,
      endereco_formatado: parts.join(', '),
    };

    // 3) Upsert into cache
    const { error: upsertErr } = await supabaseAdmin
      .from('cnpj_cache')
      .upsert({ cnpj, payload, fetched_at: new Date().toISOString() }, { onConflict: 'cnpj' });
    if (upsertErr) console.error('cnpj_cache upsert error', upsertErr);

    return json({ ...payload, _cached: false }, 200);
  } catch (e) {
    console.error('lookup-cnpj error', e);
    return json({
      error: 'Erro interno ao consultar CNPJ. Tente novamente.',
      code: 'internal_error',
      details: e instanceof Error ? e.message : String(e),
    }, 500);
  }
});

async function readStale(cnpj: string) {
  const { data } = await supabaseAdmin
    .from('cnpj_cache')
    .select('payload, fetched_at')
    .eq('cnpj', cnpj)
    .maybeSingle();
  return data;
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

