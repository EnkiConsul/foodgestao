import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateE2ETarget, validateE2EEnvironment } from './e2e-preflight.mjs';

export async function createE2ESession(env, request = fetch) {
  // Validate before transmitting a password or making any network request.
  validateE2ETarget(env);
  if (!env.TEST_USER_A_EMAIL?.trim() || !env.TEST_USER_A_PASSWORD) {
    throw new Error('E2E: credenciais do usuário de teste ausentes.');
  }
  const response = await request(`${env.TEST_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { apikey: env.TEST_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD }),
  });
  if (!response.ok) throw new Error('E2E: autenticação do usuário de teste recusada.');
  const session = await response.json();
  if (!session.refresh_token || !session.user?.id) throw new Error('E2E: sessão incompleta.');
  const updates = {
    LOVABLE_BROWSER_AUTH_STATUS: 'injected',
    LOVABLE_BROWSER_SUPABASE_STORAGE_KEY: `sb-${env.TEST_EXPECTED_PROJECT_REF}-auth-token`,
    LOVABLE_BROWSER_SUPABASE_SESSION_JSON: JSON.stringify(session),
  };
  validateE2EEnvironment({...env, ...updates});
  const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
  if (claims.sub !== session.user.id) throw new Error('E2E: identidade da sessão divergente.');
  return updates;
}

export function writeActionsSession(updates, file, log = console.log) {
  const session = JSON.parse(updates.LOVABLE_BROWSER_SUPABASE_SESSION_JSON);
  // Register masks before writing the environment for subsequent job steps.
  for (const secret of [session.access_token, session.refresh_token, updates.LOVABLE_BROWSER_SUPABASE_SESSION_JSON]) {
    log(`::add-mask::${secret.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')}`);
  }
  appendFileSync(file, Object.entries(updates).map(([key,value]) => `${key}=${value}\n`).join(''), {mode: 0o600});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.env.GITHUB_ENV) throw new Error('GitHub Actions environment required.');
    const updates = await createE2ESession(process.env);
    writeActionsSession(updates, process.env.GITHUB_ENV);
    console.log('Sessão de homologação criada para este job.');
  } catch { console.error('E2E: não foi possível preparar a sessão de homologação.'); process.exit(1); }
}
