/**
 * Histórico anotado na ficha de registro (férias, afastamentos, advertências)
 * e a ponte tipada para a RPC dp_ficha_historico_aplicar, que grava tudo nos
 * módulos oficiais de forma idempotente.
 */
import { supabase } from "@/integrations/supabase/client";

export type Linha = Record<string, unknown>;

const lista = (v: unknown): Linha[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Linha[]) : [];

export function historicoDaFicha(dados: unknown) {
  const d = (dados ?? {}) as Record<string, unknown>;
  return {
    ferias: lista(d.historico_ferias),
    afastamentos: lista(d.historico_afastamentos),
    advertencias: lista(d.historico_advertencias),
    varridoEm: typeof d.historico_varrido_em === "string" ? d.historico_varrido_em : null,
    aplicadoEm: typeof d.historico_aplicado_em === "string" ? d.historico_aplicado_em : null,
  };
}

export interface HistoricoAplicadoResultado {
  ferias: number;
  advertencias: number;
  afastamentos: number;
  erros: Array<{ tipo: string; erro: string }>;
}

export async function aplicarHistoricoFicha(
  itemId: string,
  h: { ferias: Linha[]; afastamentos: Linha[]; advertencias: Linha[] },
): Promise<HistoricoAplicadoResultado> {
  const cliente = supabase as unknown as {
    rpc(fn: "dp_ficha_historico_aplicar", a: Record<string, unknown>): PromiseLike<{
      data: HistoricoAplicadoResultado | null; error: { message: string } | null;
    }>;
  };
  const { data, error } = await cliente.rpc("dp_ficha_historico_aplicar", {
    p_item_id: itemId, p_ferias: h.ferias, p_afastamentos: h.afastamentos, p_advertencias: h.advertencias,
  });
  if (error) throw new Error(error.message);
  return data ?? { ferias: 0, advertencias: 0, afastamentos: 0, erros: [] };
}
