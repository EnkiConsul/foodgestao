// Domínio: DP → Risco de perder o prêmio de assiduidade.
// Espelho puro da regra que o servidor aplica em private.dp_assiduidade_risco,
// usado apenas para avisar na tela antes de enviar. A decisão vale pelo servidor.

import type { OcorrenciaImpacto, OcorrenciaTipo } from "@/lib/dp/ocorrencias";

export interface RegraAssiduidade {
  premio_assiduidade?: boolean | null;
  premio_assiduidade_valor?: number | null;
  assiduidade_criterio?: string | null;
  assiduidade_tolerancia_min?: number | null;
  assiduidade_max_atrasos?: number | null;
  assiduidade_considera_atestado?: boolean | null;
  assiduidade_max_atestados?: number | null;
}

export interface RiscoAssiduidade {
  risco: boolean;
  motivo: string | null;
}

const SEM_RISCO: RiscoAssiduidade = { risco: false, motivo: null };

const TIPOS_FALTA: OcorrenciaTipo[] = ["falta", "previsao_falta"];

const TIPOS_ATRASO: OcorrenciaTipo[] = [
  "atraso",
  "previsao_atraso",
  "atraso_intervalo",
  "previsao_atraso_intervalo",
  "saida_antecipada",
  "previsao_saida_antecipada",
];

function inteiro(valor: number | null | undefined): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/** Avalia se a ocorrência pode custar o prêmio de assiduidade do colaborador. */
export function avaliarRiscoAssiduidade(
  regra: RegraAssiduidade | null | undefined,
  tipo: OcorrenciaTipo,
  minutos?: number | null,
): RiscoAssiduidade {
  if (!regra || !regra.premio_assiduidade) return SEM_RISCO;
  if (Number(regra.premio_assiduidade_valor ?? 0) <= 0) return SEM_RISCO;

  if (TIPOS_FALTA.includes(tipo)) {
    return { risco: true, motivo: "Falta registrada — pode custar o prêmio de assiduidade." };
  }

  if (tipo === "atestado") {
    if (regra.assiduidade_considera_atestado === false) return SEM_RISCO;
    const maxAtestados = inteiro(regra.assiduidade_max_atestados);
    return {
      risco: true,
      motivo:
        maxAtestados > 0
          ? `Atestado apresentado — a regra tolera ${maxAtestados} atestado(s) no mês antes de perder o prêmio de assiduidade.`
          : "Atestado apresentado — a regra não tolera atestado, pode custar o prêmio de assiduidade.",
    };
  }

  if (TIPOS_ATRASO.includes(tipo)) {
    const criterio = regra.assiduidade_criterio ?? "sem_faltas_sem_atrasos";
    if (criterio === "sem_faltas") return SEM_RISCO;
    const tolerancia = inteiro(regra.assiduidade_tolerancia_min);
    if (minutos === null || minutos === undefined) {
      return {
        risco: true,
        motivo: "Horário ainda não informado — se passar da tolerância, pode custar o prêmio de assiduidade.",
      };
    }
    const min = inteiro(minutos);
    if (min > tolerancia) {
      const maxAtrasos = inteiro(regra.assiduidade_max_atrasos);
      const complemento = maxAtrasos > 0 ? ` (a regra tolera ${maxAtrasos} no mês)` : "";
      return {
        risco: true,
        motivo: `Atraso de ${min} minuto(s) acima da tolerância de ${tolerancia} minuto(s)${complemento} — pode custar o prêmio de assiduidade.`,
      };
    }
    return SEM_RISCO;
  }

  return SEM_RISCO;
}

export interface OcorrenciaAssiduidade {
  assiduidade_risco?: boolean | null;
  assiduidade_risco_motivo?: string | null;
  assiduidade_observacao?: string | null;
  assiduidade_decidido_em?: string | null;
  impacta_assiduidade?: OcorrenciaImpacto | null;
}

export type EstadoAssiduidade = "sem_risco" | "aguardando" | "perde" | "mantem";

/** Situação da ocorrência quanto ao prêmio, para gestor e colaborador. */
export function estadoAssiduidade(o: OcorrenciaAssiduidade): EstadoAssiduidade {
  if (!o.assiduidade_risco) return "sem_risco";
  if (!o.assiduidade_decidido_em) return "aguardando";
  return o.impacta_assiduidade === "sim" ? "perde" : "mantem";
}

export const ESTADO_ASSIDUIDADE_LABEL: Record<EstadoAssiduidade, string> = {
  sem_risco: "Não afeta o prêmio",
  aguardando: "Em análise pelo gestor",
  perde: "Perdeu o prêmio deste mês",
  mantem: "Prêmio mantido",
};

const ASSIDUIDADE_ERRO_TEXTO: Record<string, string> = {
  ASSIDUIDADE_MOTIVO_OBRIGATORIO: "Para manter o prêmio, informe o motivo do abono.",
  ASSIDUIDADE_SEM_RISCO: "Esta ocorrência não afeta o prêmio de assiduidade.",
  ASSIDUIDADE_JA_DECIDIDA: "Esta ocorrência já teve o prêmio decidido.",
  ASSIDUIDADE_DADOS_OBRIGATORIOS: "Escolha se a ocorrência faz perder o prêmio.",
  OCORRENCIA_CANCELADA: "Esta ocorrência está cancelada.",
  OCORRENCIA_NAO_ENCONTRADA: "Não encontramos esta ocorrência.",
  REGRAS_SEM_PERMISSAO: "Você não tem permissão para decidir nesta empresa.",
};

export function textoErroAssiduidade(message?: string | null): string {
  if (!message) return "Não foi possível concluir.";
  const chave = Object.keys(ASSIDUIDADE_ERRO_TEXTO).find((k) => message.includes(k));
  return chave ? ASSIDUIDADE_ERRO_TEXTO[chave] : message;
}

/** Conta, para o prêmio do mês, somente as ocorrências que o gestor decidiu descontar. */
export function ocorrenciasQuePerdemPremio<T extends OcorrenciaAssiduidade>(lista: T[]): T[] {
  return lista.filter((o) => estadoAssiduidade(o) === "perde");
}
