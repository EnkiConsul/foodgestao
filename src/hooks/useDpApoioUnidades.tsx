import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

/**
 * Disponibilidade explícita para atuar como apoio/folguista em outra unidade.
 * Não altera vínculo, contrato, remuneração nem a unidade principal da pessoa:
 * é apenas uma permissão operacional de escala naquela unidade.
 */
export interface ApoioUnidade {
  id: string;
  pessoa_apoio_id: string | null;
  colaborador_id: string | null;
  unidade_id: string;
  /** Cargo exercido nessa unidade (pode diferir do habitual). */
  cargo_id: string | null;
  /** Setor dentro dessa unidade. */
  setor_id: string | null;
  ativo: boolean;
  observacao: string | null;
  /**
   * Participação societária: o sócio pode integrar a sociedade de mais de uma
   * unidade, com pró-labore e horário próprios em cada uma.
   */
  socio: boolean;
  pro_labore: number | null;
  horario: HorarioUnidadeJson[] | null;
}

/** Horário do sócio naquela unidade (um item por dia da semana). */
export interface HorarioUnidadeJson {
  dow: number;
  trabalha: boolean;
  entrada?: string | null;
  saida?: string | null;
  intervalo_minutos?: number | null;
}

export interface ApoioUnidadeInput
  extends Omit<ApoioUnidade, "id" | "ativo" | "socio" | "pro_labore" | "horario"> {
  id?: string;
  ativo?: boolean;
  socio?: boolean;
  pro_labore?: number | null;
  horario?: HorarioUnidadeJson[] | null;
}

const COLS =
  "id, pessoa_apoio_id, colaborador_id, unidade_id, cargo_id, setor_id, ativo, observacao, socio, pro_labore, horario";

/**
 * Disponibilidades da empresa. Filtra por pessoa quando informado; sem filtro,
 * devolve todas para montar a lista de apoio de uma unidade na rotina.
 */
export function useDpApoioUnidades(opts?: {
  pessoaApoioId?: string | null;
  colaboradorId?: string | null;
  apenasAtivas?: boolean;
  /** Somente participações societárias. */
  apenasSocio?: boolean;
}) {
  const { selectedCompanyId } = useCompanyContext();
  const pessoaApoioId = opts?.pessoaApoioId ?? null;
  const colaboradorId = opts?.colaboradorId ?? null;
  const apenasAtivas = opts?.apenasAtivas ?? false;
  return useQuery({
    queryKey: [
      "dp_apoio_unidades", selectedCompanyId, pessoaApoioId, colaboradorId, apenasAtivas,
      opts?.apenasSocio ?? false,
    ],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_apoio_unidades")
        .select(COLS)
        .eq("company_id", selectedCompanyId!);
      if (pessoaApoioId) q = q.eq("pessoa_apoio_id", pessoaApoioId);
      if (colaboradorId) q = q.eq("colaborador_id", colaboradorId);
      if (apenasAtivas) q = q.eq("ativo", true);
      if (opts?.apenasSocio) q = q.eq("socio", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ApoioUnidade[];
    },
  });
}

/** Mensagens amigáveis para as validações de empresa/setor do banco. */
export function mensagemApoioUnidade(erro: unknown): string {
  const msg = erro instanceof Error ? erro.message : String(erro);
  if (msg.includes("APOIO_SETOR_INVALIDO")) return "O setor escolhido não pertence a essa unidade.";
  if (msg.includes("OUTRA_EMPRESA")) return "Unidade, cargo ou pessoa não pertencem a esta empresa.";
  if (msg.includes("dp_apoio_unidades_apoio_uk") || msg.includes("dp_apoio_unidades_colab_uk"))
    return "Essa pessoa já tem disponibilidade cadastrada nessa unidade.";
  return "Não foi possível salvar a disponibilidade.";
}

export function useSalvarDpApoioUnidade() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApoioUnidadeInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        company_id: selectedCompanyId!,
        pessoa_apoio_id: input.pessoa_apoio_id ?? null,
        colaborador_id: input.colaborador_id ?? null,
        unidade_id: input.unidade_id,
        cargo_id: input.cargo_id ?? null,
        setor_id: input.setor_id ?? null,
        ativo: input.ativo ?? true,
        observacao: input.observacao?.trim() || null,
        socio: input.socio ?? false,
        pro_labore: input.pro_labore ?? null,
        horario: (input.horario ?? null) as never,
      };
      if (input.id) {
        const { error } = await supabase
          .from("dp_apoio_unidades")
          .update(payload)
          .eq("id", input.id)
          .eq("company_id", selectedCompanyId!);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("dp_apoio_unidades")
        .insert({ ...payload, criado_por: userData.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_apoio_unidades"] }),
  });
}

/**
 * Remove a disponibilidade. Registros antigos da rotina continuam intactos:
 * o histórico do dia guarda unidade, cargo e setor efetivamente usados.
 */
export function useExcluirDpApoioUnidade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_apoio_unidades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_apoio_unidades"] }),
  });
}
