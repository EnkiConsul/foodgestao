import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpSalarioFamiliaConfig } from "@/hooks/useDpSalarioFamiliaConfig";
import {
  tabelaSalarioFamiliaVigente,
  type SalarioFamiliaTabela,
} from "@/lib/dp/salarioFamilia";

/**
 * Histórico das tabelas do salário-família (cada reajuste com sua data de
 * início). A tabela vigente é espelhada em `dp_config_dp`, que é o que os
 * cálculos e pendências leem.
 */
export function useDpSalarioFamiliaTabelas() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const { salvar: salvarConfig } = useDpSalarioFamiliaConfig();
  const key = ["dp_salario_familia_tabelas", selectedCompanyId];

  const query = useQuery({
    queryKey: key,
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<SalarioFamiliaTabela[]> => {
      const { data, error } = await supabase
        .from("dp_salario_familia_tabelas")
        .select("id, vigencia_inicio, cota, teto")
        .eq("company_id", selectedCompanyId!)
        .is("removido_em", null)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, cota: Number(r.cota), teto: Number(r.teto) }));
    },
  });

  /** Recalcula a vigente e grava no registro da empresa. */
  const sincronizar = async () => {
    const { data, error } = await supabase
      .from("dp_salario_familia_tabelas")
      .select("id, vigencia_inicio, cota, teto")
      .eq("company_id", selectedCompanyId!)
      .is("removido_em", null);
    if (error) throw error;
    const lista = (data ?? []).map((r) => ({ ...r, cota: Number(r.cota), teto: Number(r.teto) }));
    const vig = tabelaSalarioFamiliaVigente(lista);
    await salvarConfig(
      vig
        ? { cota: vig.cota, teto: vig.teto, vigencia: vig.vigencia_inicio, confirmar: true }
        : { cota: null, teto: null, vigencia: null },
    );
  };

  const salvar = useMutation({
    mutationFn: async (input: { id?: string | null; vigencia_inicio: string; cota: number; teto: number }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const dados = { vigencia_inicio: input.vigencia_inicio, cota: input.cota, teto: input.teto };
      const { error } = input.id
        ? await supabase.from("dp_salario_familia_tabelas").update(dados).eq("id", input.id)
        : await supabase
            .from("dp_salario_familia_tabelas")
            .insert({ ...dados, company_id: selectedCompanyId });
      if (error) {
        if (error.code === "23505")
          throw new Error("Já existe uma tabela com essa data de início. Edite a existente.");
        throw error;
      }
      await sincronizar();
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("dp_salario_familia_tabelas")
        .update({ removido_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await sincronizar();
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  return {
    tabelas: query.data ?? [],
    isLoading: query.isLoading,
    salvar: salvar.mutateAsync,
    salvando: salvar.isPending || remover.isPending,
    remover: remover.mutateAsync,
  };
}
