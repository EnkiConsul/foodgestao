import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json().catch(() => null);
    const raw = typeof body?.cnpj === 'string' ? body.cnpj : '';
    const cnpj = raw.replace(/\D/g, '');

    if (cnpj.length !== 14) {
      return json({ error: 'CNPJ inválido. Deve conter 14 dígitos.' }, 400);
    }

    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { Accept: 'application/json' },
    });

    if (resp.status === 404) {
      return json({ error: 'CNPJ não encontrado na base da Receita Federal.' }, 404);
    }
    if (!resp.ok) {
      const text = await resp.text();
      console.error('BrasilAPI error', resp.status, text);
      return json({ error: 'Falha ao consultar CNPJ. Tente novamente.', status: resp.status }, 502);
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
      if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
      return c;
    };

    const parts = [
      data.logradouro,
      data.numero,
      data.complemento,
      data.bairro,
      data.municipio && data.uf ? `${data.municipio} - ${data.uf}` : data.municipio || data.uf,
      formatCep(data.cep),
    ].filter(Boolean);

    return json({
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
    }, 200);
  } catch (e) {
    console.error('lookup-cnpj error', e);
    return json({ error: e instanceof Error ? e.message : 'Erro interno' }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
