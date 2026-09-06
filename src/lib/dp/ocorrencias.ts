import type { Database } from "@/integrations/supabase/types";

export type OcorrenciaTipo = Database["public"]["Enums"]["dp_ocorrencia_tipo"];
export type OcorrenciaEstado = Database["public"]["Enums"]["dp_ocorrencia_estado"];
export type OcorrenciaImpacto = Database["public"]["Enums"]["dp_ocorrencia_impacto"];
export type OcorrenciaOrigem = Database["public"]["Enums"]["dp_ocorrencia_origem"];
export type OcorrenciaAnalise = Database["public"]["Enums"]["dp_ocorrencia_analise_status"];
export type OcorrenciaMarcacao = Database["public"]["Enums"]["dp_ocorrencia_marcacao"];
export type OcorrenciaTratativa = Database["public"]["Enums"]["dp_ocorrencia_tratativa_status"];

/** Rótulos administrativos (tela do gestor). */
export const TIPO_LABEL: Record<OcorrenciaTipo, string> = {
  falta: "Falta",
  previsao_falta: "Previsão de falta",
  atraso: "Atraso",
  previsao_atraso: "Previsão de atraso",
  atestado: "Atestado",
  ausencia_justificada: "Ausência justificada",
  saida_antecipada: "Saída antecipada",
  previsao_saida_antecipada: "Previsão de saída antecipada",
  esquecimento_marcacao: "Esquecimento de marcação",
  atraso_intervalo: "Atraso no retorno do intervalo",
  previsao_atraso_intervalo: "Previsão de atraso no retorno do intervalo",
  divergencia_jornada: "Outra divergência de jornada",
};

export const ESTADO_LABEL: Record<OcorrenciaEstado, string> = {
  informada: "Informada",
  aguardando_confirmacao: "Aguardando confirmação",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
};

export const IMPACTO_LABEL: Record<OcorrenciaImpacto, string> = {
  sim: "Sim",
  nao: "Não",
  aguardando: "A definir",
  nao_se_aplica: "Não se aplica",
};

export const ANALISE_LABEL: Record<OcorrenciaAnalise, string> = {
  pendente: "Análise pendente",
  analisada: "Analisada",
  nao_se_aplica: "Não se aplica",
};

export const TRATATIVA_LABEL: Record<OcorrenciaTratativa, string> = {
  pendente: "Tratativa pendente",
  concluida: "Tratativa concluída",
  nao_se_aplica: "Sem tratativa",
};

export const MARCACAO_LABEL: Record<OcorrenciaMarcacao, string> = {
  entrada: "Entrada",
  saida: "Saída",
  intervalo_inicio: "Início do intervalo",
  intervalo_retorno: "Retorno do intervalo",
};

export const ORIGEM_LABEL: Record<OcorrenciaOrigem, string> = {
  colaborador: "Informado pelo colaborador",
  gestor: "Registrado pelo gestor",
  sistema: "Gerado pelo sistema",
};

/** Tipos que representam apenas uma previsão, ainda sem confirmação. */
export const TIPOS_PREVISAO: OcorrenciaTipo[] = [
  "previsao_falta",
  "previsao_atraso",
  "previsao_saida_antecipada",
  "previsao_atraso_intervalo",
];

/** Previsão → fato correspondente. */
export const CONFIRMACAO_DE: Partial<Record<OcorrenciaTipo, OcorrenciaTipo>> = {
  previsao_falta: "falta",
  previsao_atraso: "atraso",
  previsao_saida_antecipada: "saida_antecipada",
  previsao_atraso_intervalo: "atraso_intervalo",
};

export const TIPOS_ORDEM: OcorrenciaTipo[] = [
  "falta",
  "previsao_falta",
  "atraso",
  "previsao_atraso",
  "atestado",
  "ausencia_justificada",
  "saida_antecipada",
  "previsao_saida_antecipada",
  "esquecimento_marcacao",
  "atraso_intervalo",
  "previsao_atraso_intervalo",
  "divergencia_jornada",
];

export type OcorrenciaCor = "vermelho" | "amarelo" | "verde" | "neutro";

/**
 * Cor da ocorrência na rotina:
 * vermelho = problema operacional agora; amarelo = atenção/previsão;
 * verde = coberto/resolvido; neutro = administrativo.
 */
