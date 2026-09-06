import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  textoErroOcorrencia,
  type OcorrenciaMarcacao,
  type OcorrenciaTipo,
} from "@/lib/dp/ocorrencias";

/** Jornada prevista de hoje e registro das ocorrências pelo próprio colaborador. */
export function useMinhasOcorrencias() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const colaborador = useQuery({
    queryKey: ["colab_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (error) throw error;
      return data as string | null;
    },
  });

  const previsto = useQuery({
    queryKey: ["dp_ocorrencia_previsto", colaborador.data, hoje],
    enabled: !!colaborador.data,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_ocorrencia_previsto", {
        _colaborador_id: colaborador.data!,
        _data: hoje,
      });
      if (error) throw error;
      const row = (data ?? [])[0];
      return {
        entrada: (row?.entrada as string | null) ?? null,
        saida: (row?.saida as string | null) ?? null,
      };
    },
  });

  const minhas = useQuery({
    queryKey: ["minhas_ocorrencias", colaborador.data],
    enabled: !!colaborador.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_ocorrencias")
        .select("id, data_operacional, tipo, estado, minutos, horario_estimado, horario_real")
        .eq("colaborador_id", colaborador.data!)
        .neq("estado", "cancelada")
        .gte("data_operacional", hoje)
        .order("data_operacional");
      if (error) throw error;
      return data ?? [];
    },
  });

  const registrar = useMutation({
    mutationFn: async (input: {
      tipo: OcorrenciaTipo;
      data?: string;
      justificativa?: string | null;
      horarioEstimado?: string | null;
      horarioReal?: string | null;
      marcacaoAlvo?: OcorrenciaMarcacao | null;
    }) => {
      if (!colaborador.data) throw new Error("OCORRENCIA_COLABORADOR_NAO_ENCONTRADO");
      const { error } = await supabase.rpc("dp_ocorrencia_registrar", {
        _colaborador_id: colaborador.data,
        _data: input.data ?? hoje,
        _tipo: input.tipo,
        _justificativa: input.justificativa ?? null,
        _horario_estimado: input.horarioEstimado ?? null,
        _horario_real: input.horarioReal ?? null,
        _marcacao_alvo: input.marcacaoAlvo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["minhas_ocorrencias"] });
      qc.invalidateQueries({ queryKey: ["dp_ocorrencias"] });
      toast.success("Avisamos a rotina do dia. Obrigado por informar.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  return {
    hoje,
    colaboradorId: colaborador.data ?? null,
    previsto: previsto.data,
    minhas: minhas.data ?? [],
    loading: colaborador.isLoading || previsto.isLoading,
    registrar,
  };
}
