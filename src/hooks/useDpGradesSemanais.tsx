import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { ORDEM_EXIBICAO } from "@/lib/dp/jornada-utils";

export interface GradeDia {
  dow: number;
  trabalha: boolean;
  /** Horário da loja (dp_turnos) que vale neste dia. */
  turno_id: string | null;
}

export interface GradeSemanal {
  id: string;
  nome: string;
  descricao: string | null;
  unidade_id: string | null;
  folga_variavel: boolean;
  ativo: boolean;
  dias: GradeDia[];
}

export interface GradeSemanalForm {
  nome: string;
  descricao: string | null;
  unidade_id: string | null;
  folga_variavel: boolean;
  ativo: boolean;
  dias: GradeDia[];
}

/** Semana em branco: todos os dias trabalhados, sem horário definido. */
export function gradeDiasPadrao(): GradeDia[] {
  return ORDEM_EXIBICAO.map((dow) => ({ dow, trabalha: true, turno_id: null }));
}

export const GRADE_FORM_DEFAULT: GradeSemanalForm = {
  nome: "",
  descricao: null,
  unidade_id: null,
  folga_variavel: false,
  ativo: true,
  dias: gradeDiasPadrao(),
};

/**
 * Grades semanais: o padrão de semana da unidade (ex.: Seg–Qui 17:00–00:00 e
 * Sex–Dom 16:30–00:30). Serve de fonte única para o horário de trabalho dos
 * colaboradores, no lugar de repetir "exceções" pessoais em cada cadastro.
 */
export function useDpGradesSemanais(unidadeId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_grades_semanais", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<GradeSemanal[]> => {
      const { data, error } = await supabase
        .from("dp_grades_semanais")
        .select("id, nome, descricao, unidade_id, folga_variavel, ativo, dias:dp_grade_dias(dow, trabalha, turno_id)")
        .eq("company_id", selectedCompanyId!)
        .order("ativo", { ascending: false })
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((g) => ({
        id: g.id,
        nome: g.nome,
        descricao: g.descricao,
        unidade_id: g.unidade_id,
        folga_variavel: !!g.folga_variavel,
        ativo: !!g.ativo,
        dias: ORDEM_EXIBICAO.map((dow) => {
          const d = (g.dias ?? []).find((x) => x.dow === dow);
          return { dow, trabalha: d ? !!d.trabalha : true, turno_id: d?.turno_id ?? null };
        }),
      }));
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_grades_semanais"] });
  };

  const gravarDias = async (gradeId: string, dias: GradeDia[]) => {
    const { error: errDel } = await supabase.from("dp_grade_dias").delete().eq("grade_id", gradeId);
    if (errDel) throw errDel;
    const { error } = await supabase.from("dp_grade_dias").insert(
      dias.map((d) => ({
        company_id: selectedCompanyId!,
        grade_id: gradeId,
        dow: d.dow,
        trabalha: d.trabalha,
        turno_id: d.trabalha ? d.turno_id : null,
      })),
    );
    if (error) throw error;
  };

  const criar = useMutation({
    mutationFn: async (form: GradeSemanalForm) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const { data, error } = await supabase
        .from("dp_grades_semanais")
        .insert({
          company_id: selectedCompanyId,
          nome: form.nome.trim(),
          descricao: form.descricao,
          unidade_id: form.unidade_id,
          folga_variavel: form.folga_variavel,
          ativo: form.ativo,
        })
        .select("id")
        .single();
      if (error) throw error;
      await gravarDias(data.id, form.dias);
      return data;
    },
    onSuccess: invalidate,
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: GradeSemanalForm }) => {
      const { error } = await supabase
        .from("dp_grades_semanais")
        .update({
          nome: form.nome.trim(),
          descricao: form.descricao,
          unidade_id: form.unidade_id,
          folga_variavel: form.folga_variavel,
          ativo: form.ativo,
        })
        .eq("id", id);
      if (error) throw error;
      await gravarDias(id, form.dias);
    },
    onSuccess: invalidate,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_grades_semanais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const alternarAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("dp_grades_semanais").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Grades da unidade (as sem unidade valem para todas). */
  const grades = useMemo(
    () => (query.data ?? []).filter((g) => !unidadeId || !g.unidade_id || g.unidade_id === unidadeId),
    [query.data, unidadeId],
  );

  return {
    ...query,
    grades,
    todas: query.data ?? [],
    criar,
    atualizar,
    remover,
    alternarAtivo,
    saving: criar.isPending || atualizar.isPending || remover.isPending,
  };
}
