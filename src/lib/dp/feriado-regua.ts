/** Régua preventiva de convocação para feriados (D-10 revisão, D-5 último aviso). */
export type EtapaFeriado = "revisao" | "ultimo_aviso" | "convocacao_definitiva" | null;

export function diasAte(hoje: string, data: string): number {
  const a = Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10));
  const b = Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export function etapaFeriado(hoje: string, data: string): EtapaFeriado {
  const d = diasAte(hoje, data);
  if (d < 0 || d > 10) return null;
  if (d > 5) return "revisao";
  if (d === 5) return "ultimo_aviso";
  return "convocacao_definitiva";
}

export function mensagemFeriado(etapa: Exclude<EtapaFeriado, null>, convocaAuto: boolean): string {
  if (!convocaAuto) {
    return "Feriado sem escala definida. Faça a convocação manual de quem vai trabalhar. Se incluir quem tem folga fixa nesse dia, a dobra é devida.";
  }
  if (etapa === "revisao") return "Revise quem você NÃO vai precisar no feriado. Até 5 dias antes a desconvocação é livre.";
  if (etapa === "ultimo_aviso") return "Último aviso: após hoje, quem estiver convocado não poderá ser desconvocado sem pagar o dia.";
  return "Convocação definitiva. Desconvocar agora (exceto a pedido do colaborador) mantém o pagamento do dia.";
}

/** Régua antes do fechamento automático da janela de folgas (D-10, D-5, D-1). */
export type EtapaFechamento = "d10" | "d5" | "d1" | null;

/** Data do próximo fechamento (dia `fechaDia` deste mês, ou do próximo se já passou) e mês de competência. */
export function proximoFechamento(hoje: string, fechaDia: number): { fechamento: string; competencia: string } {
  let y = +hoje.slice(0, 4), m = +hoje.slice(5, 7);
  const dia = Math.min(Math.max(fechaDia, 1), 28);
  if (+hoje.slice(8, 10) > dia) { m++; if (m > 12) { m = 1; y++; } }
  const p = (n: number) => String(n).padStart(2, "0");
  const cm = m === 12 ? 1 : m + 1, cy = m === 12 ? y + 1 : y;
  return { fechamento: `${y}-${p(m)}-${p(dia)}`, competencia: `${cy}-${p(cm)}` };
}

export function etapaFechamento(hoje: string, fechamento: string): EtapaFechamento {
  const d = diasAte(hoje, fechamento);
  if (d === 10) return "d10";
  if (d === 5) return "d5";
  if (d === 1) return "d1";
  return null;
}

export function mensagemFechamento(etapa: Exclude<EtapaFechamento, null>, convocaAuto: boolean): string {
  const base = convocaAuto
    ? "A convocação automática vai convocar quem trabalha nesses dias. Revise se a loja vai abrir e quem você NÃO vai precisar."
    : "A loja não usa convocação automática: monte a equipe de cada feriado antes do fechamento.";
  if (etapa === "d1") return `Último dia para ajustar a equipe dos feriados. ${base} Depois do fechamento, convocar quem estava de folga gera risco e a dobra é devida.`;
  return base;
}
