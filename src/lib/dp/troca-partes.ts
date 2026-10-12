import { supabase } from "@/integrations/supabase/client";

/**
 * O colaborador não lê o cadastro dos colegas direto (dados sigilosos), então o
 * join `destino:destino_id(nome)` volta vazio. Os nomes das duas partes vêm da
 * RPC `dp_portal_trocas_partes`, liberada só para quem participa da troca ou gestor.
 */
export async function completarPartesTrocas<T extends { id: string; solicitante?: any; destino?: any }>(rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const { data, error } = await (supabase.rpc as any)("dp_portal_trocas_partes", { p_ids: rows.map((r) => r.id) });
  if (error || !Array.isArray(data)) return rows;
  const mapa = new Map<string, any>(data.map((p: any) => [p.troca_id, p]));
  const pessoa = (atual: any, nome?: string | null, matricula?: string | null, cargo?: string | null, unidade?: string | null) =>
    nome
      ? {
          ...(atual ?? {}),
          nome: atual?.nome ?? nome,
          matricula: atual?.matricula ?? matricula ?? null,
          cargo: atual?.cargo?.nome ? atual.cargo : cargo ? { nome: cargo } : null,
          unidade: atual?.unidade?.nome ? atual.unidade : unidade ? { nome: unidade } : null,
        }
      : atual ?? null;
  return rows.map((r) => {
    const p = mapa.get(r.id);
    if (!p) return r;
    return {
      ...r,
      solicitante: pessoa(r.solicitante, p.solicitante_nome, p.solicitante_matricula, p.solicitante_cargo, p.solicitante_unidade),
      destino: pessoa(r.destino, p.destino_nome, p.destino_matricula, p.destino_cargo, p.destino_unidade),
    };
  });
}
