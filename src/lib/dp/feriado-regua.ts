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
