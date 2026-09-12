import { toUpperCadastro } from "@/lib/text/upperCadastro";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import { resolverPendencias } from "@/lib/dp/pendencias-resolver";

export type DpColaborador = Database["public"]["Tables"]["dp_colaboradores"]["Row"] & {
  cargo_nome?: string | null;
  unidade_nome?: string | null;
  setor_nome?: string | null;
  setor_ativo?: boolean | null;
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
        .select("*, dp_cargos(nome), dp_unidades(nome), dp_setores(nome, ativo)")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        cargo_nome: r.dp_cargos?.nome ?? r.cargo ?? null,
        unidade_nome: r.dp_unidades?.nome ?? null,
        setor_nome: r.dp_setores?.nome ?? null,
        setor_ativo: r.dp_setores?.ativo ?? null,
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
      // Cadastro estrutural: nomes gravados em CAIXA ALTA (padrão da ficha).
      const payload = {
        ...input,
        nome: toUpperCadastro(input.nome),
        ...(input.nome_mae !== undefined ? { nome_mae: toUpperCadastro(input.nome_mae) } : {}),
        ...(input.nome_pai !== undefined ? { nome_pai: toUpperCadastro(input.nome_pai) } : {}),
        company_id: selectedCompanyId,
      } as DpColaboradorInsert;
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
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: DesligamentoInput): Promise<DesligamentoResult> => {
      const { data, error } = await supabase.rpc("dp_desligar_colaborador", {
        p_colaborador_id: input.id,
        p_data_desligamento: input.data_desligamento,
        p_motivo: (input.motivo ?? null) as any,
        p_observacao: input.observacao ?? undefined,
        p_elegibilidade: (input.elegibilidade ?? null) as any,
      });
      if (error) throw error;
      return (data ?? {}) as unknown as DesligamentoResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      void resolverPendencias(qc, { companyId: selectedCompanyId });
    },
  });
}

/** Edita apenas os dados do desligamento (não cancela folgas/solicitações novamente). */
export function useEditarDesligamento() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: DesligamentoInput) => {
      const { error } = await supabase.rpc("dp_editar_desligamento", {
        p_colaborador_id: input.id,
        p_data_desligamento: input.data_desligamento,
        p_motivo: (input.motivo ?? null) as any,
        p_observacao: input.observacao ?? undefined,
        p_elegibilidade: (input.elegibilidade ?? null) as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      void resolverPendencias(qc, { companyId: selectedCompanyId });
    },
  });
}

/**
 * Recontratação: novo vínculo para quem já trabalhou na empresa. Diferente de
 * reintegrar (que desfaz um desligamento registrado por engano), a data de
 * admissão passa a ser a nova e o vínculo anterior fica no histórico.
 */
export function useRecontratarDpColaborador() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      data_admissao: string;
      regime?: string | null;
      forma_pagamento?: string | null;
      cargo_id?: string | null;
      unidade_id?: string | null;
      setor_id?: string | null;
      salario_base?: number | null;
      valor_hora?: number | null;
      matricula?: string | null;
      justificativa?: string | null;
    }) => {
      const { error } = await (supabase.rpc as any)("dp_recontratar_colaborador", {
        p_colaborador_id: input.id,
        p_data_admissao: input.data_admissao,
        p_regime: input.regime ?? null,
        p_forma_pagamento: input.forma_pagamento ?? null,
        p_cargo_id: input.cargo_id ?? null,
        p_unidade_id: input.unidade_id ?? null,
        p_setor_id: input.setor_id ?? null,
        p_salario_base: input.salario_base ?? null,
        p_valor_hora: input.valor_hora ?? null,
        p_matricula: input.matricula ?? null,
        p_justificativa: input.justificativa ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      qc.invalidateQueries({ queryKey: ["dp_colaborador_condicoes"] });
      void resolverPendencias(qc, { companyId: selectedCompanyId });
    },
  });
}

export function useReintegrarDpColaborador() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("dp_reintegrar_colaborador", { p_colaborador_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      void resolverPendencias(qc, { companyId: selectedCompanyId });
    },
  });
}

