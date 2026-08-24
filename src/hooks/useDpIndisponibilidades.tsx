import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type DisponibilidadeDia =
  | "disponivel"
  | "indisponivel"
  | "convocacao_pendente"
  | "convocacao_confirmada";

export interface UseDpIndisponibilidadesArgs {
  colaboradorId: string | null | undefined;
  ano: number;
  mes: number; // 1-12
  enabled?: boolean;
}

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Mensagem amigável a partir do código de erro devolvido pelo backend. */
function mensagemErro(raw: string): string {
  if (raw.includes("PAST_DATE_NOT_EDITABLE")) return "Dias que já passaram não podem ser alterados.";
  if (raw.includes("ACCEPTED_CALL_REQUIRES_REPLACEMENT"))
    return "Você já confirmou uma convocação neste dia. Para informar que não poderá trabalhar, será necessário solicitar substituição.";
  if (raw.includes("REGIME_NAO_CONVOCAVEL"))
    return "Seu vínculo usa o fluxo de folgas, não a agenda de disponibilidade.";
  if (raw.includes("FORBIDDEN")) return "Você não tem acesso a esta ação.";
  return "Não foi possível concluir a ação. Tente novamente.";
}

/**
 * Agenda de disponibilidade do próprio trabalhador (Intermitente/Freelancer).
 * Todas as escritas passam pelas operações do backend, que derivam empresa e
 * colaborador da sessão — nada de identificadores enviados pela tela.
 */
export function useDpIndisponibilidades({ colaboradorId, ano, mes, enabled = true }: UseDpIndisponibilidadesArgs) {
  const qc = useQueryClient();
  const inicio = ymdLocal(new Date(ano, mes - 1, 1));
  const fim = ymdLocal(new Date(ano, mes, 0));
  const ativo = !!colaboradorId && enabled;

  const indisponibilidades = useQuery({
    queryKey: ["dp_indisponibilidades_meu", colaboradorId, inicio, fim],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_indisponibilidades")
        .select("id, data, motivo")
        .eq("colaborador_id", colaboradorId!)
        .is("cancelada_em", null)
        .gte("data", inicio)
        .lte("data", fim);
      if (error) throw error;
      return data ?? [];
    },
  });

  const convocacoes = useQuery({
    queryKey: ["dp_convocacoes_meu_cal", colaboradorId, inicio, fim],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_convocacoes")
        .select("id, data, status")
        .eq("colaborador_id", colaboradorId!)
        .gte("data", inicio)
        .lte("data", fim);
      if (error) throw error;
      return data ?? [];
    },
  });

  const estadoPorDia = useMemo(() => {
    const map = new Map<string, DisponibilidadeDia>();
    for (const i of indisponibilidades.data ?? []) map.set(i.data, "indisponivel");
    for (const c of convocacoes.data ?? []) {
      if (c.status === "aceita") map.set(c.data, "convocacao_confirmada");
      else if (c.status === "pendente" && map.get(c.data) !== "convocacao_confirmada")
        map.set(c.data, "convocacao_pendente");
    }
    return map;
  }, [indisponibilidades.data, convocacoes.data]);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_indisponibilidades_meu"] });
    qc.invalidateQueries({ queryKey: ["dp_convocacoes_meu_cal"] });
    qc.invalidateQueries({ queryKey: ["dp_minhas_convocacoes"] });
  };

  const marcar = useMutation({
    mutationFn: async ({ data, motivo }: { data: string; motivo?: string | null }) => {
      const { data: res, error } = await supabase.rpc("dp_indisponibilidade_marcar", {
        p_data: data,
        p_motivo: motivo?.trim() ? motivo.trim() : null,
      });
      if (error) throw new Error(mensagemErro(error.message));
      return (res ?? {}) as { ofertas_encerradas?: number; idempotente?: boolean };
    },
    onSuccess: (res) => {
      invalidar();
      const n = res.ofertas_encerradas ?? 0;
      toast.success(
        n > 0
          ? `Dia marcado como indisponível. ${n} convocação(ões) aguardando resposta foi(ram) encerrada(s).`
          : "Dia marcado como indisponível.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (data: string) => {
      const { error } = await supabase.rpc("dp_indisponibilidade_remover", { p_data: data });
      if (error) throw new Error(mensagemErro(error.message));
    },
    onSuccess: () => {
      invalidar();
      toast.success("Indisponibilidade removida. Você volta a receber convocações neste dia.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    estadoPorDia,
    indisponibilidades: indisponibilidades.data ?? [],
    isLoading: indisponibilidades.isLoading || convocacoes.isLoading,
    marcar,
    remover,
  };
}
