/**
 * Ciência da regra de descanso semanal (mais de 6 dias seguidos de trabalho).
 * Gravada pelo servidor em `dp_dsr_ciencias`; ciência do colaborador avisa o gestor.
 */
import { supabase } from "@/integrations/supabase/client";

export type PapelCienciaDsr = "solicitante" | "destino" | "colaborador" | "gestor";

export async function registrarCienciaDsr(input: {
  papel: PapelCienciaDsr;
  tabela: "dp_trocas" | "dp_solicitacoes" | "dp_folgas";
  referenciaId?: string | null;
  data: string;
  dias: number;
  colaboradorId?: string | null;
}): Promise<void> {
  const { error } = await (supabase as any).rpc("dp_dsr_ciencia_registrar", {
    p_papel: input.papel,
    p_referencia_tabela: input.tabela,
    p_referencia_id: input.referenciaId ?? null,
    p_data: input.data,
    p_dias: input.dias,
    p_colaborador: input.colaboradorId ?? null,
  });
  if (error) console.error("Falha ao registrar ciência de DSR", error);
}

/** Dias da semana de folga fixa do colaborador (configuração de trabalho vigente). */
export async function diasFixosDoColaborador(colaboradorId: string): Promise<number[]> {
  const { data: cfg } = await supabase
    .from("dp_colaborador_config_trabalho")
    .select("id")
    .eq("colaborador_id", colaboradorId)
    .order("vigencia_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cfg?.id) return [];
  const { data: dias } = await supabase
    .from("dp_colaborador_config_dias")
    .select("dow, trabalha")
    .eq("config_id", cfg.id);
  return (dias ?? []).filter((d) => d.trabalha === false).map((d) => Number(d.dow));
}
