// ------------------------------------------------------------------
// Domínio: DP → regras do lançamento de mão de obra extra na rotina.
//
// Cobre quem pode aparecer na lista (admissão/desligamento por data),
// o que a pessoa já tem previsto no dia (escala, jornada, convocação,
// outro lançamento extra) e o bloqueio de horários que se sobrepõem,
// com sugestão do próximo horário livre. Funções puras — sem React,
// sem Supabase.
// ------------------------------------------------------------------

import type {
  ColaboradorPanorama,
  ResultadoDia,
} from "./operacao-panorama";

const MINUTO_EM_HORAS = 60;
const MINUTOS_NO_DIA = 24 * MINUTO_EM_HORAS;
/** Duração padrão de um período extra quando o gestor ainda não digitou horário. */
const DURACAO_PADRAO_MINUTOS = 6 * MINUTO_EM_HORAS;

export interface ColaboradorExtra {
  id: string;
  nome: string;
  ativo?: boolean;
  data_admissao?: string | null;
  data_desligamento?: string | null;
}

/**
 * A pessoa pode ser lançada no dia? Ela precisa já ter sido admitida e
 * ainda não ter saído naquela data. Quem saiu continua aparecendo para
 * dias até a saída (inclusive), para corrigir registros passados.
 */
export function colaboradorElegivelNoDia(c: ColaboradorExtra, data: string): boolean {
  if (c.data_admissao && c.data_admissao > data) return false;
  if (c.data_desligamento && c.data_desligamento < data) return false;
  if (c.ativo === false && !c.data_desligamento) return false;
  if (c.ativo === false && c.data_desligamento && data > c.data_desligamento) return false;
  return true;
}

/** Mantém a ordem original; só remove quem não tinha contrato válido no dia. */
export function colaboradoresElegiveisNoDia<T extends ColaboradorExtra>(lista: T[], data: string): T[] {
  if (!data) return lista;
  return lista.filter((c) => colaboradorElegivelNoDia(c, data));
}

/** Quem tinha vínculo ativo mas saiu — aparece com a marca "Desligado em dd/mm". */
export function foiDesligado(c: ColaboradorExtra, data: string): boolean {
  return !!c.data_desligamento && c.data_desligamento <= data;
}

// ------------------------------------------------------------------
// Previsões já existentes no dia
// ------------------------------------------------------------------

export type OrigemPrevisao =
  | "jornada"
  | "escala"
  | "convocacao"
  | "avulso"
  | "registro_manual";

export interface PrevisaoNoDia {
  entrada: string;
  saida: string;
  termina_no_dia_seguinte: boolean;
  origem: OrigemPrevisao;
  /** Rótulo amigável da origem, para o aviso ("escala publicada" etc.). */
  origemLabel: string;
  /** Convocação ainda sem resposta — vale o alerta, com texto próprio. */
  pendente?: boolean;
}

const ORIGEM_LABEL: Record<OrigemPrevisao, string> = {
  jornada: "jornada habitual",
  escala: "escala publicada",
  convocacao: "convocação aceita",
  avulso: "lançamento extra",
  registro_manual: "lançamento extra",
};

/**
 * Extrai do resultado da rotina os horários que a pessoa já tem no dia,
 * para avisar e bloquear sobreposição antes de salvar um lançamento extra.
 */
export function previsaoNoDia(
  dia: ResultadoDia | null,
  colaboradorId: string,
  /** Ao editar um lançamento, ignora o próprio registro. */
  ignorarAvulsoId?: string | null,
): PrevisaoNoDia[] {
  if (!dia || !colaboradorId) return [];
  const out: PrevisaoNoDia[] = [];
  for (const p of dia.pessoas) {
    if (p.colaborador_id !== colaboradorId) continue;
    if (p.avulso_id && ignorarAvulsoId && p.avulso_id === ignorarAvulsoId) continue;
    if (!p.entrada || !p.saida) continue;
    out.push({
      entrada: p.entrada,
      saida: p.saida,
      termina_no_dia_seguinte: p.termina_no_dia_seguinte,
      origem: p.origem,
      origemLabel: ORIGEM_LABEL[p.origem] ?? "previsão",
      pendente: p.categoria === "convocado_pendente",
    });
  }
  return out;
}

