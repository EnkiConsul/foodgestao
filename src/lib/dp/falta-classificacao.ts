import type { OcorrenciaTipo } from "./ocorrencias";
import type { EventoAssiduidade } from "./assiduidade-risco";

export type ClassificacaoFalta = "justificada" | "injustificada";
export function prepararFalta(classificacao: ClassificacaoFalta, comunicacao: "sim" | "nao" | "nao_informado", motivo: string, contexto?: string) {
  const justificada = classificacao === "justificada";
  return {
    tipo: (justificada ? "ausencia_justificada" : "falta") as OcorrenciaTipo,
    evento: (justificada ? "falta_justificada" : "falta") as EventoAssiduidade,
    justificativa: [contexto, justificada ? "Falta justificada" : "Falta injustificada", `Comunicação prévia: ${comunicacao === "sim" ? "sim" : comunicacao === "nao" ? "não" : "não informada"}`, motivo.trim()].filter(Boolean).join(" — "),
  };
}