import { supabase } from "@/integrations/supabase/client";

export interface AvalStatus {
  tem_perfil: boolean;
  perfil_completo?: boolean;
  areas_perfil?: string[];
  em_andamento?: boolean;
  areas_cobertas?: string[];
  valida?: boolean;
  valida_ate?: string | null;
  concluida_em?: string | null;
  nova_tentativa_em?: string | null;
  faixa?: "alinhado" | "parcial" | "orientacao" | null;
  pct_gerais?: number | null;
  pct_especificos?: number | null;
  segundos_por_pergunta?: number;
  visivel_empresas?: boolean;
}

export interface AvalPergunta {
  em_andamento: boolean;
  concluida?: boolean;
  avaliacao_id?: string;
  tipo?: "completa" | "complemento";
  item_id?: string;
  ordem?: number;
  total?: number;
  area?: string;
  competencia?: string;
  enunciado?: string;
  opcoes?: { id: string; texto: string }[];
  prazo_em?: string;
  segundos_restantes?: number;
}

export const FAIXA_ROTULO: Record<string, { titulo: string; texto: string }> = {
  alinhado: { titulo: "Alinhado à rotina", texto: "Suas respostas mostram boa familiaridade com a rotina de Food Service." },
  parcial: { titulo: "Alinhamento parcial", texto: "Você conhece o essencial. Alguns pontos podem ser reforçados no treinamento." },
  orientacao: { titulo: "Pontos de orientação", texto: "Alguns procedimentos merecem atenção. Isso não elimina você de nenhuma vaga." },
};

/** Segundos restantes a partir do prazo do servidor, compensando a diferença de relógio medida na resposta. */
export function segundosRestantes(prazoIso: string, desvioMs: number, agora = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(prazoIso).getTime() - (agora + desvioMs)) / 1000));
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(nome, args ?? {});
  if (error) throw new Error(error.message || "Não foi possível concluir. Tente novamente.");
  return data as T;
}

export const avalStatus = () => rpc<AvalStatus>("recrutamento_aval_status");
export const avalIniciar = (area?: string | null) => rpc<{ avaliacao_id: string }>("recrutamento_aval_iniciar", { p_area: area ?? null });
export const avalAtual = () => rpc<AvalPergunta>("recrutamento_aval_atual");
export const avalResponder = (item: string, opcao: string) =>
  rpc<{ ok: boolean; expirada?: boolean }>("recrutamento_aval_responder", { p_item: item, p_opcao: opcao });
