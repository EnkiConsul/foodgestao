import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type DpColaborador = Database["public"]["Tables"]["dp_colaboradores"]["Row"] & {
  cargo_nome?: string | null;
  unidade_nome?: string | null;
};
export type DpColaboradorInsert = Database["public"]["Tables"]["dp_colaboradores"]["Insert"];

export function useDpColaboradores() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_colaboradores", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("*, dp_cargos(nome), dp_unidades(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        cargo_nome: r.dp_cargos?.nome ?? r.cargo ?? null,
        unidade_nome: r.dp_unidades?.nome ?? null,
      })) as DpColaborador[];
    },
  });
}

export function useUpsertDpColaborador() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: Partial<DpColaboradorInsert> & { id?: string; nome: string }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const payload = { ...input, company_id: selectedCompanyId } as DpColaboradorInsert;
      if (input.id) {
        const { error } = await supabase.from("dp_colaboradores").update(payload).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },

    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_colaboradores"] }),
  });
}

/**
 * Exclusão do cadastro com justificativa obrigatória. Não apaga o registro:
 * ele vai para a lixeira (7 dias) e pode ser restaurado.
 */
export function useDeleteDpColaborador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; motivo: string }) => {
      const { error } = await (supabase.rpc as any)("dp_excluir_colaborador", {
        p_colaborador_id: input.id,
        p_motivo: input.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      qc.invalidateQueries({ queryKey: ["dp_colaboradores_lixeira"] });
    },
  });
}

export type DpColaboradorLixeira = {
  id: string;
  nome: string;
  cargo_nome: string | null;
  unidade_nome: string | null;
  matricula: string | null;
  deleted_at: string;
  deleted_by: string | null;
  delete_reason: string | null;
  expira_em: string;
};

/** Lixeira de colaboradores da empresa ativa (itens vencidos são purgados no servidor). */
export function useDpColaboradoresLixeira() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_colaboradores_lixeira", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("dp_colaboradores_lixeira", {
        p_company_id: selectedCompanyId,
      });
      if (error) throw error;
      return (data ?? []) as DpColaboradorLixeira[];
    },
  });
}

export function useRestaurarDpColaborador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.rpc as any)("dp_restaurar_colaborador", { p_colaborador_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      qc.invalidateQueries({ queryKey: ["dp_colaboradores_lixeira"] });
    },
  });
}

export function usePurgarDpColaborador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; motivo: string }) => {
      const { error } = await (supabase.rpc as any)("dp_purgar_colaborador", {
        p_colaborador_id: input.id,
        p_motivo: input.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_colaboradores_lixeira"] }),
  });
}

export type DesligamentoInput = {
  id: string;
  data_desligamento: string;
  motivo?: string | null;
  observacao?: string | null;
  elegibilidade?: string | null;
};

export type DesligamentoResult = {
  folgas_canceladas: number;
  solicitacoes_canceladas: number;
  trocas_canceladas: number;
  acesso_portal_ate: string | null;
};

export function useDesligarDpColaborador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DesligamentoInput): Promise<DesligamentoResult> => {
      const { data, error } = await supabase.rpc("dp_desligar_colaborador", {
        p_colaborador_id: input.id,
        p_data_desligamento: input.data_desligamento,
        p_motivo: (input.motivo ?? null) as any,
        p_observacao: input.observacao ?? null,
        p_elegibilidade: (input.elegibilidade ?? null) as any,
      });
      if (error) throw error;
      return (data ?? {}) as unknown as DesligamentoResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
    },
  });
}

/** Edita apenas os dados do desligamento (não cancela folgas/solicitações novamente). */
export function useEditarDesligamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DesligamentoInput) => {
      const { error } = await supabase.rpc("dp_editar_desligamento", {
        p_colaborador_id: input.id,
        p_data_desligamento: input.data_desligamento,
        p_motivo: (input.motivo ?? null) as any,
        p_observacao: input.observacao ?? null,
        p_elegibilidade: (input.elegibilidade ?? null) as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
    },
  });
}

export function useReintegrarDpColaborador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("dp_reintegrar_colaborador", { p_colaborador_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
    },
  });
}

