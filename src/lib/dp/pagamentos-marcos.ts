// ------------------------------------------------------------------
// Marcos de pagamento do mês (salário, adiantamento e vale-alimentação).
//
// Motor puro: recebe as regras já filtradas para quem vai ver (o portal só
// recebe o que vale para o próprio colaborador) e os feriados da unidade, e
// devolve as datas previstas. Nada aqui grava ou decide elegibilidade.
//
// 5º dia útil (art. 459, §1º, CLT): sábado conta como dia útil; domingos e
// feriados legais da unidade (nacional, estadual e municipal) não contam.
// Feriado só de convenção (sindicato) não suspende o prazo legal, então conta
// como dia útil — assim a previsão nunca passa do prazo da lei. Com Pix o
// pagamento pode cair no próprio sábado, sem antecipar para sexta.
// ------------------------------------------------------------------

import { periodoVaDe } from "./va-calculo";

export type SalarioTipo = "quinto_dia_util" | "dia_fixo";
export type MarcoPagamentoTipo = "salario" | "adiantamento" | "va";

export interface RegraPagamentos {
  salario?: { tipo: SalarioTipo | null; dia?: number | null; rotulo?: string | null } | null;
  adiantamentoDia?: number | null;
  vaDia?: number | null;
}

export interface MarcoPagamento {
  tipo: MarcoPagamentoTipo;
  /** yyyy-MM-dd */
  data: string;
  /** Nome completo do marco (ex.: "Salário"). */
  rotulo: string;
  /** Rótulo curto para pílulas no celular. */
  curto: string;
  /** Explicação mostrada ao tocar no dia. */
  detalhe: string;
}

export interface FeriadoParaPrazo {
  data: string;
  categoria?: string | null;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const ORDEM: Record<MarcoPagamentoTipo, number> = { salario: 0, adiantamento: 1, va: 2 };

const pad = (n: number) => String(n).padStart(2, "0");
const isoDe = (ano: number, mes1: number, dia: number) => `${ano}-${pad(mes1)}-${pad(dia)}`;
const diasNoMes = (ano: number, mes1: number) => new Date(Date.UTC(ano, mes1, 0)).getUTCDate();

function partes(competencia: string): [number, number] {
  const [a, m] = competencia.slice(0, 7).split("-").map(Number);
  return [a, m];
}

/** Datas que não contam como dia útil para o prazo legal (sindicato fica de fora). */
export function feriadosQueSuspendemPrazo(feriados: FeriadoParaPrazo[]): Set<string> {
  return new Set(feriados.filter((f) => f.categoria !== "sindicato").map((f) => f.data.slice(0, 10)));
}

/** 5º dia útil do mês (segunda a sábado, sem domingos e feriados informados). */
export function quintoDiaUtil(competencia: string, naoUteis: Set<string>): string {
  const [ano, mes] = partes(competencia);
  const total = diasNoMes(ano, mes);
  let uteis = 0;
  for (let dia = 1; dia <= total; dia++) {
    const iso = isoDe(ano, mes, dia);
    const dow = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
    if (dow === 0 || naoUteis.has(iso)) continue;
    uteis++;
    if (uteis === 5) return iso;
  }
  return isoDe(ano, mes, total);
}

/** Dia fixo no mês; em meses mais curtos vale o último dia. */
export function diaFixoNoMes(competencia: string, dia: number): string {
  const [ano, mes] = partes(competencia);
  return isoDe(ano, mes, Math.min(Math.max(1, Math.trunc(dia)), diasNoMes(ano, mes)));
}

const nomeMesAnterior = (competencia: string) => {
  const [, mes] = partes(competencia);
  return MESES[(mes + 10) % 12];
};

/** Marcos de pagamento previstos para o mês `competencia` (yyyy-MM). */
export function marcosPagamentoDoMes(
  competencia: string,
  regra: RegraPagamentos,
  naoUteis: Set<string>,
): MarcoPagamento[] {
  const marcos: MarcoPagamento[] = [];
  const s = regra.salario;
  const rotuloSalario = s?.rotulo?.trim() || "Salário";
  if (s?.tipo === "quinto_dia_util") {
    marcos.push({
      tipo: "salario",
      data: quintoDiaUtil(competencia, naoUteis),
      rotulo: rotuloSalario,
      curto: rotuloSalario === "Salário" ? "Salário" : "Bolsa",
      detalhe: `Previsão do ${rotuloSalario.toLowerCase()} de ${nomeMesAnterior(competencia)}: 5º dia útil (sábado conta; domingos e feriados da loja não contam).`,
    });
  } else if (s?.tipo === "dia_fixo" && s.dia) {
    marcos.push({
      tipo: "salario",
      data: diaFixoNoMes(competencia, s.dia),
      rotulo: rotuloSalario,
      curto: rotuloSalario === "Salário" ? "Salário" : "Bolsa",
      detalhe: `Previsão do ${rotuloSalario.toLowerCase()}: todo dia ${s.dia}, conforme a regra da loja.`,
    });
  }
  if (regra.adiantamentoDia) {
    marcos.push({
      tipo: "adiantamento",
      data: diaFixoNoMes(competencia, regra.adiantamentoDia),
      rotulo: "Adiantamento salarial",
      curto: "Adiantamento",
      detalhe: `Previsão do adiantamento salarial: todo dia ${regra.adiantamentoDia}.`,
    });
  }
  if (regra.vaDia) {
    marcos.push({
      tipo: "va",
      data: periodoVaDe(regra.vaDia, 0, `${competencia.slice(0, 7)}-01`).pagamento,
      rotulo: "Vale-alimentação",
      curto: "VA",
      detalhe: `Previsão do crédito do vale-alimentação: todo dia ${regra.vaDia}.`,
    });
  }
  return marcos.sort((a, b) => a.data.localeCompare(b.data) || ORDEM[a.tipo] - ORDEM[b.tipo]);
}

/** Agrupa os marcos por data. */
export function marcosPorData<T extends { data: string }>(marcos: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of marcos) m.set(x.data, [...(m.get(x.data) ?? []), x]);
  return m;
}

export interface MarcoPagamentoUnidades extends MarcoPagamento {
  /** Unidades em que o marco cai nesta data. */
  unidades: string[];
}

/**
 * Junta marcos de várias unidades (visão do gestor com "todas as unidades"):
 * o mesmo tipo na mesma data vira um item só, com a lista das lojas.
 */
export function unirMarcosUnidades(
  porUnidade: { unidade: string; marcos: MarcoPagamento[] }[],
): MarcoPagamentoUnidades[] {
  const m = new Map<string, MarcoPagamentoUnidades>();
  for (const { unidade, marcos } of porUnidade) {
    for (const x of marcos) {
      const k = `${x.data}|${x.tipo}`;
      const atual = m.get(k);
      if (atual) {
        if (!atual.unidades.includes(unidade)) atual.unidades.push(unidade);
      } else m.set(k, { ...x, unidades: [unidade] });
    }
  }
  return [...m.values()].sort((a, b) => a.data.localeCompare(b.data) || ORDEM[a.tipo] - ORDEM[b.tipo]);
}
