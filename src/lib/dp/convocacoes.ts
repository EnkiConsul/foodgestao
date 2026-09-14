// ------------------------------------------------------------------
// Domínio: DP → Convocações (Fase 5)
// Contratos intermitentes não têm horário previsto: as horas nascem de
// convocações aceitas. Funções puras — nenhuma consulta ao banco aqui.
// ------------------------------------------------------------------

import { turnoSnapshot, type TurnoSnapshot } from "@/lib/dp/turno-utils";
import { contratoPolicy, type RegimeTrabalho } from "@/lib/dp/contrato-policy";

export type ConvocacaoStatus =
  | "pendente"
  | "aceita"
  | "recusada"
  | "cancelada"
  | "expirada"
  | "sem_resposta"
  | "encerrada_sem_vaga"
  | "encerrada_inicio_ocorrencia"
  | "desistida"
  | "substituida"
  | "encerrada_operacionalmente";

export interface Convocacao {
  id: string;
  colaborador_id: string;
  data: string;
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  termina_no_dia_seguinte: boolean;
  carga_prevista_horas: number;
  status: ConvocacaoStatus;
  prazo_resposta: string | null;
}

const NEUTRO = "bg-muted text-muted-foreground border-border";

export const STATUS_META: Record<ConvocacaoStatus, { label: string; className: string }> = {
  pendente: {
    label: "Aguardando resposta",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  },
  aceita: {
    label: "Aceita",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  },
  recusada: {
    label: "Recusada",
    className: "bg-destructive/15 text-destructive border-destructive/40",
  },
  cancelada: { label: "Cancelada", className: NEUTRO },
  expirada: { label: "Prazo expirado", className: NEUTRO },
  sem_resposta: { label: "Prazo encerrado", className: NEUTRO },
  encerrada_sem_vaga: { label: "Vagas preenchidas", className: NEUTRO },
  encerrada_inicio_ocorrencia: {
    label: "O período para responder terminou porque o trabalho já iniciou",
    className: NEUTRO,
  },
  desistida: { label: "Desistência", className: "bg-destructive/15 text-destructive border-destructive/40" },
  substituida: { label: "Substituída", className: NEUTRO },
  encerrada_operacionalmente: {
    label: "Concluída",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  },
};


/** Só contratos intermitentes podem ser convocados. */
export function podeConvocar(regime: RegimeTrabalho | null | undefined): boolean {
  if (!regime) return false;
  return contratoPolicy(regime).horasPorConvocacao;
}

/** O prazo de resposta já passou? */
export function prazoExpirado(prazo: string | null | undefined, agora: Date = new Date()): boolean {
  if (!prazo) return false;
  return agora.getTime() > new Date(prazo).getTime();
}

/** Status efetivo exibido na UI: pendente vencido vira "expirada". */
export function statusEfetivo(
  c: Pick<Convocacao, "status" | "prazo_resposta">,
  agora: Date = new Date(),
): ConvocacaoStatus {
  if (c.status === "pendente" && prazoExpirado(c.prazo_resposta, agora)) return "expirada";
  return c.status;
}

/** O colaborador ainda pode aceitar/recusar? */
export function podeResponder(
  c: Pick<Convocacao, "status" | "prazo_resposta">,
  agora: Date = new Date(),
): boolean {
  return statusEfetivo(c, agora) === "pendente";
}

/**
 * Espelho da regra de precedência temporal aplicada no backend (M21):
 * vence o threshold que ocorre PRIMEIRO nos timestamps persistidos.
 * Empate → prazo (sem_resposta). Só um existente → usa o existente.
 */
export function encerramentoPorRelogios(
  args: { prazo_resposta?: string | null; inicio_previsto?: string | null },
  agora: Date = new Date(),
): "sem_resposta" | "encerrada_inicio_ocorrencia" | null {
  const prazo = args.prazo_resposta ? new Date(args.prazo_resposta).getTime() : null;
  const inicio = args.inicio_previsto ? new Date(args.inicio_previsto).getTime() : null;
  const t = agora.getTime();
  if (prazo === null && inicio === null) return null;

  const prazoPrecede = prazo === null ? false : inicio === null ? true : prazo <= inicio;

  if (prazoPrecede) {
    if (t >= (prazo as number)) return "sem_resposta";
    if (inicio !== null && t >= inicio) return "encerrada_inicio_ocorrencia";
    return null;
  }
  if (t >= (inicio as number)) return "encerrada_inicio_ocorrencia";
  if (prazo !== null && t >= prazo) return "sem_resposta";
  return null;
}


export interface NovaConvocacaoInput {
  data: string;
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  prazo_resposta?: string | null;
}

export interface ValidacaoConvocacao {
  campo: "colaborador" | "data" | "horario" | "prazo" | "duplicidade";
  mensagem: string;
}

/** Snapshot de horário gravado na convocação e replicado no item de escala. */
export function snapshotDaConvocacao(input: NovaConvocacaoInput): TurnoSnapshot {
  return turnoSnapshot({
    entrada: input.entrada,
    saida: input.saida,
    intervalo_minutos: input.intervalo_minutos,
  });
}

