import { supabase } from "@/integrations/supabase/client";
import { TIPOS_PREVISAO, type OcorrenciaTipo, type OcorrenciaEstado, type OcorrenciaOrigem, type OcorrenciaAnalise, type OcorrenciaImpacto } from "./ocorrencias";

export interface MinhaOcorrencia {
  id: string;
  data_operacional: string;
  tipo: OcorrenciaTipo;
  estado: OcorrenciaEstado;
  origem: OcorrenciaOrigem;
  subtipo: string | null;
  folga_id: string | null;
  troca_id: string | null;
  minutos: number | null;
  horario_estimado: string | null;
  horario_real: string | null;
  justificativa_colaborador: string | null;
  analise_status: OcorrenciaAnalise;
  analisado_em: string | null;
  impacta_assiduidade: OcorrenciaImpacto;
  assiduidade_risco: boolean;
  assiduidade_decidido_em: string | null;
}

export function aguardandoAnalise(o: MinhaOcorrencia) {
  return o.estado !== "cancelada" && (o.estado !== "confirmada" || o.analise_status === "pendente" || (o.assiduidade_risco && !o.assiduidade_decidido_em));
}

export function impactoConfirmado(o: MinhaOcorrencia) {
  return o.estado === "confirmada" && !TIPOS_PREVISAO.includes(o.tipo) && !!o.assiduidade_decidido_em && o.impacta_assiduidade === "sim";
}

export function resumoAssiduidadePortal(itens: MinhaOcorrencia[]) {
  if (itens.some(impactoConfirmado)) return "Impacto no prêmio confirmado pelo gestor";
  if (itens.some(o => o.estado !== "cancelada" && o.assiduidade_risco && !o.assiduidade_decidido_em)) return "Há ocorrências aguardando decisão sobre o prêmio";
  return "Sem impacto confirmado até agora";
}

/** Fetch the entire interval in stable pages, never truncate monthly totals. */
export async function lerMinhasOcorrencias(inicio: string, fim: string): Promise<MinhaOcorrencia[]> {
  const itens: MinhaOcorrencia[] = [];
  let total = 0;
  do {
    const { data, error } = await supabase.rpc("dp_portal_minhas_ocorrencias", { _inicio: inicio, _fim: fim, _offset: itens.length, _limite: 100 });
    if (error) throw error;
    const pagina = data as unknown as { itens: MinhaOcorrencia[]; total: number };
    if (!pagina || !Array.isArray(pagina.itens)) throw new Error("PORTAL_RESPOSTA_INVALIDA");
    itens.push(...pagina.itens);
    total = pagina.total;
    if (pagina.itens.length === 0 && itens.length < total) throw new Error("PORTAL_PAGINACAO_INCOMPLETA");
  } while (itens.length < total);
  return itens;
}