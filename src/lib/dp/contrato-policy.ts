import type { Database } from "@/integrations/supabase/types";

export type RegimeTrabalho = Database["public"]["Enums"]["dp_regime_trabalho"];

/**
 * Política de contrato: resolve como cada regime interpreta a Jornada.
 *
 * A Jornada é um único conceito para todos os colaboradores — "o padrão esperado
 * de trabalho". O que muda é a leitura desse padrão:
 *  - CLT/estágio/temporário → horário previsto (obrigação, valida carga e folga);
 *  - Intermitente → disponibilidade habitual (sugestão para convocações);
 *  - PJ/MEI → referência operacional, sem validação celetista.
 *
 * Regra de ouro: nenhuma tela deve testar `regime === 'intermitente'` diretamente;
 * toda decisão de comportamento passa por aqui.
 */
export interface ContratoPolicy {
  regime: RegimeTrabalho;
  /** Rótulo do vínculo para exibição. */
  label: string;
  /** A jornada representa disponibilidade habitual (sugestão), não obrigação. */
  jornadaComoDisponibilidade: boolean;
  /** Valida o limite legal de carga semanal (44h) sobre a jornada/escala. */
  validaCargaSemanal: boolean;
  /** Exige definição de folga semanal fixa/variável no vínculo. */
  exigeFolgaSemanal: boolean;
  /** Entra nos relatórios de conformidade de DSR. */
  participaConformidadeDsr: boolean;
  /** Entra na geração automática de escala de folgas. */
  participaEscalaAutomatica: boolean;
  /** As horas devidas nascem de convocações aceitas, não da jornada. */
  horasPorConvocacao: boolean;
  /** Rótulo da jornada na UI conforme o contrato. */
  jornadaLabel: string;
  /** Texto explicativo exibido quando a jornada é apenas disponibilidade. */
  jornadaHint: string | null;
  /** Admite adiantamento salarial quinzenal (salário mensal fixo em folha). */
  permiteAdiantamento: boolean;
  /** Motivo exibido quando o adiantamento não se aplica ao contrato. */
  adiantamentoHint: string | null;
}

const CLT_LIKE: ContratoPolicy = {
  regime: "clt",
  label: "CLT",
  jornadaComoDisponibilidade: false,
  validaCargaSemanal: true,
  exigeFolgaSemanal: true,
  participaConformidadeDsr: true,
  participaEscalaAutomatica: true,
  horasPorConvocacao: false,
  jornadaLabel: "Jornada",
  jornadaHint: null,
};

const INTERMITENTE: ContratoPolicy = {
  regime: "intermitente",
  label: "Intermitente",
  jornadaComoDisponibilidade: true,
  validaCargaSemanal: false,
  exigeFolgaSemanal: false,
  participaConformidadeDsr: false,
  participaEscalaAutomatica: false,
  horasPorConvocacao: true,
  jornadaLabel: "Jornada (disponibilidade habitual)",
  jornadaHint:
    "Esta jornada representa a disponibilidade habitual do colaborador. A carga efetiva será calculada pelas convocações realizadas.",
};

const PJ_LIKE: ContratoPolicy = {
  regime: "pj",
  label: "PJ",
  jornadaComoDisponibilidade: false,
  validaCargaSemanal: false,
  exigeFolgaSemanal: false,
  participaConformidadeDsr: false,
  participaEscalaAutomatica: true,
  horasPorConvocacao: false,
  jornadaLabel: "Jornada",
  jornadaHint: null,
};

const POLICIES: Record<RegimeTrabalho, ContratoPolicy> = {
  clt: CLT_LIKE,
  estagio: { ...CLT_LIKE, regime: "estagio", label: "Estagiário" },
  temporario: { ...CLT_LIKE, regime: "temporario", label: "Temporário" },
  intermitente: INTERMITENTE,
  pj: PJ_LIKE,
  mei: { ...PJ_LIKE, regime: "mei", label: "MEI" },
};

/** Política do regime informado. Regime desconhecido/ausente cai no padrão CLT. */
export function contratoPolicy(regime?: string | null): ContratoPolicy {
  if (!regime) return CLT_LIKE;
  return POLICIES[regime as RegimeTrabalho] ?? CLT_LIKE;
}

/** Atalho de leitura — prefira `contratoPolicy(...)` para decidir comportamento. */
export function isIntermitente(regime?: string | null): boolean {
  return contratoPolicy(regime).jornadaComoDisponibilidade;
}
