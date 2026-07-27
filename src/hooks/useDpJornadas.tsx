import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type DpJornada = Database["public"]["Tables"]["dp_jornadas"]["Row"];
export type DpJornadaInput = Omit<DpJornada, "id" | "created_at" | "updated_at" | "company_id">;
export type DpColaboradorJornada = Database["public"]["Tables"]["dp_colaborador_jornadas"]["Row"] & {
  jornada?: Pick<DpJornada, "id" | "nome" | "tipo_escala" | "turno"> | null;
};

export const JORNADA_DEFAULT: DpJornadaInput = {
  nome: "",
  tipo_escala: "6x1",
  turno: "matutino",
  carga_horaria_diaria: 8,
  carga_horaria_semanal: 44,
  dias_trabalho: [1, 2, 3, 4, 5, 6],
  dias_folga: [0],
  horario_entrada: "08:00",
  horario_saida: "17:00",
  intervalo_inicio: "12:00",
  intervalo_fim: "13:00",
  permite_intervalo_fracionado: false,
  observacoes: null,
  ativo: true,
};

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
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("ativo", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_jornadas"] });
    qc.invalidateQueries({ queryKey: ["dp_colaborador_jornadas"] });
  };

  const create = useMutation({
    mutationFn: async (input: DpJornadaInput) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { error } = await supabase.from("dp_jornadas").insert({ ...input, company_id: selectedCompanyId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<DpJornadaInput> & { id: string }) => {
      const { error } = await supabase.from("dp_jornadas").update(input).eq("id", id);
      if (error) throw error;
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

/** Vínculos de jornada (com vigências e overrides) de um colaborador. */
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
      horario_entrada_override?: string | null;
      horario_saida_override?: string | null;
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
