import { TIPOS_AFASTAMENTO } from "./licencas";

export interface SolicitacaoDatas {
  tipo: string;
  status?: string;
  data_alvo: string | null;
  data_fim?: string | null;
  motivo?: string | null;
  removido_em?: string | null;
}

/** Campos legados de troca são dois dias independentes, nunca um intervalo. */
export function ehTrocaFolga(s: SolicitacaoDatas): boolean {
  return s.tipo === "folga" && !!s.data_fim;
}

export function solicitacaoAusentaNoDia(s: SolicitacaoDatas, dia: string): boolean {
  if (s.status !== "aprovada" || s.removido_em || !s.data_alvo) return false;
  if (s.tipo === "folga") return s.data_alvo === dia;
  if (!(TIPOS_AFASTAMENTO as readonly string[]).includes(s.tipo) && s.tipo !== "outros") return false;
  // Pedidos genéricos não são afastamento; só dispensas administrativas identificadas.
  if (s.tipo === "outros" && !/^(Liberação do Gestor|Ausência do Sócio|Dispensa em Feriado|PEDIDO_DISPENSA_FERIADO)/i.test(s.motivo ?? "")) return false;
  return s.data_alvo <= dia && dia <= (s.data_fim || s.data_alvo);
}

export function datasSolicitacao(s: SolicitacaoDatas): { label: string; data: string | null }[] {
  if (ehTrocaFolga(s)) return [{ label: "Folga atual", data: s.data_fim ?? null }, { label: "Folga desejada", data: s.data_alvo }];
  return [{ label: s.data_fim ? "Data inicial" : "Data", data: s.data_alvo }, ...(s.data_fim ? [{ label: "Data final", data: s.data_fim }] : [])];
}

/** Monthly request lists retain both swap endpoints without inventing intermediate days. */
export function solicitacaoNoPeriodo(s: SolicitacaoDatas, inicio: string, fim: string): boolean {
  if (!s.data_alvo) return false;
  if (s.tipo === "folga") return [s.data_alvo, s.data_fim].some(d => !!d && d >= inicio && d <= fim);
  return s.data_alvo <= fim && (s.data_fim || s.data_alvo) >= inicio;
}