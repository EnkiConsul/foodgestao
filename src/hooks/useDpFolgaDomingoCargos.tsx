import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FolgaDomingoCargo {
  id: string;
  unidade_id: string;
  cargo_id: string;
  domingos_mes: number;
}

/** Domingos de folga diferenciados por cargo dentro da unidade. */
export function useDpFolgaDomingoCargos(companyId?: string | null) {
  return useQuery({
    queryKey: ["dp_folga_domingo_cargos", companyId ?? null],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folga_domingo_cargos" as never)
        .select("id, unidade_id, cargo_id, domingos_mes")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as unknown as FolgaDomingoCargo[];
    },
  });
}

/**
 * Domingos por mês que valem para a pessoa: exceção individual → regra do cargo
 * na unidade → null (segue a regra da unidade para homens/mulheres).
 */
export function domingosDiferenciados(
  colab: { domingos_folga_mes?: number | null; unidade_id?: string | null; cargo_id?: string | null },
  regras: FolgaDomingoCargo[],
): { domingos: number | null; origem: "colaborador" | "cargo" | null } {
  if (colab.domingos_folga_mes != null) return { domingos: colab.domingos_folga_mes, origem: "colaborador" };
  const r = regras.find((x) => x.unidade_id === colab.unidade_id && x.cargo_id === colab.cargo_id);
  return r ? { domingos: r.domingos_mes, origem: "cargo" } : { domingos: null, origem: null };
}

/** Opções oferecidas: mesmo padrão da unidade (a cada X semanas ou X por mês). */
export const OPCOES_DOMINGOS_DIFERENCIADOS = [
  { value: "4", label: "Toda semana (4 por mês)" },
  { value: "2", label: "A cada 2 semanas (2 por mês)" },
  { value: "3", label: "3 por mês" },
  { value: "1", label: "A cada 4 semanas (1 por mês)" },
] as const;

export const rotuloDomingos = (n: number) =>
  OPCOES_DOMINGOS_DIFERENCIADOS.find((o) => Number(o.value) === n)?.label ?? `${n} por mês`;
