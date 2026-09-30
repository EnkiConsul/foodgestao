import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { textoErroFerias } from "@/lib/dp/ferias-direito";
import { linkDocumentoAssinado } from "@/lib/documentoArquivo";
import { useMeuVinculoPortal } from "@/hooks/useMeuVinculoPortal";

export type MinhaFeriasDocumento = {
  id: string;
  tipo: string;
  titulo: string | null;
  file_path: string;
  file_name: string | null;
  created_at: string;
};

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
  aviso_em: string | null;
  aviso_enviado_em: string | null;
  aviso_fora_prazo: boolean | null;
  aviso_retroativo: boolean | null;
  aviso_justificativa: string | null;
  documentos: MinhaFeriasDocumento[];
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

export type MinhaFeriasPedido = {
  solicitacao_id: string;
  periodo_id: string;
  status: string;
  data_inicio: string;
  data_fim: string;
  dias: number;
  dias_abono: number;
  adiantar_13: boolean;
  observacao: string | null;
  resposta_admin: string | null;
  criado_em: string;
  respondido_em: string | null;
};

export type EditarPedidoFeriasInput = {
  solicitacaoId: string;
  dataInicio: string;
  dataFim: string;
  diasAbono: number;
  adiantar13: boolean;
  observacao?: string | null;
};

export type RemarcarFeriasInput = {
  gozoId: string;
  dataInicio: string;
  dataFim: string;
  motivo?: string | null;
};

/** Minhas férias no portal do colaborador: saldo, programações e pedidos. */
export function useDpMinhasFerias() {
  const qc = useQueryClient();
  const vinculo = useMeuVinculoPortal();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["dp_ferias_minhas"] });
    void qc.invalidateQueries({ queryKey: ["dp_ferias_meus_pedidos"] });
    void qc.invalidateQueries({ queryKey: ["dp_minhas_solicitacoes"] });
  };


  // A empresa do vínculo entra na chave: ao trocar de contexto, os dados da
  // empresa anterior nunca continuam na tela.
  const query = useQuery({
    queryKey: ["dp_ferias_minhas", vinculo.data?.companyId ?? null],
    enabled: !vinculo.isLoading,
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
        aviso_antecedencia_dias: Number(r.aviso_antecedencia_dias ?? 40),
        gozos: ((r.gozos ?? []) as MinhaFeriasGozo[]).map((g) => ({
          ...g,
          dias: Number(g.dias ?? 0),
          dias_abono: Number(g.dias_abono ?? 0),
          documentos: g.documentos ?? [],
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

  // Pedidos de férias do próprio colaborador, inclusive os que ainda estão
  // em análise: sem isso a pessoa não via o que pediu.
  const pedidosQuery = useQuery({
    queryKey: ["dp_ferias_meus_pedidos", vinculo.data?.companyId ?? null],
    enabled: !vinculo.isLoading,
    queryFn: async (): Promise<MinhaFeriasPedido[]> => {
      const { data, error } = await supabase.rpc("dp_ferias_meus_pedidos" as any);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        solicitacao_id: r.solicitacao_id,
        periodo_id: r.periodo_id,
        status: r.status,
        data_inicio: r.data_inicio,
        data_fim: r.data_fim,
        dias: Number(r.dias ?? 0),
        dias_abono: Number(r.dias_abono ?? 0),
        adiantar_13: !!r.adiantar_13,
        observacao: r.observacao ?? null,
        resposta_admin: r.resposta_admin ?? null,
        criado_em: r.criado_em,
        respondido_em: r.respondido_em ?? null,
      }));
    },
  });

  const editarPedido = useMutation({
    mutationFn: async (input: EditarPedidoFeriasInput) => {
      const { error } = await supabase.rpc("dp_ferias_pedido_editar" as any, {
        _solicitacao_id: input.solicitacaoId,
        _data_inicio: input.dataInicio,
        _data_fim: input.dataFim,
        _dias_abono: input.diasAbono,
        _adiantar_13: input.adiantar13,
        _observacao: input.observacao?.trim() || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido de férias atualizado");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  const cancelarPedido = useMutation({
    mutationFn: async (solicitacaoId: string) => {
      const { error } = await supabase.rpc("dp_solicitacao_cancelar", { p_id: solicitacaoId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido de férias cancelado");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  const pedirRemarcacao = useMutation({
    mutationFn: async (input: RemarcarFeriasInput) => {
      const { error } = await supabase.rpc("dp_ferias_remarcacao_solicitar" as any, {
        _gozo_id: input.gozoId,
        _data_inicio: input.dataInicio,
        _data_fim: input.dataFim,
        _motivo: input.motivo?.trim() || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido de remarcação enviado para o gestor");
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

  /** Abre o aviso ou recibo de férias em nova aba, com link temporário. */
  const abrirDocumento = async (doc: MinhaFeriasDocumento) => {
    try {
      const link = await linkDocumentoAssinado(doc.id, 60);
      if (!link) return toast.error("Sem permissão para abrir este documento");
      window.open(link.url, "_blank", "noopener");
    } catch {
      toast.error("Erro ao abrir o arquivo");
    }
  };

  return {
    abrirDocumento,
    periodos: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    solicitar,
    registrarCiencia,
  };
}
