/**
 * Extração do documento (CNPJ/CPF) da contraparte em transações do Open Finance.
 * Espelha a lógica de `src/lib/conciliacao/counterparty.ts` — edge functions não
 * podem importar código de `src/`.
 */

export interface CounterpartyDoc {
  document: string | null;
  documentType: 'CNPJ' | 'CPF' | null;
}

function digits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

function format(v: unknown): string | null {
  const d = digits(v);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return null;
}

/**
 * Devolve o documento da contraparte (pagador em entradas, recebedor em saídas),
 * descartando os documentos da própria empresa informados em `ownDocuments`.
 */
export function extractCounterpartyDocument(
  t: { amount?: number | null; paymentData?: any; merchant?: any },
  ownDocuments: (string | null | undefined)[] = [],
): CounterpartyDoc {
  const own = new Set(ownDocuments.map(digits).filter((d) => d.length >= 11));
  const isEntrada = Number(t.amount ?? 0) >= 0;
  const pd = t.paymentData ?? null;

  const candidates: unknown[] = [
    isEntrada ? pd?.payer?.documentNumber?.value : pd?.receiver?.documentNumber?.value,
    t.merchant?.cnpj,
    isEntrada ? pd?.receiver?.documentNumber?.value : pd?.payer?.documentNumber?.value,
  ];

  for (const c of candidates) {
    const d = digits(c);
    if (d.length < 11 || own.has(d)) continue;
    return { document: format(c), documentType: d.length === 11 ? 'CPF' : 'CNPJ' };
  }
  return { document: null, documentType: null };
}
