import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Serve imagens (logo, banner e fotos de produto) da loja online pública.
// Os buckets são privados: esta função valida no banco que o arquivo pertence
// a uma loja publicada antes de devolver o conteúdo.

const ALLOWED_BUCKETS = new Set(['ped-storefront', 'ped-produtos']);

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') ?? '').trim().toLowerCase();
    const bucket = (url.searchParams.get('bucket') ?? '').trim();
    const path = (url.searchParams.get('path') ?? '').trim();

    if (!SLUG_RE.test(slug) || !ALLOWED_BUCKETS.has(bucket) || !path || path.includes('..')) {
      return new Response(JSON.stringify({ error: 'Parâmetros inválidos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: allowed, error: rpcError } = await admin.rpc('storefront_public_media_allowed', {
      p_slug: slug,
      p_bucket: bucket,
      p_path: path,
    });
    if (rpcError) {
      console.error('storefront_public_media_allowed failed:', rpcError.message);
      return new Response(JSON.stringify({ error: 'Falha ao validar imagem' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Imagem não disponível' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error || !data) {
      console.error('storefront media download failed:', error?.message);
      return new Response(JSON.stringify({ error: 'Imagem não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(data.stream(), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': data.type || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('storefront-media error:', err);
    return new Response(JSON.stringify({ error: 'Erro inesperado' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
