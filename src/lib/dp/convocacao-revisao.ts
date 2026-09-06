// ------------------------------------------------------------------
// Domínio: DP → Convocações (revisão antes de publicar)
//
// Resolve o horário que cada destinatário vai receber e simula o quadro
// do dia com os convocados somados. Funções puras — prévia apenas; o
// backend revalida tudo na publicação.
// ------------------------------------------------------------------

import { cargaPrevistaHoras, janelaMinutos, type JornadaDia } from "@/lib/dp/convocacoes-planejamento";

export type OrigemHorario = "individual" | "geral" | "jornada";

export interface HorarioConvocacao {
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  termina_no_dia_seguinte: boolean;
}

export interface HorarioResolvido extends HorarioConvocacao {
  origem: OrigemHorario;
  carga_prevista_horas: number;
}

const valido = (h: { entrada?: string | null; saida?: string | null; termina_no_dia_seguinte?: boolean | null }) =>
  !!h.entrada && !!h.saida &&
  !!janelaMinutos({
    entrada: h.entrada,
    saida: h.saida,
    termina_no_dia_seguinte: h.termina_no_dia_seguinte ?? false,
  });

/**
 * Precedência do horário que a pessoa recebe:
 * ajuste individual > horário padrão da convocação > jornada cadastrada do dia.
 * Devolve null quando nenhuma das fontes tem janela válida.
 */
export function resolverHorarioDestinatario(args: {
  override?: Partial<HorarioConvocacao> | null;
  geral?: Partial<HorarioConvocacao> | null;
  jornada?: JornadaDia | null;
}): HorarioResolvido | null {
  const fontes: { origem: OrigemHorario; h: Partial<HorarioConvocacao> | null | undefined }[] = [
    { origem: "individual", h: args.override },
    { origem: "geral", h: args.geral },
    { origem: "jornada", h: args.jornada },
  ];

  for (const { origem, h } of fontes) {
    if (!h || !valido(h)) continue;
    const base: HorarioConvocacao = {
      entrada: h.entrada!,
      saida: h.saida!,
      intervalo_minutos: Math.max(0, Number(h.intervalo_minutos ?? 0)),
      termina_no_dia_seguinte: h.termina_no_dia_seguinte ?? false,
    };
    return { ...base, origem, carga_prevista_horas: cargaPrevistaHoras(base) };
  }
  return null;
}

export interface SimulacaoDia<T> {
  antes: number;
  depois: number;
  adicionados: number;
  pessoas: T[];
}

/**
 * Quadro do dia como fica SE todos aceitarem: as pessoas já previstas mais os
 * convocados, sem repetir quem já está no quadro.
 */
export function simularDia<T extends { colaborador_id: string }>(
  previstas: T[],
  convocados: T[],
): SimulacaoDia<T> {
  const jaNoQuadro = new Set(previstas.map((p) => p.colaborador_id));
  const novos = convocados.filter((c) => !jaNoQuadro.has(c.colaborador_id));
  return {
    antes: previstas.length,
    depois: previstas.length + novos.length,
    adicionados: novos.length,
    pessoas: [...previstas, ...novos],
  };
}
