import { describe, it, expect } from 'vitest';
import {
  allowedReconcileClientUserIds,
  isReconcileCandidateAllowed,
} from '../../../supabase/functions/_shared/pluggy-reconcile';

describe('pluggy reconcile correlation', () => {
  const allowed = allowedReconcileClientUserIds(['r1', 'r2']);

  it('aceita somente ofreq das solicitações da empresa', () => {
    expect(isReconcileCandidateAllowed('ofreq:r1', allowed)).toBe(true);
    expect(isReconcileCandidateAllowed('ofreq:r9', allowed)).toBe(false);
  });

  it('rejeita user_id puro', () => {
    const uid = '11111111-1111-1111-1111-111111111111';
    expect(isReconcileCandidateAllowed(uid, allowedReconcileClientUserIds([uid]))).toBe(false);
    expect([...allowed].every((v) => v.startsWith('ofreq:'))).toBe(true);
  });

  it('rejeita item sem clientUserId', () => {
    expect(isReconcileCandidateAllowed(null, allowed)).toBe(false);
  });
});
