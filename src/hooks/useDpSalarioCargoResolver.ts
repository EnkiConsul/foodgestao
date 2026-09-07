import { useMemo } from "react";
import { useDpCargoSalarios, useDpPatronalPorUnidade } from "@/hooks/useDpCadastros";
import {
  agruparPisosPorCargo,
  salarioCargoNaUnidade,
  type CargoSalarioLinha,
} from "@/lib/dp/cargoSalarios";

/**
 * Resolve o salário de referência do cargo na unidade (ajuste da unidade →
 * piso do sindicato patronal), pronto para a regra de completude do cadastro.
 * Retorna uma função memoizada: mesmo (cargo, unidade) resolve uma vez só.
 */
export function useDpSalarioCargoResolver() {
  const todosPisos = useDpCargoSalarios();
  const patronalPorUnidade = useDpPatronalPorUnidade();

  return useMemo(() => {
    const pisosPorCargo = agruparPisosPorCargo((todosPisos.data ?? []) as CargoSalarioLinha[]);
    const patronais = patronalPorUnidade.data ?? {};
    const cache = new Map<string, number | null>();

    return (cargoId?: string | null, unidadeId?: string | null): number | null => {
      if (!cargoId || !unidadeId) return null;
      const chave = `${cargoId}|${unidadeId}`;
      if (cache.has(chave)) return cache.get(chave) ?? null;
      const r = salarioCargoNaUnidade(
        pisosPorCargo.get(cargoId) ?? [],
        unidadeId,
        patronais[unidadeId]?.id ?? null,
        undefined,
        // Piso já negociado com vigência futura continua sendo referência.
        { aceitarFuturo: true },
      );
      cache.set(chave, r.valor);
      return r.valor;
    };
  }, [todosPisos.data, patronalPorUnidade.data]);
}
