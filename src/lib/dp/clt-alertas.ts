// ------------------------------------------------------------------
// Domínio: DP → alertas trabalhistas do horário de trabalho.
//
// Nunca bloqueia: sinaliza o que está fora da referência CLT para que o
// empresário registre ciência. Funções puras — sem React, sem Supabase.
// ------------------------------------------------------------------

import { paraMinutos, duracaoBrutaMinutos, viraODia, formatarHoras, DIAS_SEMANA } from "@/lib/dp/jornada-utils";

const DOW_LABEL_LONGO: Record<number, string> = Object.fromEntries(
  DIAS_SEMANA.map((d) => [d.v, d.longo]),
) as Record<number, string>;

/** Um dia da semana com o horário já resolvido (override do dia ou turno). */
export interface DiaHorarioResolvido {
  dow: number;
  trabalha: boolean;
  entrada?: string | null;
  saida?: string | null;
  intervalo_minutos?: number | null;
}

export type SeveridadeAlerta = "aviso" | "info";

export interface AlertaClt {
  codigo: string;
  campo: string;
  severidade: SeveridadeAlerta;
  mensagem: string;
}

export interface EntradaAlertasClt {
  dias: DiaHorarioResolvido[];
  /** Idade do colaborador na data de vigência. */
  idade?: number | null;
  /** Regime de trabalho (clt, intermitente, pj, mei, freelancer, aprendiz...). */
  regime?: string | null;
  /** Cargo — usado apenas no texto do alerta de menor. */
  cargo?: string | null;
  /** Quando true, o alerta de menores é gerado (config da empresa). */
  avisarMenor?: boolean;
  /** A folga muda a cada semana: quem responde por DSR é a escala do mês. */
  folgaVariavel?: boolean;
}


const LIMITE_SEMANAL_CLT = 44;
const LIMITE_DIARIO_CLT = 8;
const LIMITE_DIARIO_MENOR = 6;
const LIMITE_SEMANAL_MENOR = 30;
const INTERJORNADA_MINIMA_H = 11;
const NOTURNO_INICIO = 22 * 60;
const NOTURNO_FIM = 5 * 60;

