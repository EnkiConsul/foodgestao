export const STATUS_PROCESSOS_VISIVEIS = ["aviso_em_curso", "suspenso", "aguardando_revisao", "efetivado"];

export function avisoEmAndamento(status: string): boolean {
  return ["aviso_em_curso", "suspenso", "aguardando_revisao"].includes(status);
}

export function situacaoPagamento(p: { prazo_10_dias: string; pagamento_status: string }, hoje: string): string {
  if (p.pagamento_status === "pago") return "Pago";
  if (p.prazo_10_dias < hoje) return "Prazo vencido";
  if (p.prazo_10_dias === hoje) return "Vence hoje";
  return p.pagamento_status === "programado" ? "Programado" : "Pendente";
}

export const caminhoDesligamento = (id: string) => `/dp/colaboradores?editar=${encodeURIComponent(id)}&aba=desligamento`;

export function diasAtePrazo(prazo: string, hoje: string): number {
  return Math.round((Date.parse(`${prazo}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);
}