/**
 * Regras puras das pendências de calendário: pagamento de vales (VA/VT) e
 * unidades sem feriados cadastrados.
 *
 * Vale: aparece como "próxima" 2 dias antes do dia de pagamento, vira
 * urgente no próprio dia e atrasada depois, até a apuração ser fechada.
 */

export const VALE_ANTECEDENCIA_DIAS = 2;

const pad = (n: number) => String(n).padStart(2, "0");
const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Data de pagamento do vale no mês (dia ajustado ao último dia do mês). */
export function dataPagamentoNoMes(diaPagamento: number, ano: number, mes: number): string {
  const dia = Math.min(Math.max(1, diaPagamento), diasNoMes(ano, mes));
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

function diffDias(aISO: string, bISO: string) {
  const a = Date.UTC(+aISO.slice(0, 4), +aISO.slice(5, 7) - 1, +aISO.slice(8, 10));
  const b = Date.UTC(+bISO.slice(0, 4), +bISO.slice(5, 7) - 1, +bISO.slice(8, 10));
  return Math.round((a - b) / 86400000);
}

export type CicloValePendente = {
  /** Data de pagamento (YYYY-MM-DD). */
  vencimento: string;
  /** Competência do ciclo (YYYY-MM-01) = mês do pagamento. */
  competencia: string;
  /** Positivo = dias de atraso; 0 = hoje; negativo = faltam dias. */
  atrasoDias: number;
  urgente: boolean;
};

/**
 * Ciclos de pagamento que já entraram na janela de alerta e ainda não foram
 * fechados. Olha o mês atual e o anterior (para cobrar o atraso).
 */
export function ciclosValePendentes(opts: {
  diaPagamento: number | null | undefined;
  hojeISO: string;
  /** Competências (YYYY-MM-01) já fechadas na apuração. */
  competenciasFechadas: Set<string>;
}): CicloValePendente[] {
  const { diaPagamento, hojeISO, competenciasFechadas } = opts;
  if (!diaPagamento || diaPagamento < 1 || diaPagamento > 31) return [];
  const ano = +hojeISO.slice(0, 4);
  const mes = +hojeISO.slice(5, 7);
  const meses: Array<[number, number]> = [
    mes === 1 ? [ano - 1, 12] : [ano, mes - 1],
    [ano, mes],
  ];
  const out: CicloValePendente[] = [];
  for (const [a, m] of meses) {
    const competencia = `${a}-${pad(m)}-01`;
    const proxima = m === 12 ? `${a + 1}-01-01` : `${a}-${pad(m + 1)}-01`;
    // Apuração fechada na competência do pagamento ou do mês seguinte encerra o ciclo.
    if (competenciasFechadas.has(competencia) || competenciasFechadas.has(proxima)) continue;
    const vencimento = dataPagamentoNoMes(diaPagamento, a, m);
    const atrasoDias = diffDias(hojeISO, vencimento);
    if (atrasoDias < -VALE_ANTECEDENCIA_DIAS) continue;
    out.push({ vencimento, competencia, atrasoDias, urgente: atrasoDias >= 0 });
  }
  return out;
}

/** Unidades ativas sem nenhum feriado ativo que caia no ano informado. */
export function unidadesSemFeriados<U extends { id: string }>(
  unidades: U[],
  unidadesComFeriado: Set<string>,
): U[] {
  return unidades.filter((u) => !unidadesComFeriado.has(u.id));
}
