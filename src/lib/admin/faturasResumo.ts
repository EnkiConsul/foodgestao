export interface FaturaResumoInput {
  status: string;
  amount_cents: number | null;
  discount_cents?: number | null;
  is_test?: boolean | null;
  billing_account_id?: string | null;
}

export interface FaturasResumo {
  recebidoCents: number;
  aReceberCents: number;
  vencidoCents: number;
  canceladas: number;
}

/** Fatura de teste só quando a conta de cobrança é is_test; sem conta = real. */
export function faturaEhTeste(f: FaturaResumoInput): boolean {
  return f.is_test === true;
}

export function valorLiquido(f: FaturaResumoInput): number {
  return (f.amount_cents ?? 0) - (f.discount_cents ?? 0);
}

/** Resumo sempre sobre faturas reais, mesmo se a lista incluir testes. */
export function resumirFaturas(faturas: FaturaResumoInput[]): FaturasResumo {
  const r: FaturasResumo = { recebidoCents: 0, aReceberCents: 0, vencidoCents: 0, canceladas: 0 };
  for (const f of faturas) {
    if (faturaEhTeste(f)) continue;
    if (f.status === "paid") r.recebidoCents += valorLiquido(f);
    else if (f.status === "open") r.aReceberCents += valorLiquido(f);
    else if (f.status === "overdue") r.vencidoCents += valorLiquido(f);
    else if (f.status === "canceled") r.canceladas += 1;
  }
  return r;
}