// ------------------------------------------------------------------
// Sobreposição de horários (com turnos que viram o dia)
// ------------------------------------------------------------------

const paraMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * MINUTO_EM_HORAS + m;
};

/** Intervalo em minutos desde a meia-noite; fim pode passar de 24h. */
export function intervaloMinutos(
  entrada: string,
  saida: string,
  viraODia: boolean,
): [number, number] {
  const ini = paraMinutos(entrada);
  let fim = paraMinutos(saida);
  if (viraODia || fim <= ini) fim += MINUTOS_NO_DIA;
  return [ini, fim];
}

/**
 * Retorna a primeira previsão que colide com o horário digitado, ou null.
 * Horários incompletos (sem entrada/saída) não conflitam.
 */
export function conflitoDeHorario(
  previsoes: PrevisaoNoDia[],
  entrada: string,
  saida: string,
  viraODia: boolean,
): PrevisaoNoDia | null {
  if (!entrada || !saida) return null;
  const [ini, fim] = intervaloMinutos(entrada, saida, viraODia);
  for (const p of previsoes) {
    const [pIni, pFim] = intervaloMinutos(p.entrada, p.saida, p.termina_no_dia_seguinte);
    if (ini < pFim && fim > pIni) return p;
  }
  return null;
}

/**
 * Próximo horário livre do dia: começa no fim da previsão conflitante e
 * mantém a duração digitada (ou 6h, quando ainda não há horário válido).
 */
export function sugerirHorarioLivre(
  previsoes: PrevisaoNoDia[],
  entrada: string,
  saida: string,
  viraODia: boolean,
): { entrada: string; saida: string; termina_no_dia_seguinte: boolean } | null {
  if (previsoes.length === 0) return null;
  let conflito = conflitoDeHorario(previsoes, entrada, saida, viraODia);
  if (!conflito) {
    // Sem horário digitado ainda não há conflito mensurável: parte do fim da
    // última previsão do dia.
    if (entrada && saida) return null;
    conflito = previsoes.reduce((maior, p) => {
      const [, fim] = intervaloMinutos(p.entrada, p.saida, p.termina_no_dia_seguinte);
      const [, fimMaior] = intervaloMinutos(
        maior.entrada,
        maior.saida,
        maior.termina_no_dia_seguinte,
      );
      return fim > fimMaior ? p : maior;
    });
  }

  let duracao = DURACAO_PADRAO_MINUTOS;
  if (entrada && saida) {
    const [ini, fim] = intervaloMinutos(entrada, saida, viraODia);
    duracao = fim - ini;
  }

  const [, fimConflito] = intervaloMinutos(
    conflito.entrada,
    conflito.saida,
    conflito.termina_no_dia_seguinte,
  );
  const inicio = fimConflito;
  const fim = inicio + duracao;

  const fmt = (min: number) => {
    const d = Math.floor(min / MINUTO_EM_HORAS) % 24;
    const m = min % MINUTO_EM_HORAS;
    return `${String(d).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  return {
    entrada: fmt(inicio),
    saida: fmt(fim),
    termina_no_dia_seguinte: fim >= MINUTOS_NO_DIA,
  };
}

/** Texto do aviso de previsão: "Hanna já está prevista das 10:00 às 18:00 (escala do dia)". */
export function descreverPrevisao(nome: string, p: PrevisaoNoDia): string {
  const origem = p.pendente ? "convocação aguardando resposta" : p.origemLabel;
  return `${nome} já está prevista das ${p.entrada} às ${p.saida}${
    p.termina_no_dia_seguinte ? " (termina no dia seguinte)" : ""
  } — ${origem}.`;
}
