import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Dependente } from "@/lib/dp/salarioFamilia";

const COLUNAS =
  "id, colaborador_id, nome, data_nascimento, parentesco, cpf, deficiencia, laudo_validade, " +
  "conta_irrf, conta_salario_familia, vacinacao_em, frequencia_escolar_em, cessado_em, observacao";

export type DependenteInput = Omit<Dependente, "id" | "colaborador_id"> & { id?: string };

/** Dependentes de um colaborador (IRRF e salário-família). */
export function useDpDependentes(colaboradorId: string | null | undefined) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_dependentes", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async (): Promise<Dependente[]> => {
      const { data, error } = await supabase
        .from("dp_dependentes")
        .select(COLUNAS)
        .eq("colaborador_id", colaboradorId!)
        .order("data_nascimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Dependente[];
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["dp_dependentes", colaboradorId] });
    void qc.invalidateQueries({ queryKey: ["dp_dependentes_empresa", selectedCompanyId] });
    void qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
  };

  const salvar = useMutation({
    mutationFn: async (input: DependenteInput) => {
      if (!colaboradorId) throw new Error("Salve o colaborador antes de cadastrar dependentes");
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const payload = {
        company_id: selectedCompanyId,
        colaborador_id: colaboradorId,
        nome: input.nome.trim(),
        data_nascimento: input.data_nascimento || null,
        parentesco: input.parentesco,
        cpf: input.cpf?.replace(/\D/g, "") || null,
        deficiencia: input.deficiencia,
        laudo_validade: input.laudo_validade || null,
        conta_irrf: input.conta_irrf,
        conta_salario_familia: input.conta_salario_familia,
        vacinacao_em: input.vacinacao_em || null,
        frequencia_escolar_em: input.frequencia_escolar_em || null,
        cessado_em: input.cessado_em || null,
        observacao: input.observacao?.trim() || null,
      };
      if (input.id) {
        const { error } = await supabase.from("dp_dependentes").update(payload).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("dp_dependentes")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_dependentes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    dependentes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    salvar: salvar.mutateAsync,
    salvando: salvar.isPending,
    remover: remover.mutateAsync,
    removendo: remover.isPending,
  };
}

/** Todos os dependentes da empresa — usado nos alertas do quadro de pendências. */
export function useDpDependentesEmpresa() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_dependentes_empresa", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<(Dependente & { dp_colaboradores: { nome: string } | null })[]> => {
      const { data, error } = await supabase
        .from("dp_dependentes")
        .select(`${COLUNAS}, dp_colaboradores(nome)`)
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []) as unknown as (Dependente & {
        dp_colaboradores: { nome: string } | null;
      })[];
    },
  });
}
