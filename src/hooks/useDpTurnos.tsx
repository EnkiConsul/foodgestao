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

export function useDpTurnos(unidadeId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

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
    mutationFn: async (form: DpTurnoForm) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const { data, error } = await supabase
        .from("dp_turnos")
        .insert({ company_id: selectedCompanyId, ...camposTurno(form) })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  /** Edita o turno no lugar — aplica-se a todas as escalas ainda não publicadas. */
  const atualizar = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: DpTurnoForm }) => {
      const { error } = await supabase.from("dp_turnos").update(camposTurno(form)).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /**
   * Cria uma nova versão do turno preservando o histórico:
   * o turno anterior é desativado e encerrado, e a nova versão aponta para a origem.
   */
  const novaVersao = useMutation({
    mutationFn: async ({ atual, form }: { atual: DpTurnoRow; form: DpTurnoForm }) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const hoje = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("dp_turnos")
        .insert({
          company_id: selectedCompanyId,
          ...camposTurno(form),
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