/** Minutos do dia a partir de "HH:MM[:SS]". */
function minutosDoHorario(h: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(h ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

interface JanelaDia {
  data: string;
  entrada?: string | null;
  saida?: string | null;
  termina_no_dia_seguinte?: boolean | null;
}

/**
 * Duas janelas de dias (podendo virar a madrugada) se sobrepõem?
 * Espelha `dp_colaborador_horario_ocupado` no banco.
 */
export function janelasSobrepostas(a: JanelaDia, b: JanelaDia): boolean {
  const base = (j: JanelaDia) => new Date(`${j.data}T00:00:00`).getTime() / 60000;
  const ini = (j: JanelaDia) => {
    const m = minutosDoHorario(j.entrada);
    return m === null ? null : base(j) + m;
  };
  const fim = (j: JanelaDia) => {
    const m = minutosDoHorario(j.saida);
    if (m === null) return null;
    return base(j) + m + (j.termina_no_dia_seguinte ? 1440 : 0);
  };
  const a1 = ini(a), a2 = fim(a), b1 = ini(b), b2 = fim(b);
  if (a1 === null || a2 === null || b1 === null || b2 === null) return a.data === b.data;
  return a1 < b2 && b1 < a2;
}

/**
 * Valida a convocação antes de gravar: regime, horário, prazo e sobreposição
 * de HORÁRIO com convocações já ativas do mesmo colaborador. Repetir o mesmo
 * dia é permitido, desde que os horários não se cruzem.
 */
export function validarConvocacao(args: {
  colaboradorId: string | null;
  regime: RegimeTrabalho | null | undefined;
  input: NovaConvocacaoInput;
  existentes: (Pick<Convocacao, "data" | "status" | "prazo_resposta"> & Partial<JanelaDia>)[];
  agora?: Date;
}): ValidacaoConvocacao[] {
  const agora = args.agora ?? new Date();
  const erros: ValidacaoConvocacao[] = [];

  if (!args.colaboradorId) {
    erros.push({ campo: "colaborador", mensagem: "Selecione o colaborador." });
  } else if (!podeConvocar(args.regime)) {
    erros.push({
      campo: "colaborador",
      mensagem: "Somente colaboradores com contrato intermitente podem ser convocados.",
    });
  }

  if (!args.input.data) {
    erros.push({ campo: "data", mensagem: "Informe a data da convocação." });
  }

  const snap = snapshotDaConvocacao(args.input);
  if (snap.carga_prevista_horas <= 0) {
    erros.push({ campo: "horario", mensagem: "O horário informado resulta em carga zero." });
  }

  if (args.input.prazo_resposta && prazoExpirado(args.input.prazo_resposta, agora)) {
    erros.push({ campo: "prazo", mensagem: "O prazo de resposta precisa ser no futuro." });
  }

  const nova: JanelaDia = {
    data: args.input.data,
    entrada: (args.input as any).entrada ?? null,
    saida: (args.input as any).saida ?? null,
    termina_no_dia_seguinte: (args.input as any).termina_no_dia_seguinte ?? null,
  };
  const conflito = args.existentes.some(
    (c) =>
      (c.status === "pendente" || c.status === "aceita") &&
      janelasSobrepostas(nova, {
        data: c.data,
        entrada: c.entrada ?? null,
        saida: c.saida ?? null,
        termina_no_dia_seguinte: c.termina_no_dia_seguinte ?? null,
      }),
  );
  if (conflito) {
    erros.push({
      campo: "duplicidade",
      mensagem: "Este colaborador já tem convocação ativa em horário que se sobrepõe a este.",
    });
  }

  return erros;
}


  return erros;
}

/** Total de horas efetivamente contratadas no período (apenas aceitas). */
export function horasAceitas(convocacoes: Pick<Convocacao, "status" | "carga_prevista_horas">[]): number {
  const total = convocacoes
    .filter((c) => c.status === "aceita")
    .reduce((acc, c) => acc + Number(c.carga_prevista_horas || 0), 0);
  return Math.round(total * 100) / 100;
}


/**
 * Janela do dia já começou e ainda não terminou? Nesse intervalo a pessoa
 * ainda pode responder — com justificativa. Espelha a regra do servidor.
 */
export function janelaEmAndamento(
  args: { inicio_previsto?: string | null; fim_previsto?: string | null },
  agora: Date = new Date(),
): boolean {
  if (!args.inicio_previsto || !args.fim_previsto) return false;
  const t = agora.getTime();
  return t >= new Date(args.inicio_previsto).getTime() && t < new Date(args.fim_previsto).getTime();
}

/** Minutos entre o início previsto e agora (0 quando ainda não começou). */
export function minutosDeAtraso(
  inicio_previsto: string | null | undefined,
  agora: Date = new Date(),
): number {
  if (!inicio_previsto) return 0;
  const diff = agora.getTime() - new Date(inicio_previsto).getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 60000);
}

/** "42 min depois do início" / "1h05 depois do início". */
export function rotuloAtraso(minutos: number | null | undefined): string {
  const m = Number(minutos ?? 0);
  if (!Number.isFinite(m) || m <= 0) return "no horário";
  const h = Math.floor(m / 60);
  const r = m % 60;
  const tempo = h ? (r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`) : `${m} min`;
  return `${tempo} depois do início`;
}
