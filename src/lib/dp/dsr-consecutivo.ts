/**
 * Sequência de dias trabalhados sem descanso (DSR).
 *
 * A CLT garante repouso semanal remunerado: trabalhar 7 dias ou mais seguidos
 * gera passivo. Ao propor troca de folga o portal simula a nova escala e avisa
 * antes de o pedido seguir para o colega ou para o gestor.
 */
import { addDays } from "date-fns";
import { parseYMD, ymd } from "./folga-rules";

/** Limite legal: a partir daqui a sequência é irregular. */
export const DSR_LIMITE_DIAS = 7;

/**
 * Maior sequência de dias trabalhados que passa pela data informada.
 * `descansoIso` contém os dias de descanso (folgas registradas e folga fixa).
 */
export function maiorSequenciaTrabalhada(params: {
  dataIso: string;
  descansoIso: Set<string>;
  janelaDias?: number;
}): number {
  const { dataIso, descansoIso, janelaDias = 14 } = params;
  if (!dataIso) return 0;
  const base = parseYMD(dataIso);
  if (descansoIso.has(dataIso)) return 0;

  let total = 1;
  for (let i = 1; i <= janelaDias; i++) {
    if (descansoIso.has(ymd(addDays(base, -i)))) break;
    total += 1;
  }
  for (let i = 1; i <= janelaDias; i++) {
    if (descansoIso.has(ymd(addDays(base, i)))) break;
    total += 1;
  }
  return total;
}

/**
 * Avalia a troca de uma folga por outro dia: devolve a maior sequência
 * trabalhada resultante e se ela passa do limite legal.
 */
export function avaliarRiscoDsrTroca(params: {
  descansoIso: Set<string>;
  diaCedidoIso: string;
  diaNovoIso: string;
}): { sequencia: number; risco: boolean } {
  const { descansoIso, diaCedidoIso, diaNovoIso } = params;
  const simulado = new Set(descansoIso);
  if (diaCedidoIso) simulado.delete(diaCedidoIso);
  if (diaNovoIso) simulado.add(diaNovoIso);
  // Avalia a semana anterior e a seguinte aos dois dias envolvidos: a troca
  // pode alongar a sequência antes ou depois do dia cedido.
  let sequencia = 0;
  if (diaCedidoIso) {
    const datas = [diaCedidoIso, diaNovoIso].filter(Boolean).map(parseYMD);
    const ini = new Date(Math.min(...datas.map((d) => d.getTime())));
    const fim = new Date(Math.max(...datas.map((d) => d.getTime())));
    for (let d = addDays(ini, -7); d <= addDays(fim, 7); d = addDays(d, 1)) {
      const iso = ymd(d);
      if (simulado.has(iso)) continue;
      sequencia = Math.max(sequencia, maiorSequenciaTrabalhada({ dataIso: iso, descansoIso: simulado }));
    }
  }
  return { sequencia, risco: sequencia >= DSR_LIMITE_DIAS };
}

/** Texto do aviso mostrado ao colaborador. */
export function avisoDsr(sequencia: number): string {
  return `Com esta troca você ficaria ${sequencia} dias seguidos trabalhando sem descanso. A lei garante um dia de descanso a cada semana (o limite é de 6 dias seguidos de trabalho).`;
}

/** Texto do aviso mostrado ao gestor. */
export function avisoDsrGestor(sequencia: number): string {
  return `Com esta mudança o colaborador ficaria ${sequencia} dias seguidos trabalhando sem descanso (o limite legal é de 6 dias). Trabalhar 7 dias ou mais sem descanso gera pagamento em dobro.`;
}

/**
 * Monta o conjunto de dias de descanso: folgas registradas + dias fixos da
 * semana dentro da janela informada (com 21 dias de folga para trás).
 */
export function descansosDoColaborador(params: {
  folgasIso: string[];
  diasFixos: number[];
  inicioIso: string;
  dias: number;
}): Set<string> {
  const s = new Set(params.folgasIso);
  if (params.diasFixos.length) {
    const base = parseYMD(params.inicioIso);
    for (let i = -21; i <= params.dias; i++) {
      const d = addDays(base, i);
      if (params.diasFixos.includes(d.getDay())) s.add(ymd(d));
    }
  }
  return s;
}
