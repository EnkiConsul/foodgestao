import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SindicatoContextoUnidade {
  sindicatos: string[];
  negociacao: { tipo_documento: string | null; ano: number | null; mes: number | null } | null;
}

/**
 * Sindicatos vinculados a uma unidade e a negociação coletiva mais recente
 * registrada para ela — usado como contexto na tela de regras de folgas.
 */
export function useSindicatoContextoUnidade(unidadeId: string | null) {
  return useQuery({
    queryKey: ["dp_sindicato_contexto_unidade", unidadeId],
    enabled: !!unidadeId,
    queryFn: async (): Promise<SindicatoContextoUnidade> => {
      const [{ data: vinculos, error: vErr }, { data: negs, error: nErr }] = await Promise.all([
        supabase
          .from("dp_sindicato_unidades")
          .select("dp_sindicatos!inner(nome, tipo)")
          .eq("unidade_id", unidadeId!),
        supabase
          .from("dp_sindicato_negociacoes")
          .select("tipo_documento, ano, mes")
          .eq("unidade_id", unidadeId!)
          .order("ano", { ascending: false, nullsFirst: false })
          .order("mes", { ascending: false, nullsFirst: false })
          .limit(1),
      ]);
      if (vErr) throw vErr;
      if (nErr) throw nErr;

      const sindicatos = ((vinculos ?? []) as unknown as { dp_sindicatos: { nome: string; tipo: string } }[])
        .map((v) => `${v.dp_sindicatos.nome} (${v.dp_sindicatos.tipo === "patronal" ? "patronal" : "laboral"})`);

      const neg = (negs ?? [])[0] as SindicatoContextoUnidade["negociacao"];
      return { sindicatos, negociacao: neg ?? null };
    },
  });
}
