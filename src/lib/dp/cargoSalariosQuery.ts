import { supabase } from "@/integrations/supabase/client";
import { salarioCargoNaUnidade, type CargoSalarioLinha } from "@/lib/dp/cargoSalarios";

export interface ReferenciaSalarialData {
  /** Linhas de piso/ajuste agrupadas por cargo. */
  porCargo: Map<string, CargoSalarioLinha[]>;
  /** Sindicato patronal de cada unidade. */
  patronalPorUnidade: Map<string, string>;
}

/**
 * Carrega os pisos por sindicato patronal (e ajustes por unidade) da empresa,
 * junto com o patronal de cada unidade, para que folha, provisões e rescisão
 * usem a referência salarial correta de cada colaborador.
 */
export async function carregarPisosPorCargo(companyId: string): Promise<ReferenciaSalarialData> {
  const [linhasRes, vincRes] = await Promise.all([
    supabase
      .from("dp_cargo_salarios")
      .select("cargo_id, unidade_id, sindicato_patronal_id, salario_base, vigencia_inicio, vigencia_fim")
      .eq("company_id", companyId),
    supabase
      .from("dp_sindicato_unidades")
      .select("unidade_id, sindicato_id, dp_sindicatos!inner(tipo)")
      .eq("dp_sindicatos.tipo", "patronal"),
  ]);
  if (linhasRes.error) throw linhasRes.error;
  if (vincRes.error) throw vincRes.error;

  const porCargo = new Map<string, CargoSalarioLinha[]>();
  for (const row of (linhasRes.data ?? []) as any[]) {
    const lista = porCargo.get(row.cargo_id) ?? [];
    lista.push(row as CargoSalarioLinha);
    porCargo.set(row.cargo_id, lista);
  }

  const patronalPorUnidade = new Map<string, string>();
  for (const row of (vincRes.data ?? []) as any[]) {
    if (!patronalPorUnidade.has(row.unidade_id)) patronalPorUnidade.set(row.unidade_id, row.sindicato_id);
  }

  return { porCargo, patronalPorUnidade };
}

/**
 * Salário de referência do cargo para a unidade do colaborador:
 * ajuste da unidade → piso do patronal da unidade → null (pendente de cadastro).
 */
export function referenciaSalarial(
  ref: ReferenciaSalarialData,
  cargoId: string | null | undefined,
  unidadeId: string | null | undefined,
  data?: string,
): number | null {
  return salarioCargoNaUnidade(
    cargoId ? ref.porCargo.get(cargoId) ?? [] : [],
    unidadeId,
    unidadeId ? ref.patronalPorUnidade.get(unidadeId) ?? null : null,
    data,
  ).valor;
}
