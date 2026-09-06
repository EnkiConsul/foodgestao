import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { textoErroFerias } from "@/lib/dp/ferias-direito";

export type MinhaFeriasGozo = {
  id: string;
  data_inicio: string;
  data_fim: string;
  dias: number;
  dias_abono: number;
  adiantar_13: boolean;
  status: string;
  ciente_em: string | null;
  observacao: string | null;
};

export type MinhaFeriasPeriodo = {
  periodo_id: string;
  inicio_aquisitivo: string;
  fim_aquisitivo: string;
  limite_concessivo: string;
  dias_direito: number;
  dias_saldo: number;
  periodo_status: string;
  faltas_informadas: boolean;
  adiantamento_13: string;
  aviso_antecedencia_dias: number;
  gozos: MinhaFeriasGozo[];
};

export type SolicitarFeriasInput = {
  periodoId: string;
  dataInicio: string;
  dataFim: string;
  diasAbono: number;
  adiantar13: boolean;
  observacao?: string | null;
};

/** Minhas férias no portal do colaborador: saldo, programações e pedidos. */
export function useDpMinhasFerias() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["dp_ferias_minhas"] });

  const query = useQuery({
    queryKey: ["dp_ferias_minhas"],
    queryFn: async (): Promise<MinhaFeriasPeriodo[]> => {
      const { data, error } = await supabase.rpc("dp_ferias_minhas");
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        periodo_id: r.periodo_id,
        inicio_aquisitivo: r.inicio_aquisitivo,
        fim_aquisitivo: r.fim_aquisitivo,
        limite_concessivo: r.limite_concessivo,
        dias_direito: Number(r.dias_direito ?? 0),
        dias_saldo: Number(r.dias_saldo ?? 0),
        periodo_status: r.periodo_status,
        faltas_informadas: !!r.faltas_informadas,
        adiantamento_13: r.adiantamento_13 ?? "legal",
        aviso_antecedencia_dias: Number(r.aviso_antecedencia_dias ?? 60),
        gozos: ((r.gozos ?? []) as MinhaFeriasGozo[]).map((g) => ({
          ...g,
          dias: Number(g.dias ?? 0),
          dias_abono: Number(g.dias_abono ?? 0),
        })),
      }));
    },
  });

  const solicitar = useMutation({
    mutationFn: async (input: SolicitarFeriasInput) => {
      const { error } = await supabase.rpc("dp_ferias_solicitar", {
        _periodo_id: input.periodoId,
        _data_inicio: input.dataInicio,
        _data_fim: input.dataFim,
        _dias_abono: input.diasAbono,
        _adiantar_13: input.adiantar13,
        _observacao: input.observacao?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido de férias enviado para aprovação");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  const registrarCiencia = useMutation({
    mutationFn: async (gozoId: string) => {
      const { error } = await supabase.rpc("dp_ferias_registrar_ciencia", { _gozo_id: gozoId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ciência registrada");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  return {
    periodos: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    solicitar,
    registrarCiencia,
  };
}
