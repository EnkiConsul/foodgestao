/**
 * Próxima folga do colaborador, de qualquer origem.
 *
 * O portal precisa mostrar a folga mais próxima independentemente do motivo:
 * folga lançada (dominical, sorteio, troca, extra), folga da escala publicada
 * e a folga semanal fixa da configuração de trabalho (ex.: toda quarta-feira).
 */

export type MotivoFolga =
  | "lancada"
  | "extra"
  | "escala"
  | "semanal"
  | "ferias"
  | "feriado";

export type ProximaFolga = {
  data: string;
  motivo: MotivoFolga;
  label: string;
};

export const MOTIVO_FOLGA_LABEL: Record<MotivoFolga, string> = {
  lancada: "Folga marcada",
  extra: "Folga extra",
  escala: "Folga da escala",
  semanal: "Folga semanal",
  ferias: "Férias",
  feriado: "Feriado",
};

export type FolgaLancada = {
  data: string;
  status?: string | null;
  tipo?: string | null;
};

export type ItemEscalaFolga = {
  data: string;
  tipo: string;
};

/** Dias da semana em que o colaborador não trabalha (0 = domingo). */
export type ConfigDia = { dow: number; trabalha: boolean };

const DIA_MS = 86400000;

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** Diferença em dias inteiros entre duas datas ISO (yyyy-mm-dd). */
export function diasAte(hoje: string, data: string): number {
  return Math.round((fromISO(data).getTime() - fromISO(hoje).getTime()) / DIA_MS);
}

/**
 * Escolhe a folga futura mais próxima entre as fontes disponíveis.
 * `hoje` inclusive: uma folga hoje é retornada com 0 dias.
 */
export function proximaFolga(input: {
  hoje: string;
  folgas?: FolgaLancada[];
  escala?: ItemEscalaFolga[];
  configDias?: ConfigDia[];
  /** Quantos dias à frente considerar a folga semanal fixa. */
  horizonteDias?: number;
}): ProximaFolga | null {
  const { hoje, folgas = [], escala = [], configDias = [], horizonteDias = 21 } = input;
  const candidatos: ProximaFolga[] = [];

  for (const f of folgas) {
    if (!f.data || f.data < hoje) continue;
    if (f.status === "cancelada") continue;
    const motivo: MotivoFolga =
      f.tipo === "extra" ? "extra" : f.tipo === "ferias" ? "ferias" : "lancada";
    candidatos.push({ data: f.data, motivo, label: MOTIVO_FOLGA_LABEL[motivo] });
  }

  for (const item of escala) {
    if (!item.data || item.data < hoje) continue;
    if (item.tipo === "trabalho") continue;
    const motivo: MotivoFolga =
      item.tipo === "ferias" ? "ferias" : item.tipo === "feriado" ? "feriado" : "escala";
    candidatos.push({ data: item.data, motivo, label: MOTIVO_FOLGA_LABEL[motivo] });
  }

  const dowsFolga = new Set(configDias.filter((c) => !c.trabalha).map((c) => c.dow));
  if (dowsFolga.size > 0) {
    const base = fromISO(hoje);
    for (let i = 0; i <= horizonteDias; i++) {
      const d = new Date(base.getTime() + i * DIA_MS);
      if (dowsFolga.has(d.getDay())) {
        candidatos.push({ data: toISO(d), motivo: "semanal", label: MOTIVO_FOLGA_LABEL.semanal });
        break;
      }
    }
  }

  if (candidatos.length === 0) return null;

  // Data mais próxima ganha; empatando, a folga explicitamente lançada tem prioridade.
  const prioridade: Record<MotivoFolga, number> = {
    ferias: 0,
    lancada: 1,
    extra: 1,
    escala: 2,
    feriado: 2,
    semanal: 3,
  };
  candidatos.sort((a, b) =>
    a.data === b.data ? prioridade[a.motivo] - prioridade[b.motivo] : a.data < b.data ? -1 : 1,
  );
  return candidatos[0];
}

/** Texto curto para o card do portal. */
export function textoProximaFolga(folga: ProximaFolga | null, hoje: string): string {
  if (!folga) return "Sem folga prevista";
  const dias = diasAte(hoje, folga.data);
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  return `Em ${dias} dias`;
}
