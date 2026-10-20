import { supabase } from "@/integrations/supabase/client";

export const AREAS = [
  { id: "cozinha", rotulo: "Cozinha e preparo" },
  { id: "salao", rotulo: "Salão e atendimento" },
  { id: "caixa", rotulo: "Caixa e vendas" },
  { id: "delivery", rotulo: "Delivery e entregas" },
  { id: "bar", rotulo: "Bar e bebidas" },
  { id: "limpeza", rotulo: "Limpeza e copa" },
  { id: "estoque", rotulo: "Estoque e compras" },
  { id: "gestao", rotulo: "Gestão e liderança" },
] as const;
export type AreaId = (typeof AREAS)[number]["id"];
export const MAX_AREAS = 3;

export const TURNOS = [
  { id: "manha", rotulo: "Manhã" },
  { id: "tarde", rotulo: "Tarde" },
  { id: "noite", rotulo: "Noite" },
  { id: "madrugada", rotulo: "Madrugada" },
] as const;

export const MAX_EXPERIENCIAS = 5;

export interface Experiencia { funcao: string; local: string; periodo: string }

/** Liga/desliga uma área respeitando o máximo de 3. */
export function alternarArea(atuais: string[], area: string): string[] {
  if (atuais.includes(area)) return atuais.filter((a) => a !== area);
  if (atuais.length >= MAX_AREAS) return atuais;
  return [...atuais, area];
}

/** Destino de retorno aceito após login (evita redirecionamento aberto). */
export function destinoSeguro(voltar: string | null | undefined): string {
  if (voltar && /^\/(vagas\/[A-Za-z0-9-]{1,40}|candidato)(\/[A-Za-z0-9/-]*)?$/.test(voltar)) return voltar;
  return "/candidato";
}

export async function chamarAuthCandidato<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("recrutamento-candidato-auth", { body });
  if (error) {
    let msg = "Não foi possível concluir. Tente novamente.";
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.json() : null;
      if (j?.error) msg = j.error;
    } catch { /* mensagem padrão */ }
    throw new Error(msg);
  }
  return data as T;
}
