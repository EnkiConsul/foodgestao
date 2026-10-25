import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import {
  textoErroOcorrencia,
  type OcorrenciaMarcacao,
  type OcorrenciaTipo,
} from "@/lib/dp/ocorrencias";
import type { RegraAssiduidade } from "@/lib/dp/assiduidade-risco";
import { lerMinhasOcorrencias } from "@/lib/dp/minhas-ocorrencias";
import { invalidarRotina } from "@/lib/dp/rotina-cache";

/** Jornada prevista de hoje e registro das ocorrências pelo próprio colaborador. */
export function useMinhasOcorrencias() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const hoje = hojeIsoLocal();

  const colaborador = useQuery({
    queryKey: ["colab_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_meu_colaborador");
      if (error) throw error;
      return data as string | null;
    },
  });

  const previsto = useQuery({
    queryKey: ["dp_ocorrencia_previsto", colaborador.data, hoje],
    enabled: !!colaborador.data,
    queryFn: async () => {
      if (!colaborador.data) return null;
      const { data, error } = await supabase.rpc("dp_ocorrencia_previsto", {
        _colaborador_id: colaborador.data,
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
      const fim = new Date(`${hoje}T12:00:00`);
      fim.setDate(fim.getDate() + 366);
      return (await lerMinhasOcorrencias(hoje, fim.toLocaleDateString("en-CA"))).filter(o => o.estado !== "cancelada").reverse();
    },
  });

  // Atrasos do mês corrente: base do aviso de tolerância antes de enviar.
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const mes = useQuery({
    queryKey: ["minhas_ocorrencias_mes", colaborador.data, inicioMes],
    enabled: !!colaborador.data,
    queryFn: async () => {
      return (await lerMinhasOcorrencias(inicioMes, hoje)).filter(o => o.estado !== "cancelada");
    },
  });

  // Regra do próprio colaborador: só para avisar na tela antes de enviar.
  const regra = useQuery({
    queryKey: ["minha_regra_assiduidade", colaborador.data],
    enabled: !!colaborador.data,
    queryFn: async (): Promise<RegraAssiduidade | null> => {
      if (!colaborador.data) return null;
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select(
          "premio_assiduidade, premio_assiduidade_valor, assiduidade_criterio, assiduidade_tolerancia_min, assiduidade_max_atrasos, assiduidade_considera_atestado, assiduidade_max_atestados",
        )
        .eq("id", colaborador.data)
        .maybeSingle();
      if (error) throw error;
      return (data as RegraAssiduidade | null) ?? null;
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
      qc.invalidateQueries({ queryKey: ["minhas_ocorrencias_mes"] });
      qc.invalidateQueries({ queryKey: ["dp_ocorrencias"] });
      void invalidarRotina(qc);
      toast.success("Avisamos a rotina do dia. Obrigado por informar.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  return {
    hoje,
    colaboradorId: colaborador.data ?? null,
    previsto: previsto.data,
    minhas: minhas.data ?? [],
    regraAssiduidade: regra.data ?? null,
    ocorrenciasMes: mes.data ?? [],
    loading: colaborador.isLoading || previsto.isLoading,
    registrar,
  };
}
