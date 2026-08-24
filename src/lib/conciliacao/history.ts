/**
 * Memória de conciliação: aprende do que já foi conciliado.
 *
 * Para cada lançamento já confirmado da empresa, olhamos o fornecedor/cliente
 * escolhido no lançamento gerado e guardamos a associação com a contraparte
 * (documento normalizado e nome bruto normalizado). É a regra de maior precisão
 * e resolve os casos recorrentes ("Comissão - RedFox", PIX do mesmo fornecedor).
 */

import { supabase } from "@/integrations/supabase/client";
import { normalizeDocumento } from "@/lib/documento";
import { normalizeContactKey } from "./contactMatch";
import { nameFromRow, type CounterpartyRow } from "./counterparty";

export interface ConciliacaoMemory {
  byDocument: Record<string, string>;
  byName: Record<string, string>;
}

export const EMPTY_MEMORY: ConciliacaoMemory = { byDocument: {}, byName: {} };

/** Escolhe o contato mais frequente de cada chave. */
function pickWinners(counts: Record<string, Record<string, number>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, byContact] of Object.entries(counts)) {
    let bestId: string | null = null;
    let bestN = 0;
    for (const [id, n] of Object.entries(byContact)) {
      if (n > bestN) { bestN = n; bestId = id; }
    }
    if (bestId) out[key] = bestId;
  }
  return out;
}

export async function loadConciliacaoMemory(companyId: string): Promise<ConciliacaoMemory> {
  const { data: staged, error } = await supabase
    .from("pluggy_staging_transactions")
    .select("id, amount, description, raw, counterparty_document, matched_transaction_id")
    .eq("company_id", companyId)
    .eq("status", "confirmed")
    .not("matched_transaction_id", "is", null)
    .order("date", { ascending: false })
    .limit(1000);
  if (error || !staged || staged.length === 0) return EMPTY_MEMORY;

  const rows = staged as unknown as (CounterpartyRow & {
    counterparty_document: string | null;
    matched_transaction_id: string | null;
  })[];

  const txIds = rows.map((r) => r.matched_transaction_id).filter((v): v is string => !!v);
  if (txIds.length === 0) return EMPTY_MEMORY;

  const { data: txs } = await supabase
    .from("transactions")
    .select("id, contact_id")
    .in("id", txIds.slice(0, 1000))
    .not("contact_id", "is", null);

  const contactByTx: Record<string, string> = {};
  for (const t of ((txs ?? []) as { id: string; contact_id: string | null }[])) {
    if (t.contact_id) contactByTx[t.id] = t.contact_id;
  }

  const docCounts: Record<string, Record<string, number>> = {};
  const nameCounts: Record<string, Record<string, number>> = {};

  for (const r of rows) {
    const contactId = r.matched_transaction_id ? contactByTx[r.matched_transaction_id] : undefined;
    if (!contactId) continue;

    const doc = normalizeDocumento(r.counterparty_document);
    if (doc.length >= 11) {
      docCounts[doc] = docCounts[doc] ?? {};
      docCounts[doc][contactId] = (docCounts[doc][contactId] ?? 0) + 1;
    }

    const name = normalizeContactKey(nameFromRow(r));
    if (name.length >= 3) {
      nameCounts[name] = nameCounts[name] ?? {};
      nameCounts[name][contactId] = (nameCounts[name][contactId] ?? 0) + 1;
    }
  }

  return { byDocument: pickWinners(docCounts), byName: pickWinners(nameCounts) };
}
