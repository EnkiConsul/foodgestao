import { supabase } from "@/integrations/supabase/client";
import { salarioCargoNaUnidade, type CargoSalarioUnidade } from "@/lib/dp/cargoSalarios";

/**
 * Carrega os pisos por unidade da empresa agrupados por cargo, para que folha,
 * provisões e rescisão usem a referência salarial da unidade do colaborador.
 */
export async function carregarPisosPorCargo(companyId: string): Promise<Map<string, CargoSalarioUnidade[]>> {
  const { data, error } = await supabase
    .from("dp_cargo_salarios")
    .select("cargo_id, unidade_id, salario_base, vigencia_inicio, vigencia_fim")
    .eq("company_id", companyId);
  if (error) throw error;
  const map = new Map<string, CargoSalarioUnidade[]>();
  for (const row of (data ?? []) as any[]) {
    const lista = map.get(row.cargo_id) ?? [];
    lista.push(row as CargoSalarioUnidade);
    map.set(row.cargo_id, lista);
  }
  return map;
}

/** Salário de referência do cargo na unidade do colaborador, com fallback ao cargo. */
export function referenciaSalarial(
  pisos: Map<string, CargoSalarioUnidade[]>,
  cargoId: string | null | undefined,
  unidadeId: string | null | undefined,
  salarioGeralCargo: number | null | undefined,
  data?: string,
): number | null {
  return salarioCargoNaUnidade(
    salarioGeralCargo,
    cargoId ? pisos.get(cargoId) ?? [] : [],
    unidadeId,
    data,
  ).valor;
}
