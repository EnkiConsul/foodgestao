import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SindicatoResumo {
  id: string;
  nome: string;
  tipo: string;
  cnpj: string | null;
  data_base: string | null;
}

export interface NegociacaoResumo {
  id: string;
  tipo_documento: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  reajuste_pct: number | null;
}

export interface SindicatoEnquadramento {
  /** Sindicato laboral vinculado ao cargo (fonte do enquadramento). */
  laboral: SindicatoResumo | null;
  /** Sindicato patronal da unidade. */
  patronal: SindicatoResumo | null;
  /** Negociação coletiva vigente mais recente do sindicato laboral. */
  negociacao: NegociacaoResumo | null;
  /** Negociação coletiva vigente mais recente do sindicato patronal. */
  negociacaoPatronal: NegociacaoResumo | null;
}

const VAZIO: SindicatoEnquadramento = {
  laboral: null, patronal: null, negociacao: null, negociacaoPatronal: null,
};

const negociacaoVigente = async (sindicatoId: string): Promise<NegociacaoResumo | null> => {
  const { data, error } = await supabase
    .from("dp_sindicato_negociacoes")
    .select("id, tipo_documento, vigencia_inicio, vigencia_fim, reajuste_pct")
    .eq("sindicato_id", sindicatoId)
    .order("vigencia_inicio", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as NegociacaoResumo) ?? null;
};

/**
 * Enquadramento sindical derivado do cargo (laboral) e da unidade (patronal).
 * Usado no cadastro do colaborador para herdar o sindicato sem cadastro paralelo.
 */
export function useSindicatoDoCargo(cargoId: string | null, unidadeId: string | null) {
  return useQuery({
    queryKey: ["dp_sindicato_do_cargo", cargoId, unidadeId],
    enabled: !!cargoId || !!unidadeId,
    queryFn: async (): Promise<SindicatoEnquadramento> => {
      const sel = "dp_sindicatos!inner(id, nome, tipo, cnpj, data_base)";

      const [laboralRes, patronalRes] = await Promise.all([
        cargoId
          ? supabase.from("dp_sindicato_cargos").select(sel).eq("cargo_id", cargoId)
          : Promise.resolve({ data: [], error: null } as any),
        unidadeId
          ? supabase
              .from("dp_sindicato_unidades")
              .select(sel)
              .eq("unidade_id", unidadeId)
              .eq("dp_sindicatos.tipo", "patronal")
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (laboralRes.error) throw laboralRes.error;
      if (patronalRes.error) throw patronalRes.error;

      const pick = (rows: any[]): SindicatoResumo | null => {
        const s = (rows ?? [])[0]?.dp_sindicatos;
        return s ? (s as SindicatoResumo) : null;
      };

      const laboral = pick(laboralRes.data as any[]);
      const patronal = pick(patronalRes.data as any[]);

      const [negociacao, negociacaoPatronal] = await Promise.all([
        laboral ? negociacaoVigente(laboral.id) : Promise.resolve(null),
        patronal ? negociacaoVigente(patronal.id) : Promise.resolve(null),
      ]);

      return { laboral, patronal, negociacao, negociacaoPatronal } satisfies SindicatoEnquadramento;
    },
    initialData: VAZIO,
  });
}
