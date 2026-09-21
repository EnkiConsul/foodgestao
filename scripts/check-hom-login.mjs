// Leitura e login somente; nenhuma credencial é exibida ou versionada.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
const ref = 'utjhzpdbqzajrhnzcher';
const env = Object.fromEntries(readFileSync('.env.homologacao.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]; }));
const fixture = JSON.parse(readFileSync(join(process.env.LOCALAPPDATA, 'Aveto360/homologacao/credentials.json'), 'utf8'));
if (fixture.projectRef !== ref || env.VITE_APP_ENV !== 'homologacao' || env.VITE_SUPABASE_URL !== `https://${ref}.supabase.co`) throw new Error('Destino recusado');
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const user = fixture.users.find(u => u.label === 'A');
if (!user?.email.endsWith('@example.invalid')) throw new Error('Fixture inválida');
const results = {};
const bad = await client.auth.signInWithPassword({ email: user.email, password: 'deliberately-wrong-d3-password' });
results.wrongPasswordRejected = !!bad.error && !bad.data.session;
try {
  const good = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  results.realLogin = !good.error && !!good.data.session;
  if (!results.realLogin) throw new Error(`Login falhou: ${good.error?.code || 'sem sessão'}`);
  const segments = await client.from('segmentos').select('id').eq('id', 'd3000000-0000-4000-8000-000000000001');
  results.segmentVisible = !segments.error && segments.data?.length === 1;
  const cnpj = await client.functions.invoke('check-onboarding-cnpj', { body: { cnpj: '58241366000132' } });
  results.authenticatedCnpjCheck = !cnpj.error && cnpj.data?.status === 'available';
  if (!results.authenticatedCnpjCheck) results.cnpjResponse = cnpj.error ? { error: cnpj.error.name } : cnpj.data;
} finally {
  await client.auth.signOut({ scope: 'local' });
}
console.log(JSON.stringify(results, null, 2));
if (Object.values(results).some(v => v !== true)) process.exitCode = 1;
