import { describe, it, expect } from 'vitest';
import { feedOrdenadoComFerias, periodoCurto, calcularFechamentoContabil } from './ocorrencias-relatorio';
const base = (d: string, extra: any = {}) => ({ id: d, colaborador_id: 'r', data_operacional: d, tipo: 'atestado', estado: 'aberta', tratativa_status: 'concluida', ...extra }) as any;
describe('blocos de ocorrências', () => {
  it('mesma solicitação agrupa mesmo com textos diferentes', () => {
    const f = feedOrdenadoComFerias([base('2026-10-20',{solicitacao_id:'s',justificativa_inicial:'a'}), base('2026-10-21',{solicitacao_id:'s',justificativa_inicial:'b'})]);
    expect(f).toHaveLength(1);
  });
  it('período curto sem ano', () => { expect(periodoCurto([base('2026-10-20'),base('2026-10-21'),base('2026-10-22')])).toBe('20/10 a 22/10 (3 dias)'); });
  it('conta dias de atestado', () => { expect(calcularFechamentoContabil([base('2026-10-20'),base('2026-10-21'),base('2026-10-22')]).diasAtestado).toBe(3); });
});
