import { describe, it, expect } from 'vitest';
import { bankAccountNumbers, findDuplicateBankAccounts } from '../../../supabase/functions/_shared/pluggy-duplicate-accounts';

const novo = { type: 'BANK', number: '12345-6', transferNumber: '336/0001/12345-6' };
const base = { type: 'BANK', number_masked: '12345-6', transfer_number: '336/0001/12345-6', connector_id: 612 };

describe('conta duplicada entre empresas', () => {
  it('mesma conta, banco e agência é duplicada', () => {
    expect(findDuplicateBankAccounts([novo], 612, [base])).toHaveLength(1);
  });
  it('ignora cartão de crédito (CREDIT)', () => {
    expect(findDuplicateBankAccounts([{ type: 'CREDIT', number: '1234' }], 612,
      [{ ...base, type: 'CREDIT', number_masked: '1234' }])).toHaveLength(0);
    expect(bankAccountNumbers([{ type: 'CREDIT', number: '1234' }, novo])).toEqual(['12345-6']);
  });
  it('mesmo número em outro banco não é duplicada', () => {
    expect(findDuplicateBankAccounts([novo], 999, [base])).toHaveLength(0);
  });
  it('agência diferente não é duplicada', () => {
    expect(findDuplicateBankAccounts([novo], 612, [{ ...base, transfer_number: '336/0002/12345-6' }])).toHaveLength(0);
  });
  it('sem agência em um dos lados compara só número e banco', () => {
    expect(findDuplicateBankAccounts([{ ...novo, transferNumber: null }], 612, [base])).toHaveLength(1);
  });
});
