import { pathToFileURL } from 'node:url';
import { productionRef, validateCatalogEnvironment } from './test-target-safety.mjs';

export function validateE2ETarget(env) {
  const required = ['E2E_BASE_URL', 'TEST_EXPECTED_PROJECT_REF', 'TEST_SUPABASE_URL',
    'TEST_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PROJECT_ID',
    'SUPABASE_DB_URL'];
  if (required.some(key => !env[key]?.trim())) throw new Error('E2E: configuração obrigatória ausente.');
  const ref = env.TEST_EXPECTED_PROJECT_REF;
  if (!/^[a-z]{20}$/.test(ref) || ref === productionRef ||
      env.TEST_SUPABASE_URL !== `https://${ref}.supabase.co` ||
      env.VITE_SUPABASE_URL !== env.TEST_SUPABASE_URL || env.VITE_SUPABASE_PROJECT_ID !== ref ||
      env.VITE_SUPABASE_PUBLISHABLE_KEY !== env.TEST_SUPABASE_ANON_KEY) {
    throw new Error('E2E: aplicativo e API devem apontar para a homologação explícita.');
  }
  const base = new URL(env.E2E_BASE_URL);
  if (base.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(base.hostname) ||
      base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('E2E: exige preview local sem redirecionamento de destino.');
  }
  if (env.QA_DB_URL || env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON) {
    throw new Error('E2E: configuração alternativa de QA/cookies recusada.');
  }
  const db = new URL(env.SUPABASE_DB_URL);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.hash || !db.password ||
      [...db.searchParams.keys()].some(k => !['sslmode','connect_timeout'].includes(k))) {
    throw new Error('E2E: conexão de QA ambígua.');
  }
  validateCatalogEnvironment({...env, PGHOST: db.hostname, PGUSER: decodeURIComponent(db.username),
    PGPORT: db.port || '5432', PGDATABASE: decodeURIComponent(db.pathname.slice(1))});
}

export function validateE2EEnvironment(env) {
  validateE2ETarget(env);
  const ref = env.TEST_EXPECTED_PROJECT_REF;
  const session = JSON.parse(env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON);
  const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
  // Routing/expiry check only. Supabase still verifies the JWT signature.
  if (payload.iss !== `${env.TEST_SUPABASE_URL}/auth/v1` || payload.role !== 'authenticated' ||
      !payload.sub || !Number.isFinite(payload.exp) || payload.exp <= Date.now()/1000 + 60 ||
      env.LOVABLE_BROWSER_AUTH_STATUS !== 'injected' ||
      env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY !== `sb-${ref}-auth-token`) {
    throw new Error('E2E: sessão ausente, expirada ou de outro projeto.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { validateE2EEnvironment(process.env); }
  catch { console.error('E2E bloqueado: valide preview local, homologação, sessão e conexão QA.'); process.exit(1); }
}
