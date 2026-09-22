/**
 * Política de segurança de conteúdo (CSP) do Aveto 360.
 *
 * IMPORTANTE (limite real de hospedagem): a hospedagem da Lovable NÃO envia
 * cabeçalhos HTTP personalizados e NÃO processa `public/_headers` (convenção da
 * Netlify). Por isso este módulo não "aplica" nada sozinho: ele é a fonte única
 * dos valores de cabeçalho, consumida pelos testes e pela documentação em
 * `docs/security/csp-cabecalhos.md`, que traz a configuração pronta para a
 * camada de proxy/domínio (Cloudflare Transform Rules, nginx, Caddy).
 *
 * `Content-Security-Policy-Report-Only` e `frame-ancestors` só funcionam em
 * cabeçalho HTTP — nunca em `<meta http-equiv>`. Não existe atalho via meta tag.
 */

/** Origens realmente usadas pelo produto, por finalidade. */
export const CSP_ORIGENS = {
  /** Backend (Lovable Cloud), Storage e Edge Functions. */
  supabase: ["https://grtxmbffgmgnkawlvqhm.supabase.co", "wss://grtxmbffgmgnkawlvqhm.supabase.co"],
  /** Google Analytics (gtag.js) e coleta de eventos. */
  google: [
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ],
  /** Meta Pixel (script e pixel de imagem/noscript). */
  meta: ["https://connect.facebook.net", "https://www.facebook.com"],
  /** Cloudflare Turnstile (verificação anti-robô no login e recuperação). */
  cloudflare: ["https://challenges.cloudflare.com"],
  /** Pluggy: widget de conexão bancária (Open Finance). */
  pluggy: ["https://cdn.pluggy.ai", "https://connect.pluggy.ai", "https://api.pluggy.ai"],
  /** Fontes web (CSS do Google Fonts + arquivos servidos pelo gstatic). */
  fontes: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
  /** Imagens externas: logotipos de bancos e avatares/arquivos públicos. */
  imagens: ["https://img.logo.dev"],
  /** APIs públicas consultadas pelo navegador (CEP e CNPJ). */
  apisPublicas: ["https://viacep.com.br", "https://brasilapi.com.br"],
  /** Selo verificado do Reclame Aqui (bundle e imagens servidos pelo S3). */
  reclameAqui: ["https://s3.amazonaws.com"],
} as const;

/**
 * Hashes dos scripts inline que permanecem no `index.html`.
 * Hoje só resta o bloco JSON-LD (`application/ld+json`), que não é executável.
 * O teste `src/test/unit/csp.test.ts` recalcula os hashes a partir do HTML e
 * falha se um script inline executável for reintroduzido.
 */
export const CSP_INLINE_SCRIPT_HASHES: string[] = [];

type Diretivas = Record<string, string[]>;

function diretivasBase(frameAncestors: string[]): Diretivas {
  const { supabase, google, meta, cloudflare, pluggy, fontes, imagens, apisPublicas, reclameAqui } =
    CSP_ORIGENS;
  return {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": frameAncestors,
    "script-src": [
      "'self'",
      ...google,
      ...meta,
      ...cloudflare,
      ...pluggy.filter((o) => o !== "https://api.pluggy.ai"),
      ...CSP_INLINE_SCRIPT_HASHES.map((h) => `'${h}'`),
    ],
    // Tailwind e bibliotecas de UI aplicam estilos inline em tempo de execução.
    "style-src": ["'self'", "'unsafe-inline'", ...fontes],
    "font-src": ["'self'", "data:", ...fontes],
    // blob:/data: cobrem pré-visualização de documentos, PDF e exportações.
    // cdn.pluggy.ai serve os logotipos das instituições no widget de conexão.
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      ...imagens,
      ...google,
      ...meta,
      ...supabase.slice(0, 1),
      "https://cdn.pluggy.ai",
    ],
    "connect-src": [
      "'self'",
      "blob:",
      ...supabase,
      ...google,
      ...meta,
      ...cloudflare,
      ...pluggy,
      ...apisPublicas,
      ...imagens,
    ],
    // Workers do pdf.js (Vite emite same-origin; blob: cobre o fallback).
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "frame-src": ["'self'", "blob:", ...cloudflare, ...pluggy, ...google],
    "media-src": ["'self'", "blob:", "data:"],
    "manifest-src": ["'self'"],
  };
}

function serializar(d: Diretivas): string {
  return Object.entries(d)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

/** Quem pode embutir o app em iframe: o próprio domínio e o editor da Lovable. */
/**
 * Quem pode embutir o app em iframe. Somente origens exatas.
 *
 * Nada de curinga em `*.lovable.app`: esse espaço é multi-inquilino — qualquer
 * pessoa publica um app ali e poderia embutir a nossa tela de login. Pelo mesmo
 * motivo não há curinga em `*.lovable.dev`. Só entra aqui o editor da Lovable e
 * a origem exata do preview deste projeto.
 */
export const CSP_FRAME_ANCESTORS = [
  "'self'",
  "https://aveto360.com",
  "https://www.aveto360.com",
  "https://lovable.dev",
  "https://id-preview--ceeb4a17-6191-46b0-a351-c97a8211c03e.lovable.app",
];

/**
 * Fase 1 — apenas observação. Não bloqueia nada.
 * `report-uri`/`report-to` ficam de fora de propósito: sem coletor público, as
 * violações são lidas no console do navegador e pelo ouvinte sanitizado do app.
 */
export function cspReportOnlyHeaderValue(): string {
  return serializar(diretivasBase(CSP_FRAME_ANCESTORS));
}

/**
 * Fase 1 — único cabeçalho em modo bloqueio: proteção contra clickjacking.
 * Não restringe scripts, portanto não depende da janela de observação.
 */
export function cspFrameAncestorsHeaderValue(): string {
  return `frame-ancestors ${CSP_FRAME_ANCESTORS.join(" ")}`;
}

/** Cabeçalhos da fase 1, prontos para a camada de proxy. */
export function cspHeadersFase1(): Record<string, string> {
  return {
    "Content-Security-Policy-Report-Only": cspReportOnlyHeaderValue(),
    "Content-Security-Policy": cspFrameAncestorsHeaderValue(),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  };
}
