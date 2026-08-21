import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type Beneficio = Database["public"]["Tables"]["dp_beneficios"]["Row"];
export type ColaboradorBeneficio =
  Database["public"]["Tables"]["dp_colaborador_beneficios"]["Row"] & {
    colaborador_nome?: string | null;
    beneficio_nome?: string | null;
    beneficio_tipo?: BeneficioTipo | null;
  };

export type BeneficioTipo = Database["public"]["Enums"]["dp_beneficio_tipo"];
export type FolhaTipo = Database["public"]["Enums"]["dp_folha_tipo"];

export type BeneficioInput = {
  id?: string;
  nome: string;
  tipo: BeneficioTipo;
  valor_padrao: number;
  desconto_percentual: number;
  folha_tipo: FolhaTipo | null;
  descricao: string | null;
  ativo: boolean;
};

export type ColaboradorBeneficioInput = {
  id?: string;
  colaborador_id: string;
  beneficio_id: string;
  valor: number;
  desconto_valor: number;
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
  observacao: string | null;
};

/**
 * Catálogo de benefícios da empresa e ficha de benefícios por colaborador,
 * com geração das linhas correspondentes na folha de pagamento.
 */
export function useDpBeneficios(colaboradorFilter = "todos") {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const invalidate = (...keys: string[]) => {
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const requireCompany = () => {
    if (!selectedCompanyId) throw new Error("Empresa não selecionada");
    return selectedCompanyId;
  };

  const beneficiosQ = useQuery({
    queryKey: ["dp_beneficios", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_beneficios")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Beneficio[];
    },
  });

  const atribuicoesQ = useQuery({
    queryKey: ["dp_colaborador_beneficios", selectedCompanyId, colaboradorFilter],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_colaborador_beneficios")
        .select("*, dp_colaboradores(nome), dp_beneficios(nome, tipo)")
        .eq("company_id", selectedCompanyId!)
        .order("data_inicio", { ascending: false });
      if (colaboradorFilter !== "todos") q = q.eq("colaborador_id", colaboradorFilter);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        colaborador_nome: r.dp_colaboradores?.nome ?? null,
        beneficio_nome: r.dp_beneficios?.nome ?? null,
        beneficio_tipo: r.dp_beneficios?.tipo ?? null,
      })) as ColaboradorBeneficio[];
    },
  });

  const periodosQ = useQuery({
    queryKey: ["dp_folha_periodos_beneficios", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folha_periodos")
        .select("id, competencia, tipo, status")
        .eq("company_id", selectedCompanyId!)
        .order("competencia", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        competencia: string;
        tipo: string;
        status: string;
      }[];
    },
  });

  const saveBeneficio = useMutation({
    /** Retorna o registro salvo — o cadastro do colaborador usa o id para já marcar o benefício novo. */
    mutationFn: async (input: BeneficioInput): Promise<Beneficio> => {
      const company_id = requireCompany();
      const { id, ...rest } = input;
      if (id) {
        const { data, error } = await supabase
          .from("dp_beneficios")
          .update(rest)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw error;
        return data as Beneficio;
      }
      const { data, error } = await supabase
        .from("dp_beneficios")
        .insert({ ...rest, company_id })
        .select("*")
        .single();
      if (error) throw error;
      return data as Beneficio;
    },

    onSuccess: () => {
      toast.success("Benefício salvo");
      invalidate("dp_beneficios", "dp_colaborador_beneficios");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar benefício"),
  });

  const deleteBeneficio = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_beneficios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Benefício excluído");
      invalidate("dp_beneficios", "dp_colaborador_beneficios");
    },
    onError: () =>
      toast.error("Não foi possível excluir. Existem colaboradores vinculados a este benefício."),
  });

  const saveAtribuicao = useMutation({
    mutationFn: async (input: ColaboradorBeneficioInput) => {
      const company_id = requireCompany();
      const { id, ...rest } = input;
      if (id) {
        const { error } = await supabase.from("dp_colaborador_beneficios").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("dp_colaborador_beneficios")
          .insert({ ...rest, company_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Benefício do colaborador salvo");
      invalidate("dp_colaborador_beneficios");
    },
    onError: (e: any) =>
      toast.error(
        e?.code === "23505"
          ? "Este benefício já está atribuído ao colaborador com a mesma data de início."
          : e.message ?? "Erro ao salvar",
      ),
  });

  const deleteAtribuicao = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_colaborador_beneficios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vínculo removido");
      invalidate("dp_colaborador_beneficios");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });

  const gerarLancamentos = useMutation({
    mutationFn: async (periodoId: string) => {
      const { data, error } = await supabase.rpc("dp_beneficios_gerar_lancamentos", {
        _periodo_id: periodoId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (n) => {
      toast.success(
        n > 0 ? `${n} lançamento(s) gerado(s) na folha` : "Nenhum lançamento novo a gerar",
      );
      qc.invalidateQueries({ queryKey: ["dp_folha_lancamentos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao gerar lançamentos"),
  });

  return {
    beneficios: beneficiosQ.data ?? [],
    atribuicoes: atribuicoesQ.data ?? [],
    periodos: periodosQ.data ?? [],
    isLoading: beneficiosQ.isLoading || atribuicoesQ.isLoading,
    isError: beneficiosQ.isError || atribuicoesQ.isError,
    refetchAll: () => {
      beneficiosQ.refetch();
      atribuicoesQ.refetch();
    },
    saveBeneficio,
    deleteBeneficio,
    saveAtribuicao,
    deleteAtribuicao,
    gerarLancamentos,
  };
}
