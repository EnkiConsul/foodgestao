import { supabase } from "@/integrations/supabase/client";

export interface DuplicateInput {
  item_id: string;
  colaborador_id: string;
  colaborador_nome: string;
  /** Natureza específica da página (lotes mistos). Se ausente, usa a do lote. */
  tipo?: string | null;
  referencia_data: string | null; // YYYY-MM-DD ou null
}

export interface DuplicateHit {
  item_id: string;
  colaborador_nome: string;
  competencia_label: string;
}

/**
 * Consulta dp_documentos para descobrir quais itens colidem com documentos
 * existentes de mesmo (colaborador, tipo, referencia_data) na empresa.
 * Retorna apenas os itens que já possuem duplicata salva.
 */
export async function detectDuplicates(params: {
  company_id: string;
  tipo: string;
  itens: DuplicateInput[];
}): Promise<DuplicateHit[]> {
  const { company_id, tipo, itens } = params;
  const withRef = itens.filter((i) => !!i.referencia_data);
  if (withRef.length === 0) return [];

  const colabIds = [...new Set(withRef.map((i) => i.colaborador_id))];
  const refs = [...new Set(withRef.map((i) => i.referencia_data as string))];
  const tipos = [...new Set(withRef.map((i) => i.tipo || tipo))];

  const { data, error } = await supabase
    .from("dp_documentos" as any)
    .select("colaborador_id, referencia_data, tipo")
    .eq("company_id", company_id)
    .in("tipo", tipos)
    .in("colaborador_id", colabIds)
    .in("referencia_data", refs);
  if (error) throw error;

  const existing = new Set(
    (data ?? []).map((d: any) => `${d.colaborador_id}::${d.tipo}::${d.referencia_data}`),
  );

  return withRef
    .filter((i) => existing.has(`${i.colaborador_id}::${i.tipo || tipo}::${i.referencia_data}`))
    .map((i) => ({
      item_id: i.item_id,
      colaborador_nome: i.colaborador_nome,
      competencia_label: formatRef(i.referencia_data!),
    }));
}

function formatRef(ref: string): string {
  // ref = YYYY-MM-DD -> MM/YYYY
  const m = ref.match(/^(\d{4})-(\d{2})/);
  if (!m) return ref;
  return `${m[2]}/${m[1]}`;
}
