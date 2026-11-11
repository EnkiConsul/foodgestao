// ------------------------------------------------------------------
// Domínio: DP → Escala 12x36 (plantão alternado, Art. 59-A da CLT).
//
// 12 horas de trabalho seguidas de 36 horas de descanso. O ciclo de 48h
// nasce da data do primeiro plantão: diferença par de dias = plantão,
// ímpar = descanso. Espelha `private.dp_12x36_paridade` no banco.
//
// Funções puras — nenhuma dependência de React ou Supabase.
// ------------------------------------------------------------------

import type { ConfigTrabalho, DiaConfig } from "@/lib/dp/config-trabalho";
import { duracaoBrutaMinutos, formatarHoras } from "@/lib/dp/jornada-utils";

export type EscalaModelo = "semanal" | "12x36";

export const ESCALA_MODELO_LABEL: Record<EscalaModelo, string> = {
  semanal: "Escala semanal",
  "12x36": "Escala 12x36",
};

/** Duração bruta esperada do plantão (entrada → saída). */
export const PLANTAO_12X36_MINUTOS = 12 * 60;
/** Intervalo mínimo de refeição em jornada acima de 6h (Art. 71 da CLT). */
export const INTERVALO_MINIMO_12X36 = 60;

const MS_DIA = 24 * 60 * 60 * 1000;

/** Dias inteiros entre duas datas ISO (YYYY-MM-DD), sem efeito de fuso ou horário de verão. */
export function diferencaDias(de: string, ate: string): number {
  const [a1, m1, d1] = de.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = ate.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / MS_DIA);
}

/** A data é dia de plantão no ciclo que começou em `primeiroPlantao`? Vale também para datas anteriores. */
export function ehDiaDePlantao12x36(data: string, primeiroPlantao: string): boolean {
  const dif = diferencaDias(primeiroPlantao, data);
  return ((dif % 2) + 2) % 2 === 0;
}

/** Rótulo do dia de descanso do ciclo, igual no portal, no calendário e no painel do gestor. */
export const ROTULO_DESCANSO_12X36 = "Descanso 12x36";
/** Texto do Art. 59-A, parágrafo único: domingo e feriado são dias comuns no 12x36. */
export const TEXTO_FERIADO_12X36 =
  "Na escala 12x36 domingos e feriados são dias comuns: o descanso de 36 horas já os compensa (Art. 59-A, parágrafo único, da CLT).";

export function ehEscala12x36(config: Pick<ConfigTrabalho, "escala_modelo" | "data_primeiro_plantao"> | null | undefined): boolean {
  return config?.escala_modelo === "12x36" && !!config.data_primeiro_plantao;
}

function dowIso(data: string): number {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * Dia da configuração que vale numa data. Na escala semanal é o dia da
 * semana; no 12x36 o horário do plantão vem da grade e quem decide se a
 * pessoa trabalha é o ciclo de 48h.
 */
export function diaDaConfigNaData(config: ConfigTrabalho, data: string): DiaConfig | undefined {
  const dow = dowIso(data);
  const dia = config.dias.find((d) => d.dow === dow);
  if (!ehEscala12x36(config)) return dia;
  const base = dia ?? config.dias.find((d) => d.trabalha) ?? { dow, trabalha: true, turno_id: null };
  return { ...base, dow, trabalha: ehDiaDePlantao12x36(data, config.data_primeiro_plantao!) };
}

function somarDias(data: string, n: number): string {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Próximo dia de descanso a partir de `hoje` (inclusive): hoje, se for descanso; senão amanhã. */
export function proximoDescanso12x36(hoje: string, primeiroPlantao: string): string {
  return ehDiaDePlantao12x36(hoje, primeiroPlantao) ? somarDias(hoje, 1) : hoje.slice(0, 10);
}

export interface DiaSimulado12x36 {
  data: string;
  dow: number;
  plantao: boolean;
}

/** Próximos dias do ciclo, para o gestor conferir o calendário antes de salvar. */
export function simularCiclo12x36(primeiroPlantao: string, aPartirDe: string, quantidade = 14): DiaSimulado12x36[] {
  return Array.from({ length: quantidade }, (_, i) => {
    const data = somarDias(aPartirDe, i);
    return { data, dow: dowIso(data), plantao: ehDiaDePlantao12x36(data, primeiroPlantao) };
  });
}

/** Média semanal do 12x36: 3,5 plantões por semana descontado o intervalo. */
export function cargaMediaSemanal12x36(horario: { entrada?: string | null; saida?: string | null; intervalo_minutos?: number | null }): number {
  const bruto = duracaoBrutaMinutos(horario.entrada ?? "", horario.saida ?? "");
  const liquido = Math.max(0, bruto - (horario.intervalo_minutos ?? 0));
  return Math.round(((liquido / 60) * 3.5) * 100) / 100;
}

export interface Alerta12x36 {
  codigo: string;
  severidade: "aviso" | "info";
  mensagem: string;
}

/**
 * Pontos de atenção do plantão 12x36. Nunca bloqueia: o gestor registra
 * ciência no salvamento, como nos demais alertas da CLT.
 */
export function alertas12x36(input: {
  entrada?: string | null;
  saida?: string | null;
  intervalo_minutos?: number | null;
  idade?: number | null;
}): Alerta12x36[] {
  const out: Alerta12x36[] = [];
  const bruto = input.entrada && input.saida ? duracaoBrutaMinutos(input.entrada, input.saida) : null;
  if (input.idade != null && input.idade < 18) {
    out.push({
      codigo: "12X36_MENOR",
      severidade: "aviso",
      mensagem: "Menor de 18 anos não pode cumprir plantão de 12 horas (Arts. 411 e 413 da CLT).",
    });
  }
  if (bruto != null && bruto > 0 && bruto !== PLANTAO_12X36_MINUTOS) {
    out.push({
      codigo: "12X36_DURACAO",
      severidade: "aviso",
      mensagem: `O plantão informado tem ${formatarHoras(bruto / 60)}. A escala 12x36 prevê 12 horas de trabalho por 36 de descanso (Art. 59-A da CLT).`,
    });
  }
  if ((input.intervalo_minutos ?? 0) < INTERVALO_MINIMO_12X36) {
    out.push({
      codigo: "12X36_INTERVALO",
      severidade: "aviso",
      mensagem: "Intervalo menor que 1 hora: no 12x36 ele precisa ser concedido ou indenizado (Art. 59-A e Art. 71 da CLT).",
    });
  }
  out.push({
    codigo: "12X36_ACORDO",
    severidade: "info",
    mensagem: "A escala 12x36 exige acordo individual escrito, convenção ou acordo coletivo. Domingos e feriados já ficam compensados pelo descanso de 36 horas (Art. 59-A, parágrafo único).",
  });
  return out;
}

/** Texto curto do ciclo para listas e históricos. */
export function resumo12x36(primeiroPlantao: string, horario?: { entrada?: string | null; saida?: string | null } | null): string {
  const faixa = horario?.entrada && horario?.saida ? `${horario.entrada.slice(0, 5)}–${horario.saida.slice(0, 5)}` : "horário do plantão";
  const [a, m, d] = primeiroPlantao.slice(0, 10).split("-");
  return `Plantão 12x36 (${faixa}), dia sim, dia não, desde ${d}/${m}/${a}`;
}
