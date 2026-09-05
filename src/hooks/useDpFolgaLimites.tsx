import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { RegraLimiteFolga, RegraLimiteFolgaBase, TipoRegraFolga } from "@/lib/dp/folga-limites";


export type RegraLimiteInput = {
  /** Identificador temporário usado no modo rascunho do formulário de unidade. */
  clientId?: string;
  id?: string;
  tipo: TipoRegraFolga;
  nome: string | null;
  unidade_id: string;
  dia_semana: number | null;
  maximo: number;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  ativo: boolean;
  cargo_ids: string[];
  colaborador_ids: string[];
};


/**
 * Cadastro único das regras de folga (quantidade, cargo e quem não folga junto).
 * Toda regra pertence a uma unidade; `unidadeId` define o recorte lido e gravado.
 */
export function useDpFolgaLimites(unidadeId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_folga_limite_regras", selectedCompanyId, unidadeId ?? null],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<RegraLimiteFolga[]> => {
      let q = supabase
        .from("dp_folga_limite_regras")
        .select(
          "id, tipo, nome, unidade_id, dia_semana, maximo, vigencia_inicio, vigencia_fim, ativo, " +
            "dp_folga_limite_regra_cargos(cargo_id), dp_folga_limite_regra_colaboradores(colaborador_id)",
        )
        .eq("company_id", selectedCompanyId!);
      // Sem unidade = visão consolidada da empresa (todas as unidades).
      if (unidadeId) q = q.eq("unidade_id", unidadeId);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;

      return (data ?? []).map((r: any) => ({
        id: r.id,
        tipo: (r.tipo ?? "quantidade") as TipoRegraFolga,
        nome: r.nome ?? null,
        unidade_id: r.unidade_id,
        dia_semana: r.dia_semana,
        maximo: r.maximo,
        vigencia_inicio: r.vigencia_inicio,
        vigencia_fim: r.vigencia_fim,
        ativo: r.ativo ?? true,
        cargo_ids: (r.dp_folga_limite_regra_cargos ?? []).map((c: any) => c.cargo_id),
        colaborador_ids: (r.dp_folga_limite_regra_colaboradores ?? []).map(
          (c: any) => c.colaborador_id,
        ),
      }));
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_folga_limite_regras"] });
  };

  /** Conta quantas regras de folga cada unidade da empresa possui. */
  const contagem = useQuery({
    queryKey: ["dp_folga_limite_regras_contagem", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("dp_folga_limite_regras")
        .select("unidade_id")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { unidade_id: string }) => {
        map[r.unidade_id] = (map[r.unidade_id] ?? 0) + 1;
      });
      return map;
    },
  });

  /** Grava os cargos e as pessoas vinculadas a uma regra (substituindo os anteriores). */

  const gravarVinculos = async (
    regraId: string,
    cargos: string[],
    pessoas: string[],
  ) => {
    if (cargos.length > 0) {
      const { error } = await supabase
        .from("dp_folga_limite_regra_cargos")
        .insert(cargos.map((cargo_id) => ({ regra_id: regraId, cargo_id })));
      if (error) throw error;
    }
    if (pessoas.length > 0) {
      const { error } = await supabase
        .from("dp_folga_limite_regra_colaboradores")
        .insert(pessoas.map((colaborador_id) => ({ regra_id: regraId, colaborador_id })));
      if (error) throw error;
    }
  };

  const salvar = useMutation({
    mutationFn: async (input: RegraLimiteInput) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      if (!input.unidade_id) throw new Error("Selecione uma unidade.");
      const payload = {
        company_id: selectedCompanyId,
        tipo: input.tipo,
        nome: input.nome,
        unidade_id: input.unidade_id,
        dia_semana: input.dia_semana,
        maximo: input.tipo === "colaboradores" ? 0 : input.maximo,
        vigencia_inicio: input.vigencia_inicio,
        vigencia_fim: input.vigencia_fim,
        ativo: input.ativo,
      };

      let regraId = input.id;
      if (regraId) {
        const { error } = await supabase
          .from("dp_folga_limite_regras")
          .update(payload)
          .eq("id", regraId);
        if (error) throw error;
        const { error: delErr } = await supabase
          .from("dp_folga_limite_regra_cargos")
          .delete()
          .eq("regra_id", regraId);
        if (delErr) throw delErr;
        const { error: delColabErr } = await supabase
          .from("dp_folga_limite_regra_colaboradores")
          .delete()
          .eq("regra_id", regraId);
        if (delColabErr) throw delColabErr;
      } else {
        const { data, error } = await supabase
          .from("dp_folga_limite_regras")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        regraId = data.id;
      }

      await gravarVinculos(
        regraId!,
        input.tipo === "colaboradores" ? [] : input.cargo_ids,
        input.tipo === "colaboradores" ? input.colaborador_ids : [],
      );
      return regraId!;
    },
    onSuccess: invalidate,
  });

  /** Cria cópias independentes de uma regra nas unidades escolhidas. */
  const replicar = useMutation({
    mutationFn: async (params: { regra: RegraLimiteFolgaBase; unidadeIds: string[] }) => {

      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const { regra, unidadeIds } = params;
      const alvos = unidadeIds.filter((id) => id && id !== regra.unidade_id);
      for (const alvo of alvos) {
        const { data, error } = await supabase
          .from("dp_folga_limite_regras")
          .insert({
            company_id: selectedCompanyId,
            tipo: regra.tipo,
            nome: regra.nome,
            unidade_id: alvo,
            dia_semana: regra.dia_semana,
            maximo: regra.maximo,
            vigencia_inicio: regra.vigencia_inicio,
            vigencia_fim: regra.vigencia_fim,
            ativo: regra.ativo,
          })
          .select("id")
          .single();
        if (error) throw error;
        await gravarVinculos(data.id, regra.cargo_ids, regra.colaborador_ids);
      }
      return alvos.length;
    },
    onSuccess: invalidate,
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_folga_limite_regras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Remove todas as regras de folga de uma unidade (usado no "Limpar"). */
  const excluirTodasDaUnidade = useMutation({
    mutationFn: async (unidadeId: string) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const { error } = await supabase
        .from("dp_folga_limite_regras")
        .delete()
        .eq("company_id", selectedCompanyId)
        .eq("unidade_id", unidadeId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const alternarAtivo = useMutation({
    mutationFn: async (params: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("dp_folga_limite_regras")
        .update({ ativo: params.ativo })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Grava várias regras de uma vez, mantendo os vínculos de cada uma. */
  const salvarMuitas = useMutation({
    mutationFn: async (inputs: RegraLimiteInput[]) => {
      for (const input of inputs) {
        await salvar.mutateAsync(input);
      }
    },
    onSuccess: invalidate,
  });

  return {
    regras: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    salvar,
    salvarMuitas,
    replicar,
    excluir,
    excluirTodasDaUnidade,
    alternarAtivo,
    contagem: contagem.data ?? {},
    contagemIsLoading: contagem.isLoading,
  };
}
