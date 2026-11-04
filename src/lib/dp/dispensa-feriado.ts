// Pedido de dispensa de feriado feito pelo colaborador no portal.
// Regra: pedir é livre; só a aprovação expressa do gestor dispensa. Sem resposta, continua convocado.

export const TERMO_DISPENSA_FERIADO_VERSAO = "v1";

export function textoTermoDispensaFeriado(nomeFeriado: string, dataLegivel: string): string {
  return [
    `Solicito ser dispensado(a) do trabalho no feriado ${nomeFeriado} (${dataLegivel}), para o qual fui convocado(a).`,
    "Estou ciente de que este pedido NÃO me autoriza a faltar: a convocação continua valendo até a aprovação expressa do gestor.",
    "Se o gestor não responder ou recusar, continuo convocado(a) e devo comparecer normalmente. A ausência sem aprovação é falta injustificada, com possível desconto do dia e do descanso semanal remunerado.",
    "Se aprovado, o dia é tratado como feriado de descanso, sem desconto, mas sem pagamento em dobro, adicional ou folga compensatória.",
  ].join(" ");
}

export type PedidoDispensaStatus = "pendente" | "aprovada" | "recusada" | string;

/** Enquanto não houver aprovação expressa, a pessoa segue convocada. */
export function segueConvocado(status: PedidoDispensaStatus | null | undefined): boolean {
  return status !== "aprovada";
}

export function montarMotivoPedidoDispensa(p: {
  nomeFeriado: string;
  justificativa: string;
  assinatura: string;
  aceitoEm: string;
}): string {
  const just = p.justificativa.trim();
  const nome = p.assinatura.trim();
  if (just.length < 5) throw new Error("Escreva o motivo do pedido (mín. 5 letras).");
  if (nome.length < 3) throw new Error("Digite seu nome completo para assinar.");
  const txt = `Dispensa em Feriado (${p.nomeFeriado}) — a pedido do colaborador · ${just} · Termo ${TERMO_DISPENSA_FERIADO_VERSAO} assinado por ${nome} em ${p.aceitoEm}`;
  if (txt.length > 500) throw new Error("Motivo muito longo. Resuma um pouco.");
  return txt;
}

/** Pedido de dispensa de feriado feito pelo colaborador (portal). */
export function ehPedidoDispensaFeriado(motivo: string | null | undefined): boolean {
  return /^Dispensa em Feriado .*a pedido do colaborador/.test(motivo ?? "");
}

/** Recusa exige motivo escrito pelo gestor (o colaborador continua convocado). */
export function validarRecusaDispensa(resposta: string): string {
  const t = resposta.trim();
  if (t.length < 3) throw new Error("Escreva o motivo da recusa.");
  return t;
}
