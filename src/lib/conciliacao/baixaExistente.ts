/**
 * Ranqueia lançamentos pendentes (recorrentes, parcelados ou avulsos) que podem
 * ser a mesma movimentação do extrato. O valor já vem idêntico do banco; aqui
 * pontuamos conta, fornecedor/cliente, descrição e proximidade de data.
 * Não há limite de dias: pagamentos muito adiantados ou atrasados continuam
 * elegíveis, só perdem pontos de data.
 */
export interface CandidatoBaixa {
  staging_id: string;
  transaction_id: string;
  description: string | null;
  amount: number;
  amount_paid: number;
  due_date: string | null;
  transaction_date: string | null;
  account_id: string | null;
  contact_id: string | null;
  contact_name: string | null;
  category_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  is_recurring: boolean;
  parent_transaction_id: string | null;
}

export interface ContextoLinha {
  date: string;
  description: string | null;
  counterpartyName?: string | null;
  accountId?: string | null;
  contactId?: string | null;
}

export interface CandidatoPontuado extends CandidatoBaixa {
  score: number;
  confianca: "alta" | "media" | "baixa";
  /** Dias entre o pagamento (extrato) e o vencimento. Positivo = atraso. */
  diasDiferenca: number;
}

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "ltda", "me", "sa", "pix", "ted", "doc", "pagamento", "pgto", "pag", "boleto", "transferencia", "enviado", "recebido", "compra"]);

export function tokens(texto: string | null | undefined): Set<string> {
  const n = (texto ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  return new Set(n.split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t)));
}

export function similaridade(a: string | null | undefined, b: string | null | undefined): number {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comum = 0;
  for (const t of ta) if (tb.has(t)) comum++;
  return comum / Math.min(ta.size, tb.size);
}

function dias(a: string, b: string): number {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);
}

export function pontuarCandidato(c: CandidatoBaixa, linha: ContextoLinha): CandidatoPontuado {
  const ref = c.due_date ?? c.transaction_date ?? linha.date;
  const diasDiferenca = dias(linha.date, ref);
  const abs = Math.abs(diasDiferenca);
  let score = 40; // valor idêntico
  if (linha.contactId && c.contact_id && linha.contactId === c.contact_id) score += 25;
  const textoLinha = `${linha.description ?? ""} ${linha.counterpartyName ?? ""}`;
  const textoCand = `${c.description ?? ""} ${c.contact_name ?? ""}`;
  score += Math.round(similaridade(textoLinha, textoCand) * 20);
  if (linha.accountId && c.account_id && linha.accountId === c.account_id) score += 5;
  score += abs <= 3 ? 10 : abs <= 10 ? 7 : abs <= 35 ? 4 : abs <= 120 ? 2 : 0;
  score = Math.min(100, score);
  const confianca = score >= 75 ? "alta" : score >= 55 ? "media" : "baixa";
  return { ...c, score, confianca, diasDiferenca };
}

/** Agrupa e ordena por linha do extrato, do mais provável para o menos. */
export function ranquearCandidatos(
  candidatos: CandidatoBaixa[],
  contexto: (stagingId: string) => ContextoLinha | null,
): Record<string, CandidatoPontuado[]> {
  const out: Record<string, CandidatoPontuado[]> = {};
  for (const c of candidatos) {
    const ctx = contexto(c.staging_id);
    if (!ctx) continue;
    (out[c.staging_id] ??= []).push(pontuarCandidato(c, ctx));
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => b.score - a.score || Math.abs(a.diasDiferenca) - Math.abs(b.diasDiferenca));
  return out;
}

export function rotuloPrazo(diasDiferenca: number): string {
  if (diasDiferenca === 0) return "pago no vencimento";
  const n = Math.abs(diasDiferenca);
  const d = n === 1 ? "dia" : "dias";
  return diasDiferenca > 0 ? `pago com ${n} ${d} de atraso` : `pago ${n} ${d} antes do vencimento`;
}
