/**
 * Sequência de dias trabalhados sem descanso (DSR).
 *
 * A CLT garante repouso semanal remunerado: trabalhar 7 dias ou mais seguidos
 * gera passivo. Ao propor troca de folga o portal simula a nova escala e avisa
 * antes de o pedido seguir para o colega ou para o gestor.
 */
import { addDays } from "date-fns";
import { parseYMD, ymd } from "./dataLocal";

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
  const sequencia = diaCedidoIso
    ? maiorSequenciaTrabalhada({ dataIso: diaCedidoIso, descansoIso: simulado })
    : 0;
  return { sequencia, risco: sequencia >= DSR_LIMITE_DIAS };
}

/** Texto do aviso mostrado ao colaborador e ao gestor. */
export function avisoDsr(sequencia: number): string {
  return `Com esta troca você ficaria ${sequencia} dias seguidos trabalhando sem descanso. A lei garante um dia de descanso a cada semana, então o gestor precisa avaliar antes de aprovar.`;
}
