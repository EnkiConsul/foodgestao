import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type ExameAso = Database["public"]["Tables"]["dp_exames_aso"]["Row"] & {
  colaborador_nome?: string | null;
};
export type Epi = Database["public"]["Tables"]["dp_epis"]["Row"];
export type EpiEntrega = Database["public"]["Tables"]["dp_epis_entregas"]["Row"] & {
  colaborador_nome?: string | null;
  epi_nome?: string | null;
};
export type Treinamento = Database["public"]["Tables"]["dp_treinamentos"]["Row"];
export type TreinamentoParticipacao =
  Database["public"]["Tables"]["dp_treinamentos_participacoes"]["Row"] & {
    colaborador_nome?: string | null;
    treinamento_nome?: string | null;
  };

export type ExameTipo = Database["public"]["Enums"]["dp_exame_tipo"];
export type ExameResultado = Database["public"]["Enums"]["dp_exame_resultado"];
export type TreinamentoStatus = Database["public"]["Enums"]["dp_treinamento_status"];

export type ExameInput = {
  id?: string;
  colaborador_id: string;
  tipo: ExameTipo;
  data_realizado: string | null;
  data_vencimento: string | null;
  resultado: ExameResultado;
  clinica: string | null;
  medico: string | null;
  restricoes: string | null;
  observacao: string | null;
};

export type EpiInput = {
  id?: string;
  nome: string;
  ca: string | null;
  validade_dias: number | null;
  descricao: string | null;
  ativo: boolean;
};

export type EpiEntregaInput = {
  id?: string;
  colaborador_id: string;
  epi_id: string;
  quantidade: number;
  data_entrega: string;
  data_troca_prevista: string | null;
  data_devolucao: string | null;
  recebido: boolean;
  observacao: string | null;
};

export type TreinamentoInput = {
  id?: string;
  nome: string;
  descricao: string | null;
  carga_horaria: number | null;
  validade_meses: number | null;
  obrigatorio: boolean;
  ativo: boolean;
};

export type ParticipacaoInput = {
  id?: string;
  colaborador_id: string;
  treinamento_id: string;
  status: TreinamentoStatus;
  data_conclusao: string | null;
  data_vencimento: string | null;
  nota: number | null;
  observacao: string | null;
};

/**
 * Dados e mutations de conformidade e saúde ocupacional:
 * exames ASO, catálogo/entregas de EPI e catálogo/participações de treinamento.
 */
