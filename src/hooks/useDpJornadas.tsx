import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import { calcularCargaDia, calcularCargaSemanal, viraODia, hhmm, type HorarioDia } from "@/lib/dp/jornada-utils";

export type DpJornadaRow = Database["public"]["Tables"]["dp_jornadas"]["Row"];
export type DpJornadaHorarioRow = Database["public"]["Tables"]["dp_jornada_horarios"]["Row"];

export type DpJornada = DpJornadaRow & { horarios: HorarioDia[] };

/** Campos editáveis da jornada (carga é sempre calculada pelo motor). */
export interface DpJornadaForm {
  nome: string;
  descricao: string | null;
  tipo_escala: DpJornadaRow["tipo_escala"];
  turno: DpJornadaRow["turno"];
  ativo: boolean;
  observacoes: string | null;
  horarios: HorarioDia[];
}

export const JORNADA_FORM_DEFAULT: DpJornadaForm = {
  nome: "",
  descricao: null,
  tipo_escala: "6x1",
  turno: "matutino",
  ativo: true,
  observacoes: null,
  horarios: [],
};

function normalizarHorarios(rows: DpJornadaHorarioRow[] | null | undefined): HorarioDia[] {
  return (rows ?? [])
    .map((r) => ({
      dia_semana: r.dia_semana,
      entrada: hhmm(r.entrada),
      saida: hhmm(r.saida),
      intervalo_minutos: r.intervalo_minutos,
      termina_no_dia_seguinte: r.termina_no_dia_seguinte,
    }))
    .sort((a, b) => a.dia_semana - b.dia_semana);
}

export function useDpJornadas() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const key = ["dp_jornadas", selectedCompanyId];

  const query = useQuery({
    queryKey: key,
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DpJornada[]> => {
      const { data, error } = await supabase
        .from("dp_jornadas")
        .select("*, dp_jornada_horarios(*)")
        .eq("company_id", selectedCompanyId!)
        .order("ativo", { ascending: false })
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((j) => {
        const { dp_jornada_horarios, ...rest } = j as DpJornadaRow & {
          dp_jornada_horarios: DpJornadaHorarioRow[] | null;
        };
        return { ...rest, horarios: normalizarHorarios(dp_jornada_horarios) };
      });
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_jornadas"] });
    qc.invalidateQueries({ queryKey: ["dp_colaborador_jornadas"] });
  };

  /** Grava os horários de uma jornada substituindo o conjunto atual. */
  const gravarHorarios = async (jornadaId: string, companyId: string, horarios: HorarioDia[]) => {
    const dias = horarios.map((h) => h.dia_semana);
    // Remove os dias que deixaram de existir antes de inserir os novos.
    const del = supabase.from("dp_jornada_horarios").delete().eq("jornada_id", jornadaId);
    const { error: delError } = dias.length
      ? await del.not("dia_semana", "in", `(${dias.join(",")})`)
      : await del;
    if (delError) throw delError;

    if (!horarios.length) return;
    const { error } = await supabase.from("dp_jornada_horarios").upsert(
      horarios.map((h) => ({
        company_id: companyId,
        jornada_id: jornadaId,
        dia_semana: h.dia_semana,
        entrada: h.entrada,
        saida: h.saida,
        intervalo_minutos: h.intervalo_minutos,
        termina_no_dia_seguinte: viraODia(h.entrada, h.saida),
        carga_horas: calcularCargaDia(h),
      })),
      { onConflict: "jornada_id,dia_semana" },
    );
    if (error) throw error;
  };

  const camposJornada = (form: DpJornadaForm) => {
    const dias = form.horarios.map((h) => h.dia_semana).sort();
    const folgas = [0, 1, 2, 3, 4, 5, 6].filter((d) => !dias.includes(d));
    const semanal = calcularCargaSemanal(form.horarios);
    const diaria = form.horarios.reduce((max, h) => Math.max(max, calcularCargaDia(h)), 0);
    return {
      nome: form.nome.trim(),
      descricao: form.descricao,
      tipo_escala: form.tipo_escala,
      turno: form.turno,
      ativo: form.ativo,
      observacoes: form.observacoes,
      dias_trabalho: dias,
      dias_folga: folgas,
      carga_horaria_semanal: semanal,
      carga_horaria_diaria: diaria,
    };
  };

  const create = useMutation({
    mutationFn: async (form: DpJornadaForm) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { data, error } = await supabase
        .from("dp_jornadas")
        .insert({ ...camposJornada(form), company_id: selectedCompanyId })
        .select("id")
        .single();
      if (error) throw error;
      await gravarHorarios(data.id, selectedCompanyId, form.horarios);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: DpJornadaForm }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { error } = await supabase.from("dp_jornadas").update(camposJornada(form)).eq("id", id);
      if (error) throw error;
      await gravarHorarios(id, selectedCompanyId, form.horarios);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_jornadas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    jornadas: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    create: create.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    saving: create.isPending || update.isPending || remove.isPending,
  };
}

export type DpColaboradorJornada = Database["public"]["Tables"]["dp_colaborador_jornadas"]["Row"] & {
  jornada?: Pick<DpJornadaRow, "id" | "nome" | "tipo_escala" | "turno"> | null;
};

/** Vínculos de jornada (com vigências) de um colaborador. */
export function useDpColaboradorJornadas(colaboradorId?: string) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_colaborador_jornadas", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async (): Promise<DpColaboradorJornada[]> => {
      const { data, error } = await supabase
        .from("dp_colaborador_jornadas")
        .select("*, jornada:dp_jornadas(id, nome, tipo_escala, turno)")
        .eq("colaborador_id", colaboradorId!)
        .order("inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DpColaboradorJornada[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dp_colaborador_jornadas", colaboradorId] });

  const vincular = useMutation({
    mutationFn: async (input: {
      jornada_id: string;
      inicio: string;
      fim?: string | null;
      folga_fixa_semana_override?: number | null;
      observacoes?: string | null;
    }) => {
      if (!selectedCompanyId || !colaboradorId) throw new Error("Contexto incompleto");
      const { error } = await supabase.from("dp_colaborador_jornadas").insert({
        ...input,
        colaborador_id: colaboradorId,
        company_id: selectedCompanyId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const encerrar = useMutation({
    mutationFn: async ({ id, fim }: { id: string; fim: string }) => {
      const { error } = await supabase.from("dp_colaborador_jornadas").update({ fim }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_colaborador_jornadas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    vinculos: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    vincular: vincular.mutateAsync,
    encerrar: encerrar.mutateAsync,
    remover: remover.mutateAsync,
    saving: vincular.isPending || encerrar.isPending || remover.isPending,
  };
}
