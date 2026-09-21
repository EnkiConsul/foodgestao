import { describe, it, expect, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { instalarFetchGuardHomologacao } from '@/lib/env/homologacaoFetchGuard';

describe('D3 independent SDK isolation', () => {
  it('intercepts every functions getter access without network', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const transport = { fetch: fetchSpy as typeof fetch };
    instalarFetchGuardHomologacao(transport, true);
    const client = createClient('https://utjhzpdbqzajrhnzcher.supabase.co', 'sb_publishable_test-only-not-a-real-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: transport.fetch },
    });
    await client.functions.invoke('lookup-cnpj', { body: { cnpj: '00000000000000' } });
    await client.functions.invoke('asaas-create-checkout');
    await client.functions.invoke('unknown-external-function');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
