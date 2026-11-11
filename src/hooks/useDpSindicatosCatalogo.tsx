import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpSindicatos } from "@/hooks/useDpCadastros";
import {
  catalogoIdDoValor, sugerirSindicatos,
  type LocalSindicato, type SindicatoCatalogo, type TipoSindicato, type VinculoCargoSindicato,
} from "@/lib/dp/sindicatos-catalogo";

/** Base única de sindicatos (compartilhada entre empresas, só leitura). */
export function useDpSindicatosCatalogo() {
  return useQuery({
    queryKey: ["dp_sindicatos_catalogo"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SindicatoCatalogo[]> => {
      const { data, error } = await supabase
        .from("dp_sindicatos_catalogo")
        .select("id, nome, tipo, cnpj, uf, municipios, contato_telefone, data_base_mes")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as SindicatoCatalogo[];
    },
  });
}

/** Sugestões da base ainda não usadas pela empresa, priorizando a cidade informada. */
export function useSugestoesSindicato(tipo: TipoSindicato, locais: LocalSindicato[]) {
  const catalogo = useDpSindicatosCatalogo();
  const sindicatos = useDpSindicatos();
  const chave = JSON.stringify(locais.map((l) => [l.cidade ?? "", l.uf ?? ""]));
  return useMemo(
    () =>
      sugerirSindicatos({
        itens: catalogo.data ?? [],
        tipo,
        locais,
        adotados: (sindicatos.data ?? []).map((s) => ({
          catalogo_id: (s as { catalogo_id?: string | null }).catalogo_id ?? null,
          cnpj: s.cnpj,
        })),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogo.data, sindicatos.data, tipo, chave],
  );
}

/**
 * Usa um sindicato da base na empresa (cria a cópia ou reaproveita a existente)
 * e devolve o id do sindicato da empresa. `resolver` aceita tanto o id de um
 * sindicato da empresa quanto o valor de uma opção da base.
 */
export function useAdotarSindicatoCatalogo() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const mutation = useMutation({
    mutationFn: async (catalogoId: string): Promise<string> => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { data, error } = await supabase.rpc("dp_sindicato_adotar", {
        p_company_id: selectedCompanyId,
        p_catalogo_id: catalogoId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dp_sindicatos"] });
      void qc.invalidateQueries({ queryKey: ["dp_sindicatos_catalogo"] });
    },
  });
  const resolver = async (valor: string): Promise<string> => {
    const catalogoId = catalogoIdDoValor(valor);
    return catalogoId ? mutation.mutateAsync(catalogoId) : valor;
  };
  return { ...mutation, resolver };
}

/** Vínculos cargo × sindicato laboral da empresa (para achar cargos sem enquadramento). */
export function useDpVinculosCargosLaborais() {
  const sindicatos = useDpSindicatos();
  const laboralIds = useMemo(
    () => (sindicatos.data ?? []).filter((s) => s.tipo === "laboral").map((s) => s.id).sort(),
    [sindicatos.data],
  );
  const query = useQuery({
    queryKey: ["dp_sindicato_vinculos", "cargos_laborais", laboralIds],
    enabled: sindicatos.isSuccess,
    queryFn: async (): Promise<VinculoCargoSindicato[]> => {
      if (laboralIds.length === 0) return [];
      const { data, error } = await supabase
        .from("dp_sindicato_cargos")
        .select("cargo_id, sindicato_id")
        .in("sindicato_id", laboralIds);
      if (error) throw error;
      return (data ?? []) as VinculoCargoSindicato[];
    },
  });
  return { ...query, laboralIds };
}

/** Enquadra no sindicato laboral todos os cargos ativos que ainda não têm laboral. */
export function useVincularCargosSemLaboral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sindicatoId: string): Promise<number> => {
      const { data, error } = await supabase.rpc("dp_sindicato_vincular_cargos_sem_laboral", {
        p_sindicato_id: sindicatoId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => {
      for (const key of ["dp_sindicatos", "dp_sindicato_vinculos", "dp_sindicato_do_cargo", "dp_cargos", "dp_sindicatos_catalogo"]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
