import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  agruparPorColaborador, mensagemErroModoAssinatura,
  type ModoAssinatura, type RegistroModoAssinatura,
} from "@/lib/dp/modo-assinatura";

const CAMPOS = "id, colaborador_id, modo, vigente_desde, motivo, origem, documentos_convertidos, created_at, created_by";

/** Histórico de modo de assinatura de todos os colaboradores da empresa. */
export function useDpModosAssinaturaEmpresa() {
  const { selectedCompanyId } = useCompanyContext();
  const q = useQuery({
    queryKey: ["dp_modo_assinatura", selectedCompanyId],
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
    queryFn: async (): Promise<RegistroModoAssinatura[]> => {
      const { data, error } = await supabase
        .from("dp_colaborador_modo_assinatura")
        .select(CAMPOS)
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []) as RegistroModoAssinatura[];
    },
  });
  const porColaborador = useMemo(() => agruparPorColaborador(q.data ?? []), [q.data]);
  return { ...q, porColaborador };
}

/** Histórico de um colaborador (mais recente primeiro). */
export function useDpModoAssinatura(colaboradorId: string | null | undefined) {
  return useQuery({
    queryKey: ["dp_modo_assinatura", "colaborador", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async (): Promise<RegistroModoAssinatura[]> => {
      const { data, error } = await supabase
        .from("dp_colaborador_modo_assinatura")
        .select(CAMPOS)
        .eq("colaborador_id", colaboradorId!)
        .order("vigente_desde", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RegistroModoAssinatura[];
    },
  });
}

/** Documentos que ainda esperam assinatura no celular (podem passar para o papel). */
export function useDpDocsAguardandoCelular(colaboradorId: string | null | undefined, ativo = true) {
  return useQuery({
    queryKey: ["dp_modo_assinatura", "pendentes", colaboradorId],
    enabled: !!colaboradorId && ativo,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("dp_colaborador_modo_assinatura_pendentes", {
        p_colaborador_id: colaboradorId!,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

export type DefinirModoAssinatura = {
  colaboradorId: string;
  modo: ModoAssinatura;
  vigenteDesde: string;
  motivo?: string | null;
  converterPendentes?: boolean;
  origem?: "cadastro" | "importacao_ficha";
};

export type ResultadoModoAssinatura = { id: string | null; sem_mudanca: boolean; convertidos: number };

/** Grava a troca pela rotina do servidor (confere permissão e data, registra auditoria). */
export async function definirModoAssinatura(e: DefinirModoAssinatura): Promise<ResultadoModoAssinatura> {
  const { data, error } = await supabase.rpc("dp_colaborador_modo_assinatura_definir", {
    p_colaborador_id: e.colaboradorId,
    p_modo: e.modo,
    p_vigente_desde: e.vigenteDesde,
    p_motivo: e.motivo ?? null,
    p_converter_pendentes: !!e.converterPendentes,
    p_origem: e.origem ?? "cadastro",
  });
  if (error) throw new Error(mensagemErroModoAssinatura(error));
  return data as unknown as ResultadoModoAssinatura;
}

export function useDefinirModoAssinatura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: definirModoAssinatura,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["dp_modo_assinatura"] });
      if (r.convertidos > 0) {
        qc.invalidateQueries({ queryKey: ["dp_historico_documentos"] });
        qc.invalidateQueries({ queryKey: ["dp_documentos"] });
      }
    },
  });
}
