/**
 * Regras de apresentação do período mensal em que o trabalhador convocável
 * informa indisponibilidade. As datas efetivas vêm sempre do backend
 * (`dp_disponibilidade_janela` / `dp_minha_disponibilidade_janela`) — aqui só
 * traduzimos o resultado para texto. Nenhuma data é fixada no código.
 */

export type JanelaEstado = "antes" | "aberta" | "encerrada";

export interface DisponibilidadeJanela {
  competencia: string; // YYYY-MM-01
  hoje: string; // YYYY-MM-DD
  abre: string; // YYYY-MM-DD
  fecha: string; // YYYY-MM-DD
  estado: JanelaEstado;
  abre_dia: number;
  fecha_dia: number;
  reserva_folga: boolean;
  lembrete_dias: number;
  lembrete_em: string; // YYYY-MM-DD
  timezone: string;
  convocavel?: boolean;
  regime?: string | null;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "2026-10-01" -> "Outubro/2026" */
export function competenciaLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const [ano, mes] = iso.split("-");
  const i = Number(mes) - 1;
  if (!ano || i < 0 || i > 11) return "";
  return `${MESES[i]}/${ano}`;
}

/** "2026-10-05" -> "05/10" */
export function diaMes(iso: string | null | undefined): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : "";
}

/** Mensagem principal exibida no portal conforme o estado do período. */
export function mensagemDisponibilidade(j: DisponibilidadeJanela | null | undefined): string {
  if (!j) return "";
  if (j.estado === "antes")
    return `O período para informar sua disponibilidade abre em ${diaMes(j.abre)}.`;
  if (j.estado === "aberta")
    return `Período aberto até ${diaMes(j.fecha)}. Marque só os dias em que você não poderá trabalhar.`;
  return `O período normal de planejamento encerrou em ${diaMes(j.fecha)}.`;
}

/** Verdadeiro quando falta pouco para o fechamento (usa o lembrete configurado). */
export function janelaFechandoEmBreve(j: DisponibilidadeJanela | null | undefined): boolean {
  if (!j || j.estado !== "aberta") return false;
  return j.hoje >= j.lembrete_em;
}