export function corOcorrencia(o: {
  tipo: OcorrenciaTipo;
  estado: OcorrenciaEstado;
  relevancia_operacional: boolean;
  coberturaResolvida?: boolean;
  coberturaPendente?: boolean;
}): OcorrenciaCor {
  if (o.estado === "cancelada") return "neutro";
  if (o.coberturaResolvida) return "verde";
  if (o.coberturaPendente) return "amarelo";
  if (!o.relevancia_operacional) return "neutro";
  if (o.tipo === "atestado") return "neutro";
  if (TIPOS_PREVISAO.includes(o.tipo)) return "amarelo";
  if (o.tipo === "falta") return "vermelho";
  return "amarelo";
}

export const COR_CLASSE: Record<OcorrenciaCor, string> = {
  vermelho: "border-destructive/40 bg-destructive/5",
  amarelo: "border-amber-500/40 bg-amber-500/5",
  verde: "border-emerald-500/40 bg-emerald-500/5",
  neutro: "border-border bg-muted/30",
};

export const COR_BADGE: Record<OcorrenciaCor, string> = {
  vermelho: "border-destructive/40 text-destructive",
  amarelo: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  verde: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  neutro: "border-border text-muted-foreground",
};

/** Texto curto para a rotina, deixando claro previsto x confirmado. */
export function resumoOperacional(o: {
  tipo: OcorrenciaTipo;
  estado: OcorrenciaEstado;
  minutos: number | null;
  horario_estimado: string | null;
  horario_real: string | null;
}): string {
  const hora = (v: string | null) => (v ? v.slice(0, 5) : "");
  switch (o.tipo) {
    case "previsao_atraso":
      return `Atraso previsto ~${o.minutos ?? 0} min`;
    case "atraso":
      return `Atraso confirmado — ${o.minutos ?? 0} min`;
    case "previsao_falta":
      return "Ausência informada (prevista)";
    case "falta":
      return "Falta confirmada";
    case "previsao_saida_antecipada":
      return `Pretende sair às ${hora(o.horario_estimado)}`;
    case "saida_antecipada":
      return `Saída antecipada às ${hora(o.horario_real) || hora(o.horario_estimado)}`;
    case "previsao_atraso_intervalo":
      return `Retorno do intervalo previsto ~${o.minutos ?? 0} min de atraso`;
    case "atraso_intervalo":
      return `Atraso no retorno do intervalo — ${o.minutos ?? 0} min`;
    case "atestado":
      return "Atestado";
    case "ausencia_justificada":
      return "Ausência justificada";
    case "esquecimento_marcacao":
      return "Esquecimento de marcação";
    default:
      return TIPO_LABEL[o.tipo];
  }
}

/** Prévia (só exibição) da diferença em minutos entre dois horários HH:MM. */
export function minutosEntre(previsto?: string | null, informado?: string | null): number | null {
  if (!previsto || !informado) return null;
  const toMin = (v: string) => {
    const [h, m] = v.slice(0, 5).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const a = toMin(previsto);
  const b = toMin(informado);
  if (a === null || b === null) return null;
  return Math.abs(b - a);
}

/** Soma minutos a um horário HH:MM (para a estimativa de atraso). */
export function somarMinutos(horario: string, minutos: number): string {
  const [h, m] = horario.slice(0, 5).split(":").map(Number);
  const total = (h * 60 + m + minutos + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export const OCORRENCIA_ERRO_TEXTO: Record<string, string> = {
  OCORRENCIA_COLABORADOR_NAO_ENCONTRADO: "Não encontramos esse colaborador.",
  OCORRENCIA_SEM_PERMISSAO: "Você não tem permissão para registrar isso.",
  OCORRENCIA_PRAZO_RETROATIVO: "Essa data já passou do prazo permitido para registro.",
  OCORRENCIA_DUPLICADA: "Já existe uma ocorrência desse tipo para esse colaborador nesse dia.",
  OCORRENCIA_NAO_ENCONTRADA: "Essa ocorrência não existe mais.",
  OCORRENCIA_CANCELADA: "Essa ocorrência foi cancelada.",
  OCORRENCIA_JA_ANALISADA: "O gestor já analisou. Envie um complemento em vez de alterar.",
  OCORRENCIA_MOTIVO_OBRIGATORIO: "Escreva o motivo.",
  OCORRENCIA_TRATATIVA_INVALIDA: "Decisão de tratativa inválida.",
};

export function textoErroOcorrencia(message?: string | null): string {
  if (!message) return "Não foi possível concluir.";
  const chave = Object.keys(OCORRENCIA_ERRO_TEXTO).find((k) => message.includes(k));
  return chave ? OCORRENCIA_ERRO_TEXTO[chave] : message;
}
