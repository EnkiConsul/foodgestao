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

function inteiro(valor: number | null | undefined): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/** Prêmio de assiduidade cadastrado para a pessoa (sócio nunca tem). */
export function premioAssiduidadeAplicavel(
  regra: (RegraAssiduidade & { vinculo_label?: string | null }) | null | undefined,
): boolean {
  if (!regra || !regra.premio_assiduidade) return false;
  if (Number(regra.premio_assiduidade_valor ?? 0) <= 0) return false;
  const v = String(regra.vinculo_label ?? "").toLowerCase();
  return v !== "socio" && v !== "sócio";
}

/** Avalia se a ocorrência vai para decisão do gestor sobre o prêmio (espelho do servidor). */
export function avaliarRiscoAssiduidade(
  regra: RegraAssiduidade | null | undefined,
  tipo: OcorrenciaTipo,
  minutos?: number | null,
): RiscoAssiduidade {
  if (!premioAssiduidadeAplicavel(regra)) return SEM_RISCO;
  if (TIPOS_FALTA.includes(tipo)) {
    return { risco: true, motivo: "Falta registrada — por padrão perde o prêmio de assiduidade; o gestor decide." };
  }
  if (tipo === "atestado") {
    return { risco: true, motivo: "Atestado apresentado — por padrão perde o prêmio de assiduidade; o gestor pode abonar." };
  }
  if (tipo === "saida_antecipada" || tipo === "previsao_saida_antecipada") {
    return { risco: true, motivo: "Saída antecipada — por padrão perde o prêmio de assiduidade; o gestor decide." };
  }
  void minutos;
  // Atrasos de entrada/intervalo dependem da apuração do mês (apurarAtrasosMes).
  return SEM_RISCO;
}

export const TIPOS_ATRASO_TOLERANCIA: OcorrenciaTipo[] = [
  "atraso",
  "previsao_atraso",
  "atraso_intervalo",
  "previsao_atraso_intervalo",
];

export interface AtrasoDia {
  data: string;
  totalMin: number;
  acimaTolerancia: boolean;
  ordem: number; // posição entre os dias acima da tolerância (0 se dentro)
  risco: boolean;
}

/**
 * Espelho de private.dp_assiduidade_recalcular_atrasos: soma entrada + retorno do
 * intervalo por dia; só conta o dia que passou da tolerância; vai ao gestor
 * a partir do dia que estoura o máximo do mês.
 */
export function apurarAtrasosMes(
  regra: RegraAssiduidade | null | undefined,
  ocorrencias: { data_operacional: string; tipo: OcorrenciaTipo; minutos?: number | null; estado?: string | null }[],
): AtrasoDia[] {
  const tol = Math.max(0, inteiroOu(regra?.assiduidade_tolerancia_min, 10));
  const max = Math.max(0, inteiroOu(regra?.assiduidade_max_atrasos, 2));
  const aplica = premioAssiduidadeAplicavel(regra);
  const porDia = new Map<string, { total: number; semMin: boolean }>();
  for (const o of ocorrencias) {
    if (o.estado === "cancelada" || !TIPOS_ATRASO_TOLERANCIA.includes(o.tipo)) continue;
    const d = porDia.get(o.data_operacional) ?? { total: 0, semMin: false };
    if (o.minutos === null || o.minutos === undefined) d.semMin = true;
    else d.total += inteiro(o.minutos);
    porDia.set(o.data_operacional, d);
  }
  let ordem = 0;
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, d]) => {
      const acima = aplica && (d.semMin || d.total > tol);
      if (acima) ordem += 1;
      return { data, totalMin: d.total, acimaTolerancia: acima, ordem: acima ? ordem : 0, risco: acima && ordem > max };
    });
}

function inteiroOu(valor: number | null | undefined, padrao: number): number {
  return valor === null || valor === undefined ? padrao : inteiro(valor);
}

/** Eventos que podem chegar ao gestor; cada um tem um padrão do sistema. */
export type EventoAssiduidade =
  | "falta"
  | "atestado"
  | "licenca"
  | "liberacao"
  | "atraso"
  | "socio"
  | "folga"
  | "ferias"
  | "troca_folga"
  | "indisponibilidade";

/**
 * Padrão sugerido ao gestor: true = perde o prêmio, false = mantém,
 * null = o evento não pergunta sobre assiduidade.
 */
export function padraoAssiduidade(evento: EventoAssiduidade): boolean | null {
  switch (evento) {
    case "falta":
    case "atestado":
    case "licenca":
    case "atraso":
      return true;
    case "liberacao":
      return false;
    default:
      return null;
  }
}

/** Mudar o padrão do sistema exige justificativa do gestor. */
export function exigeJustificativaAssiduidade(evento: EventoAssiduidade, perde: boolean): boolean {
  const padrao = padraoAssiduidade(evento);
  return padrao !== null && padrao !== perde;
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
