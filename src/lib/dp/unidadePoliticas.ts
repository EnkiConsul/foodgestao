import { supabase } from "@/integrations/supabase/client";

export type PoliticaUnidade = "relogio_ponto" | "banco_horas" | "compensa_feriados" | "adiantamento";

export const POLITICA_LABEL: Record<PoliticaUnidade, string> = {
  relogio_ponto: "Relógio de ponto",
  banco_horas: "Banco de horas",
  compensa_feriados: "Compensação de feriados",
  adiantamento: "Adiantamento salarial",
};

/** Ligou exige data de início; desligou exige data de fim. Nova unidade só pede quando liga. */
export function politicaPedeData(original: boolean | null | undefined, atual: boolean, unidadeNova: boolean) {
  if (unidadeNova) return atual;
  return !!original !== atual;
}

export async function registrarPeriodosPolitica(
  companyId: string,
  unidadeId: string,
  itens: { politica: PoliticaUnidade; ativo: boolean; data: string }[],
) {
  if (!itens.length) return;
  const { error } = await supabase.from("dp_unidade_politica_periodos").insert(
    itens.map((i) => ({
      company_id: companyId,
      unidade_id: unidadeId,
      politica: i.politica,
      acao: i.ativo ? "ativar" : "desativar",
      data_efeito: i.data,
    })),
  );
  if (error) throw error;
}
