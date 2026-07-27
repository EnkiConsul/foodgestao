// ------------------------------------------------------------------
// Domínio: DP → Gerador de escala (Fase 3)
// Funções puras: recebem o estado já carregado do banco e devolvem as
// folgas propostas para o período, mais os alertas de conformidade.
// Precedência: override individual > jornada vigente > política da empresa.
// ------------------------------------------------------------------

export interface EscalaColaborador {
  id: string;
  nome: string;
  sexo?: string | null;
  unidadeId?: string | null;
  /** Dias de folga do modelo de jornada vigente (0 = domingo). */
  diasFolga: number[];
  /** Override individual de dia fixo de folga (0 = domingo). */
  folgaFixa?: number | null;
}

export interface EscalaInput {
  /** Data inicial do período (ISO yyyy-mm-dd). */
  inicio: string;
  /** Data final do período (ISO yyyy-mm-dd), inclusive. */
  fim: string;
  colaboradores: EscalaColaborador[];
  /** Datas bloqueadas para folga (ISO). */
  bloqueadas?: Set<string>;
  /** Ausências (férias, afastamentos) no formato `colaboradorId|data`. */
  ausencias?: Set<string>;
  /** Folgas já existentes no formato `colaboradorId|data`. */
  folgasExistentes?: Set<string>;
  /** Limite de folgas por data (dp_dia_config). Ausente = sem limite. */
  limitePorDia?: Map<string, number>;
  /** Periodicidade de folga dominical em semanas (0 = não exigir). */
  periodicidadeDomingo: number;
  /** Periodicidade de folga dominical para mulheres (Art. 386 CLT). */
  periodicidadeDomingoMulher: number;
}

export interface EscalaProposta {
  colaboradorId: string;
  nome: string;
  data: string;
  motivo: string;
}

export type EscalaAlertaTipo = "dsr" | "domingo" | "carga";

export interface EscalaAlerta {
  colaboradorId: string;
  nome: string;
  tipo: EscalaAlertaTipo;
  mensagem: string;
}

export interface EscalaResultado {
  propostas: EscalaProposta[];
  alertas: EscalaAlerta[];
  /** Semanas analisadas (blocos de 7 dias a partir de `inicio`). */
  semanas: string[][];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Todas as datas ISO entre `inicio` e `fim`, inclusive. */
export function intervaloDatas(inicio: string, fim: string): string[] {
  const out: string[] = [];
  const end = parseIso(fim);
  const cur = parseIso(inicio);
  while (cur <= end) {
    out.push(toIso(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Fatia o período em blocos de 7 dias (o último pode ser parcial). */
export function semanasDoPeriodo(inicio: string, fim: string): string[][] {
  const dias = intervaloDatas(inicio, fim);
  const out: string[][] = [];
  for (let i = 0; i < dias.length; i += 7) out.push(dias.slice(i, i + 7));
  return out;
}

function periodicidadeDo(colab: EscalaColaborador, input: EscalaInput): number {
  const geral = input.periodicidadeDomingo;
  if (colab.sexo === "F") {
    const f = input.periodicidadeDomingoMulher;
    if (f > 0 && (geral <= 0 || f < geral)) return f;
  }
  return geral;
}

/**
 * Gera a escala de folgas do período: uma folga por semana para cada
 * colaborador, respeitando bloqueios, ausências, folgas já lançadas e o
 * limite diário de folgas por data. Emite alertas quando o DSR semanal ou
 * a periodicidade de folga dominical não puderam ser atendidos.
 */
export function gerarEscala(input: EscalaInput): EscalaResultado {
  const bloqueadas = input.bloqueadas ?? new Set<string>();
  const ausencias = input.ausencias ?? new Set<string>();
  const existentes = input.folgasExistentes ?? new Set<string>();
  const limites = input.limitePorDia ?? new Map<string, number>();

  const semanas = semanasDoPeriodo(input.inicio, input.fim);
  const propostas: EscalaProposta[] = [];
  const alertas: EscalaAlerta[] = [];

  // Ocupação por data: folgas já existentes contam para o limite diário.
  const ocupacao = new Map<string, number>();
  for (const chave of existentes) {
    const data = chave.split("|")[1];
    if (data) ocupacao.set(data, (ocupacao.get(data) ?? 0) + 1);
  }

  const cabe = (data: string) => {
    const limite = limites.get(data);
    if (limite == null) return true;
    return (ocupacao.get(data) ?? 0) < limite;
  };

  for (const colab of input.colaboradores) {
    const periodicidade = periodicidadeDo(colab, input);
    let semanasDesdeDomingo = 0;

    semanas.forEach((semana, idx) => {
      const jaFolgaNaSemana = semana.some((d) => existentes.has(`${colab.id}|${d}`));
      const domingoFolgado = semana.some(
        (d) => parseIso(d).getDay() === 0 && existentes.has(`${colab.id}|${d}`),
      );
      if (domingoFolgado) semanasDesdeDomingo = 0;
      else semanasDesdeDomingo += 1;

      if (jaFolgaNaSemana) return;

      const disponivel = (d: string) =>
        !bloqueadas.has(d) && !ausencias.has(`${colab.id}|${d}`) && !existentes.has(`${colab.id}|${d}`) && cabe(d);

      const precisaDomingo = periodicidade > 0 && semanasDesdeDomingo >= periodicidade;

      const preferencias: { data: string; motivo: string }[] = [];
      if (precisaDomingo) {
        const domingo = semana.find((d) => parseIso(d).getDay() === 0);
        if (domingo) preferencias.push({ data: domingo, motivo: "Folga dominical (periodicidade legal)" });
      }
      if (colab.folgaFixa != null) {
        const d = semana.find((x) => parseIso(x).getDay() === colab.folgaFixa);
        if (d) preferencias.push({ data: d, motivo: "Dia fixo do colaborador" });
      }
      for (const dia of colab.diasFolga) {
        const d = semana.find((x) => parseIso(x).getDay() === dia);
        if (d) preferencias.push({ data: d, motivo: "Dia de folga da jornada" });
      }
      for (const d of semana) preferencias.push({ data: d, motivo: "Ajuste para garantir o DSR semanal" });

      const escolhida = preferencias.find((p) => disponivel(p.data));

      if (!escolhida) {
        alertas.push({
          colaboradorId: colab.id,
          nome: colab.nome,
          tipo: "dsr",
          mensagem: `Semana de ${semana[0]} a ${semana[semana.length - 1]}: nenhuma data disponível para o descanso semanal.`,
        });
        return;
      }

      propostas.push({
        colaboradorId: colab.id,
        nome: colab.nome,
        data: escolhida.data,
        motivo: escolhida.motivo,
      });
      ocupacao.set(escolhida.data, (ocupacao.get(escolhida.data) ?? 0) + 1);
      if (parseIso(escolhida.data).getDay() === 0) semanasDesdeDomingo = 0;
      else if (precisaDomingo) {
        alertas.push({
          colaboradorId: colab.id,
          nome: colab.nome,
          tipo: "domingo",
          mensagem: `Semana ${idx + 1}: a folga dominical exigida a cada ${periodicidade} semana(s) não pôde ser alocada.`,
        });
      }
    });
  }

  propostas.sort((a, b) => (a.data === b.data ? a.nome.localeCompare(b.nome) : a.data.localeCompare(b.data)));
  return { propostas, alertas, semanas };
}
