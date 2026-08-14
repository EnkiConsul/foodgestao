import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import { cargaLiquidaHoras, turnoViraODia } from "@/lib/dp/turno-utils";

export type DpTurnoRow = Database["public"]["Tables"]["dp_turnos"]["Row"];

export interface DpTurnoForm {
  nome: string;
  descricao: string | null;
  unidade_id: string | null;
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  categoria: string | null;
  cor: string | null;
  ativo: boolean;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
}

export const TURNO_FORM_DEFAULT: DpTurnoForm = {
  nome: "",
  descricao: null,
  unidade_id: null,
  entrada: "17:00",
  saida: "23:00",
  intervalo_minutos: 60,
  categoria: null,
  cor: null,
  ativo: true,
  vigencia_inicio: null,
  vigencia_fim: null,
};

export function turnoParaForm(t: DpTurnoRow): DpTurnoForm {
  return {
    nome: t.nome,
    descricao: t.descricao,
    unidade_id: t.unidade_id,
    entrada: (t.entrada ?? "").slice(0, 5),
    saida: (t.saida ?? "").slice(0, 5),
    intervalo_minutos: t.intervalo_minutos ?? 0,
    categoria: t.categoria,
    cor: t.cor,
    ativo: t.ativo,
    vigencia_inicio: t.vigencia_inicio,
    vigencia_fim: t.vigencia_fim,
  };
}

function camposTurno(form: DpTurnoForm) {
  return {
    nome: form.nome.trim(),
    descricao: form.descricao,
    unidade_id: form.unidade_id,
    entrada: form.entrada,
    saida: form.saida,
    intervalo_minutos: form.intervalo_minutos,
    termina_no_dia_seguinte: turnoViraODia(form.entrada, form.saida),
    carga_liquida_horas: cargaLiquidaHoras(form),
    categoria: form.categoria,
    cor: form.cor,
    ativo: form.ativo,
    vigencia_inicio: form.vigencia_inicio,
    vigencia_fim: form.vigencia_fim,
  };
}

export interface CienciaTurno {
  confirmada: boolean;
  justificativa?: string | null;
}

export function useDpTurnos(unidadeId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  /**
   * Registra a alteração do turno em dp_regras_historico. Substitui o controle
   * manual de vigência: toda mudança fica com autor, horário e antes/depois.
   */
  const registrarHistorico = async (params: {
    registro_id: string | null;
    valor_antigo: unknown | null;
    valor_novo: unknown;
    ciencia?: CienciaTurno | null;
  }) => {
    if (!selectedCompanyId) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user?.id) return;
    await supabase.from("dp_regras_historico").insert({
      company_id: selectedCompanyId,
      usuario_id: auth.user.id,
      tabela: "dp_turnos",
      registro_id: params.registro_id,
      valor_antigo: (params.valor_antigo ?? null) as never,
      valor_novo: params.valor_novo as never,
      justificativa: params.ciencia?.justificativa?.trim() || null,
      ciencia_confirmada: !!params.ciencia?.confirmada,
    });
  };

  const query = useQuery({
    queryKey: ["dp_turnos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DpTurnoRow[]> => {
      const { data, error } = await supabase
        .from("dp_turnos")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("ativo", { ascending: false })
        .order("entrada");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_turnos"] });
  };

  const criar = useMutation({
    mutationFn: async ({ form, ciencia }: { form: DpTurnoForm; ciencia?: CienciaTurno | null }) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const campos = camposTurno(form);
      const { data, error } = await supabase
        .from("dp_turnos")
        .insert({ company_id: selectedCompanyId, ...campos })
        .select("id")
        .single();
      if (error) throw error;
      await registrarHistorico({ registro_id: data.id, valor_antigo: null, valor_novo: campos, ciencia });
      return data;
    },
    onSuccess: invalidate,
  });

  /** Edita o turno no lugar — aplica-se a todas as escalas ainda não publicadas. */
  const atualizar = useMutation({
    mutationFn: async ({
      id, form, anterior, ciencia,
    }: { id: string; form: DpTurnoForm; anterior?: DpTurnoRow | null; ciencia?: CienciaTurno | null }) => {
      const campos = camposTurno(form);
      const { error } = await supabase.from("dp_turnos").update(campos).eq("id", id);
      if (error) throw error;
      await registrarHistorico({
        registro_id: id,
        valor_antigo: anterior ? camposTurno(turnoParaForm(anterior)) : null,
        valor_novo: campos,
        ciencia,
      });
    },
    onSuccess: invalidate,
  });

  /**
   * Cria uma nova versão do turno preservando o histórico:
   * o turno anterior é desativado e encerrado, e a nova versão aponta para a origem.
   * As datas de vigência são definidas pelo sistema — nunca informadas à mão.
   */
  const novaVersao = useMutation({
    mutationFn: async ({
      atual, form, ciencia,
    }: { atual: DpTurnoRow; form: DpTurnoForm; ciencia?: CienciaTurno | null }) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const hoje = new Date().toISOString().slice(0, 10);
      const campos = camposTurno(form);
      const { data, error } = await supabase
        .from("dp_turnos")
        .insert({
          company_id: selectedCompanyId,
          ...campos,
          versao: (atual.versao ?? 1) + 1,
          turno_origem_id: atual.turno_origem_id ?? atual.id,
          vigencia_inicio: form.vigencia_inicio ?? hoje,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: errFechar } = await supabase
        .from("dp_turnos")
        .update({ ativo: false, vigencia_fim: atual.vigencia_fim ?? hoje })
        .eq("id", atual.id);
      if (errFechar) throw errFechar;
      await registrarHistorico({
        registro_id: data.id,
        valor_antigo: camposTurno(turnoParaForm(atual)),
        valor_novo: { ...campos, versao: (atual.versao ?? 1) + 1, vigencia_inicio: form.vigencia_inicio ?? hoje },
        ciencia,
      });
      return data;
    },
    onSuccess: invalidate,
  });

  const alternarAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("dp_turnos").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_turnos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const turnos = (query.data ?? []).filter(
    (t) => !unidadeId || t.unidade_id === unidadeId || t.unidade_id === null,
  );

  return { ...query, turnos, criar, atualizar, novaVersao, alternarAtivo, remover };
}