/** Idade em anos completos numa data de referência. */
export function idadeNaData(dataNascimento?: string | null, referencia?: string | null): number | null {
  if (!dataNascimento) return null;
  const nasc = new Date(`${dataNascimento.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(nasc.getTime())) return null;
  const ref = referencia ? new Date(`${referencia.slice(0, 10)}T12:00:00`) : new Date();
  let anos = ref.getFullYear() - nasc.getFullYear();
  const antes = ref.getMonth() < nasc.getMonth()
    || (ref.getMonth() === nasc.getMonth() && ref.getDate() < nasc.getDate());
  if (antes) anos -= 1;
  return anos;
}

function label(dow: number): string {
  return DOW_LABEL_LONGO[dow] ?? `dia ${dow}`;
}

function temHorario(d: DiaHorarioResolvido): boolean {
  return d.trabalha && !!d.entrada && !!d.saida;
}

function cargaLiquidaHoras(d: DiaHorarioResolvido): number {
  const bruto = duracaoBrutaMinutos(d.entrada!, d.saida!);
  return Math.max(0, bruto - Math.max(0, d.intervalo_minutos ?? 0)) / 60;
}

function tocaNoturno(d: DiaHorarioResolvido): boolean {
  const e = paraMinutos(d.entrada!);
  let s = paraMinutos(d.saida!);
  if (e === null || s === null) return false;
  if (viraODia(d.entrada!, d.saida!)) s += 24 * 60;
  return s > NOTURNO_INICIO || e < NOTURNO_FIM || s > 24 * 60 + NOTURNO_FIM - 1;
}

/**
 * Regimes fora da validação celetista de carga/folga.
 *
 * A decisão vem da política do contrato: PJ/MEI/freelancer não têm jornada
 * contratual e o intermitente cadastra apenas disponibilidade habitual — as
 * obrigações de jornada, intervalo e descanso são conferidas na convocação
 * (art. 452-A da CLT), não no cadastro.
 */
function foraDaClt(regime?: string | null): boolean {
  return !contratoPolicy(regime).validaCargaSemanal;
}


/**
 * Verifica o horário da semana contra as referências da CLT.
 * O resultado é sempre informativo: a tela avisa e pede ciência, nunca bloqueia.
 */
export function verificarAlertasClt(input: EntradaAlertasClt): AlertaClt[] {
  const out: AlertaClt[] = [];
  const dias = input.dias.filter(temHorario);
  if (dias.length === 0) return out;

  const regime = (input.regime ?? "").toLowerCase();
  const menor = typeof input.idade === "number" && input.idade < 18 && input.avisarMenor !== false;
  const aprendiz = regime === "aprendiz" || regime === "jovem_aprendiz";
  const celetista = !foraDaClt(regime);

  const cargaSemanal = dias.reduce((acc, d) => acc + cargaLiquidaHoras(d), 0);

  // --- Menor de 18 anos ---
  if (menor) {
    const noturnos = dias.filter((d) => {
      const s = paraMinutos(d.saida!);
      return viraODia(d.entrada!, d.saida!) || (s !== null && s > NOTURNO_INICIO);
    });
    if (noturnos.length > 0) {
      out.push({
        codigo: "menor_noturno",
        campo: "horario",
        severidade: "aviso",
        mensagem: `Menores de 18 anos não podem trabalhar depois das 22:00 (art. 404 da CLT). Fora da regra em: ${noturnos.map((d) => label(d.dow)).join(", ")}.`,
      });
    }
    const acimaDe6 = dias.filter((d) => cargaLiquidaHoras(d) > LIMITE_DIARIO_MENOR + 0.01);
    if (acimaDe6.length > 0) {
      out.push({
        codigo: "menor_carga_diaria",
        campo: "carga",
        severidade: "aviso",
        mensagem: `Para menores de 18 anos a jornada é de até 6 horas por dia (art. 411 da CLT). Acima disso em: ${acimaDe6.map((d) => label(d.dow)).join(", ")}.`,
      });
    }
    if (cargaSemanal > LIMITE_SEMANAL_MENOR + 0.01) {
      out.push({
        codigo: "menor_carga_semanal",
        campo: "carga",
        severidade: "aviso",
        mensagem: `Semana de ${formatarHoras(cargaSemanal)} para menor de 18 anos — o limite é 30h (8h/44h só com frequência escolar e acordo de compensação).`,
      });
    }
    const semIntervalo = dias.filter(
      (d) => cargaLiquidaHoras(d) > 4 && Math.max(0, d.intervalo_minutos ?? 0) < 60,
    );
    if (semIntervalo.length > 0) {
      out.push({
        codigo: "menor_intervalo",
        campo: "intervalo",
        severidade: "aviso",
        mensagem: `Menores de 18 anos precisam de 1 hora de intervalo quando a jornada passa de 4 horas. Ajustar em: ${semIntervalo.map((d) => label(d.dow)).join(", ")}.`,
      });
    }
    const domingoOuTodos = dias.filter((d) => d.dow === 0);
    if (domingoOuTodos.length > 0 && input.dias.filter((d) => !d.trabalha).length === 0) {
      out.push({
        codigo: "menor_domingo",
        campo: "folga",
        severidade: "aviso",
        mensagem: "Menor de 18 anos escalado no domingo sem nenhum dia de folga na semana — é preciso folga compensatória.",
      });
    }
  }

  // --- Aprendiz ---
  if (aprendiz) {
    const acima = dias.filter((d) => cargaLiquidaHoras(d) > LIMITE_DIARIO_MENOR + 0.01);
    if (acima.length > 0) {
      out.push({
        codigo: "aprendiz_carga_diaria",
        campo: "carga",
        severidade: "aviso",
        mensagem: "Contrato de aprendizagem: jornada de até 6 horas por dia, sem prorrogação (art. 432 da CLT).",
      });
    }
  }

  // --- Regras gerais (celetistas) ---
  if (celetista) {
    if (cargaSemanal > LIMITE_SEMANAL_CLT + 0.01) {
      out.push({
        codigo: "carga_semanal",
        campo: "carga",
        severidade: "aviso",
        mensagem: `Semana de ${formatarHoras(cargaSemanal)} — acima das 44h previstas na CLT. O excedente é hora extra.`,
      });
    }
    const acimaDe8 = dias.filter((d) => cargaLiquidaHoras(d) > LIMITE_DIARIO_CLT + 0.01);
    if (!menor && acimaDe8.length > 0) {
      out.push({
        codigo: "carga_diaria",
        campo: "carga",
        severidade: "aviso",
        mensagem: `Mais de 8 horas por dia em: ${acimaDe8.map((d) => label(d.dow)).join(", ")}. Só é permitido com acordo de compensação; o excedente conta como hora extra.`,
      });
    }
    const intervaloCurto = dias.filter(
      (d) => cargaLiquidaHoras(d) > 6 && Math.max(0, d.intervalo_minutos ?? 0) < 60,
    );
    if (!menor && intervaloCurto.length > 0) {
      out.push({
        codigo: "intervalo_1h",
        campo: "intervalo",
        severidade: "aviso",
        mensagem: `Jornada acima de 6 horas exige 1 hora de intervalo (art. 71 da CLT). Abaixo disso em: ${intervaloCurto.map((d) => label(d.dow)).join(", ")}.`,
      });
    }
    const intervaloAusente = dias.filter(
      (d) => {
        const carga = cargaLiquidaHoras(d);
        return carga > 4 && carga <= 6 && Math.max(0, d.intervalo_minutos ?? 0) < 15;
      },
    );
    if (intervaloAusente.length > 0) {
      out.push({
        codigo: "intervalo_15min",
        campo: "intervalo",
        severidade: "aviso",
        mensagem: `Jornada entre 4 e 6 horas exige 15 minutos de intervalo. Sem intervalo em: ${intervaloAusente.map((d) => label(d.dow)).join(", ")}.`,
      });
    }

    // Interjornada de 11h entre a saída de um dia e a entrada do dia seguinte.
    const ordem = [1, 2, 3, 4, 5, 6, 0];
    const porDow = new Map(input.dias.map((d) => [d.dow, d]));
    const curtas: string[] = [];
    for (let i = 0; i < ordem.length; i += 1) {
      const atual = porDow.get(ordem[i]);
      const proximo = porDow.get(ordem[(i + 1) % ordem.length]);
      if (!atual || !proximo || !temHorario(atual) || !temHorario(proximo)) continue;
      let saida = paraMinutos(atual.saida!)!;
      if (viraODia(atual.entrada!, atual.saida!)) saida += 24 * 60;
      const entradaProx = paraMinutos(proximo.entrada!)! + 24 * 60;
      const descanso = (entradaProx - saida) / 60;
      if (descanso < INTERJORNADA_MINIMA_H - 0.01) {
        curtas.push(`${label(atual.dow)} → ${label(proximo.dow)} (${formatarHoras(Math.max(0, descanso))})`);
      }
    }
    if (curtas.length > 0) {
      out.push({
        codigo: "interjornada",
        campo: "horario",
        severidade: "aviso",
        mensagem: `Menos de 11 horas de descanso entre um dia e o outro (art. 66 da CLT): ${curtas.join("; ")}.`,
      });
    }

    const folgas = input.dias.filter((d) => !d.trabalha);
    if (folgas.length === 0) {
      out.push({
        codigo: "sem_folga_semanal",
        campo: "folga",
        severidade: "aviso",
        mensagem: "Sete dias de trabalho na semana, sem descanso semanal remunerado (art. 67 da CLT).",
      });
    } else if (!folgas.some((d) => d.dow === 0)) {
      out.push({
        codigo: "sem_folga_domingo",
        campo: "folga",
        severidade: "info",
        mensagem: "A folga não cai no domingo — a CLT pede pelo menos um domingo de folga por mês.",
      });
    }
  }

  // --- Adicional noturno (informativo para a Folha) ---
  const comNoturno = dias.filter(tocaNoturno);
  if (comNoturno.length > 0) {
    out.push({
      codigo: "adicional_noturno",
      campo: "horario",
      severidade: "info",
      mensagem: "Há trabalho entre 22:00 e 05:00: a hora noturna vale 52min30 e tem adicional de 20% no cálculo da folha.",
    });
  }

  return out;
}

export function temAlertaClt(alertas: AlertaClt[]): boolean {
  return alertas.some((a) => a.severidade === "aviso");
}