export function useDpConformidade(colaboradorFilter = "todos") {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const invalidate = (...keys: string[]) => {
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
  };

  const examesQ = useQuery({
    queryKey: ["dp_exames_aso", selectedCompanyId, colaboradorFilter],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_exames_aso")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("data_vencimento", { ascending: true, nullsFirst: false });
      if (colaboradorFilter !== "todos") q = q.eq("colaborador_id", colaboradorFilter);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        colaborador_nome: r.dp_colaboradores?.nome ?? null,
      })) as ExameAso[];
    },
  });

  const episQ = useQuery({
    queryKey: ["dp_epis", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_epis")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Epi[];
    },
  });

  const entregasQ = useQuery({
    queryKey: ["dp_epis_entregas", selectedCompanyId, colaboradorFilter],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_epis_entregas")
        .select("*, dp_colaboradores(nome), dp_epis(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("data_entrega", { ascending: false });
      if (colaboradorFilter !== "todos") q = q.eq("colaborador_id", colaboradorFilter);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        colaborador_nome: r.dp_colaboradores?.nome ?? null,
        epi_nome: r.dp_epis?.nome ?? null,
      })) as EpiEntrega[];
    },
  });

  const treinamentosQ = useQuery({
    queryKey: ["dp_treinamentos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_treinamentos")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Treinamento[];
    },
  });

  const participacoesQ = useQuery({
    queryKey: ["dp_treinamentos_participacoes", selectedCompanyId, colaboradorFilter],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_treinamentos_participacoes")
        .select("*, dp_colaboradores(nome), dp_treinamentos(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("data_vencimento", { ascending: true, nullsFirst: false });
      if (colaboradorFilter !== "todos") q = q.eq("colaborador_id", colaboradorFilter);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        colaborador_nome: r.dp_colaboradores?.nome ?? null,
        treinamento_nome: r.dp_treinamentos?.nome ?? null,
      })) as TreinamentoParticipacao[];
    },
  });

  const requireCompany = () => {
    if (!selectedCompanyId) throw new Error("Empresa não selecionada");
    return selectedCompanyId;
  };

  const saveExame = useMutation({
    mutationFn: async (input: ExameInput) => {
      const company_id = requireCompany();
      const { id, ...rest } = input;
      if (id) {
        const { error } = await supabase.from("dp_exames_aso").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_exames_aso").insert({ ...rest, company_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Exame salvo");
      invalidate("dp_exames_aso");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar exame"),
  });

  const deleteExame = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_exames_aso").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exame excluído");
      invalidate("dp_exames_aso");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });

  const saveEpi = useMutation({
    mutationFn: async (input: EpiInput) => {
      const company_id = requireCompany();
      const { id, ...rest } = input;
      if (id) {
        const { error } = await supabase.from("dp_epis").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_epis").insert({ ...rest, company_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("EPI salvo");
      invalidate("dp_epis");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar EPI"),
  });

  const deleteEpi = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_epis").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("EPI excluído");
      invalidate("dp_epis");
    },
    onError: () => toast.error("Não foi possível excluir. Existem entregas vinculadas a este EPI."),
  });

  const saveEntrega = useMutation({
    mutationFn: async (input: EpiEntregaInput) => {
      const company_id = requireCompany();
      const { id, recebido, ...rest } = input;
      const payload = {
        ...rest,
        recebido_em: recebido ? new Date().toISOString() : null,
      };
      if (id) {
        const { error } = await supabase.from("dp_epis_entregas").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_epis_entregas").insert({ ...payload, company_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Entrega registrada");
      invalidate("dp_epis_entregas");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao registrar entrega"),
  });

  const deleteEntrega = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_epis_entregas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrega excluída");
      invalidate("dp_epis_entregas");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });

  const saveTreinamento = useMutation({
    mutationFn: async (input: TreinamentoInput) => {
      const company_id = requireCompany();
      const { id, ...rest } = input;
      if (id) {
        const { error } = await supabase.from("dp_treinamentos").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_treinamentos").insert({ ...rest, company_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Treinamento salvo");
      invalidate("dp_treinamentos");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar treinamento"),
  });

  const deleteTreinamento = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_treinamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Treinamento excluído");
      invalidate("dp_treinamentos", "dp_treinamentos_participacoes");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });

  const saveParticipacao = useMutation({
    mutationFn: async (input: ParticipacaoInput) => {
      const company_id = requireCompany();
      const { id, ...rest } = input;
      if (id) {
        const { error } = await supabase
          .from("dp_treinamentos_participacoes")
          .update(rest)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("dp_treinamentos_participacoes")
          .insert({ ...rest, company_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Participação salva");
      invalidate("dp_treinamentos_participacoes");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar participação"),
  });

  const deleteParticipacao = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_treinamentos_participacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Participação excluída");
      invalidate("dp_treinamentos_participacoes");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });

  return {
    exames: examesQ.data ?? [],
    examesLoading: examesQ.isLoading,
    epis: episQ.data ?? [],
    episLoading: episQ.isLoading,
    entregas: entregasQ.data ?? [],
    entregasLoading: entregasQ.isLoading,
    treinamentos: treinamentosQ.data ?? [],
    treinamentosLoading: treinamentosQ.isLoading,
    participacoes: participacoesQ.data ?? [],
    participacoesLoading: participacoesQ.isLoading,
    isError:
      examesQ.isError || episQ.isError || entregasQ.isError ||
      treinamentosQ.isError || participacoesQ.isError,
    refetchAll: () => {
      examesQ.refetch();
      episQ.refetch();
      entregasQ.refetch();
      treinamentosQ.refetch();
      participacoesQ.refetch();
    },
    saveExame,
    deleteExame,
    saveEpi,
    deleteEpi,
    saveEntrega,
    deleteEntrega,
    saveTreinamento,
    deleteTreinamento,
    saveParticipacao,
    deleteParticipacao,
  };
}
