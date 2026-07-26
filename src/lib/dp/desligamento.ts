export type MotivoDesligamento =
  | "pedido_demissao"
  | "dispensa_sem_justa_causa"
  | "dispensa_com_justa_causa"
  | "termino_contrato"
  | "acordo_mutuo"
  | "abandono_emprego"
  | "aposentadoria"
  | "falecimento"
  | "outro";

export type ElegibilidadeRecontratacao = "sim" | "nao" | "com_ressalvas";

export const MOTIVO_DESLIGAMENTO_LABEL: Record<MotivoDesligamento, string> = {
  pedido_demissao: "Pedido de demissão",
  dispensa_sem_justa_causa: "Dispensa sem justa causa",
  dispensa_com_justa_causa: "Dispensa com justa causa",
  termino_contrato: "Término de contrato / experiência",
  acordo_mutuo: "Acordo mútuo",
  abandono_emprego: "Abandono de emprego",
  aposentadoria: "Aposentadoria",
  falecimento: "Falecimento",
  outro: "Outro",
};

export const MOTIVO_DESLIGAMENTO_OPTIONS = Object.entries(MOTIVO_DESLIGAMENTO_LABEL).map(
  ([value, label]) => ({ value: value as MotivoDesligamento, label }),
);

export const ELEGIBILIDADE_LABEL: Record<ElegibilidadeRecontratacao, string> = {
  sim: "Sim, recontrataria",
  nao: "Não recontrataria",
  com_ressalvas: "Com ressalvas",
};

export const ELEGIBILIDADE_OPTIONS = Object.entries(ELEGIBILIDADE_LABEL).map(([value, label]) => ({
  value: value as ElegibilidadeRecontratacao,
  label,
}));

export const DIAS_CARENCIA_PORTAL_DEFAULT = 30;

/** Converte 'YYYY-MM-DD' em Date local (sem drift de fuso). */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Data-limite de acesso ao portal = data de demissão + dias de carência. */
export function calcAcessoPortalAte(
  dataDesligamento: string,
  dias: number = DIAS_CARENCIA_PORTAL_DEFAULT,
): string {
  const base = parseDateOnly(dataDesligamento);
  base.setDate(base.getDate() + Math.max(0, Math.trunc(dias)));
  return toDateOnly(base);
}

/** Acesso do portal continua válido até o fim do dia da data-limite. */
export function acessoPortalAtivo(acessoAte: string | null | undefined, hoje: Date = new Date()): boolean {
  if (!acessoAte) return false;
  return toDateOnly(hoje) <= acessoAte;
}

/** Dias restantes de carência (0 quando vence hoje, negativo quando expirado). */
export function diasRestantesCarencia(
  acessoAte: string | null | undefined,
  hoje: Date = new Date(),
): number | null {
  if (!acessoAte) return null;
  const fim = parseDateOnly(acessoAte).getTime();
  const inicio = parseDateOnly(toDateOnly(hoje)).getTime();
  return Math.round((fim - inicio) / 86_400_000);
}
