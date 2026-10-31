import { describe, it, expect } from 'vitest';
import {
  shouldImportTx, pendingLookbackDays, pendingMaxDays, isStagingUpdatable,
  incrementalStartFrom, findSupersededPending, pendingCutoff,
} from '../../../supabase/functions/_shared/pluggy-pending';

const hoje = '2026-10-31';

describe('Regra C: PENDING com prazo', () => {
  it('PENDING novo (< 5 dias) é ignorado', () => {
    expect(shouldImportTx({ status: 'PENDING', date: '2026-10-28' }, hoje, 5)).toBe(false);
  });
  it('PENDING antigo (>= 5 dias) é importado', () => {
    expect(shouldImportTx({ status: 'PENDING', date: '2026-10-26' }, hoje, 5)).toBe(true);
  });
  it('POSTED sempre é importado', () => {
    expect(shouldImportTx({ status: 'POSTED', date: '2026-10-31' }, hoje, 5)).toBe(true);
  });
  it('corte da conferência é hoje - N', () => {
    expect(pendingCutoff(hoje, 5)).toBe('2026-10-26');
  });
  it('env: padrões 15/5 e teto 30 no lookback', () => {
    expect(pendingLookbackDays(undefined)).toBe(15);
    expect(pendingLookbackDays('90')).toBe(30);
    expect(pendingMaxDays(undefined)).toBe(5);
  });
});

describe('B1: só pending sem conciliação é atualizável', () => {
  it('virada PENDING→POSTED com mesmo ID atualiza a linha pendente', () => {
    expect(isStagingUpdatable({ status: 'pending', matched_transaction_id: null })).toBe(true);
  });
  it('confirmed, ignored e conciliada nunca mudam', () => {
    expect(isStagingUpdatable({ status: 'confirmed' })).toBe(false);
    expect(isStagingUpdatable({ status: 'ignored' })).toBe(false);
    expect(isStagingUpdatable({ status: 'pending', matched_transaction_id: 'x' })).toBe(false);
  });
});

describe('B3: janela incremental', () => {
  it('recua 15 dias da última data', () => {
    expect(incrementalStartFrom('2026-10-28', 15)).toBe('2026-10-13');
  });
});

describe('B2: virada PENDING→POSTED com ID novo', () => {
  const pend = {
    id: '79ab5a0b', pluggy_transaction_id: 'old', pluggy_account_id: 'acc', status: 'pending',
    matched_transaction_id: null, amount: '254.91', date: '2026-09-02', raw_status: 'PENDING',
  };
  const posted = { pluggy_transaction_id: 'new', pluggy_account_id: 'acc', amount: 254.91, date: '2026-09-03', raw_status: 'POSTED' };
  it('marca o PENDING equivalente', () => {
    expect(findSupersededPending(posted, [pend]).map((c) => c.id)).toEqual(['79ab5a0b']);
  });
  it('não casa valor diferente, data > 3 dias ou conciliado', () => {
    expect(findSupersededPending(posted, [{ ...pend, amount: '254.90' }])).toEqual([]);
    expect(findSupersededPending(posted, [{ ...pend, date: '2026-08-29' }])).toEqual([]);
    expect(findSupersededPending(posted, [{ ...pend, matched_transaction_id: 'm' }])).toEqual([]);
    expect(findSupersededPending(posted, [{ ...pend, status: 'confirmed' }])).toEqual([]);
  });
});
