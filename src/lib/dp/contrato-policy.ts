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
  /**
   * Como o campo de folga semanal se comporta no cadastro:
   *  - "obrigatoria" → CLT e assemelhados (DSR exigido);
   *  - "opcional" → PJ/MEI/freelancer (referência operacional, sem DSR);
   *  - "nao_se_aplica" → intermitente (trabalho por convocação).
   */
  folgaSemanal: "obrigatoria" | "opcional" | "nao_se_aplica";
  /** Rótulo do campo de folga conforme o contrato. */
  folgaLabel: string;
  /** Texto de apoio do campo de folga (null quando dispensável). */
  folgaHint: string | null;
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
  /** Formas de pagamento admitidas pelo contrato (ordem de exibição). */
  formasPagamento: FormaPagamentoRegime[];
  /** O contrato gera folha de pagamento CLT (encargos, holerite). */
  entraEmFolha: boolean;
  /** Exige ciência formal do risco jurídico no cadastro (sem registro em carteira). */
  exigeCienciaLegal: boolean;
  /** Mensagem da ciência jurídica exibida no cadastro. */
  cienciaLegalMensagem: string | null;
}

/** Formas de pagamento do banco, repetidas aqui para evitar ciclo de import. */
export type FormaPagamentoRegime = "mensalista" | "horista" | "diarista";

const CLT_LIKE: ContratoPolicy = {
  regime: "clt",
  label: "CLT",
  jornadaComoDisponibilidade: false,
  validaCargaSemanal: true,
  exigeFolgaSemanal: true,
  folgaSemanal: "obrigatoria",
  folgaLabel: "Folga semanal",
  folgaHint: "O descanso semanal remunerado é obrigatório: escolha um dia fixo ou marque folga variável conforme a escala.",
  participaConformidadeDsr: true,
  participaEscalaAutomatica: true,
  horasPorConvocacao: false,
  jornadaLabel: "Jornada",
  jornadaHint: null,
  permiteAdiantamento: true,
  adiantamentoHint: null,
  formasPagamento: ["mensalista", "horista", "diarista"],
  entraEmFolha: true,
  exigeCienciaLegal: false,
  cienciaLegalMensagem: null,
};

const INTERMITENTE: ContratoPolicy = {
  regime: "intermitente",
  label: "Intermitente",
  jornadaComoDisponibilidade: true,
  validaCargaSemanal: false,
  exigeFolgaSemanal: false,
  folgaSemanal: "nao_se_aplica",
  folgaLabel: "Folga semanal",
  folgaHint: null,
  participaConformidadeDsr: false,
  participaEscalaAutomatica: false,
  horasPorConvocacao: true,
  jornadaLabel: "Jornada (disponibilidade habitual)",
  jornadaHint:
    "Esta jornada representa a disponibilidade habitual do colaborador. A carga efetiva será calculada pelas convocações realizadas.",
  permiteAdiantamento: false,
  adiantamentoHint:
    "O contrato intermitente é pago por convocação, sem salário mensal fixo — não há adiantamento quinzenal.",
  // Intermitente é pago pelas horas/dias efetivamente convocados (art. 452-A CLT):
  // não existe salário mensal fixo.
  formasPagamento: ["horista", "diarista"],
  entraEmFolha: true,
  exigeCienciaLegal: false,
  cienciaLegalMensagem: null,
};

const FREELANCER: ContratoPolicy = {
  regime: "freelancer",
  label: "Freelancer (sem registro)",
  jornadaComoDisponibilidade: true,
  validaCargaSemanal: false,
  exigeFolgaSemanal: false,
  folgaSemanal: "opcional",
  folgaLabel: "Dias sem previsão de trabalho",
  folgaHint: "Freelancer não tem jornada contratual nem DSR. Marcar dias aqui serve apenas como referência para escala e operação.",
  participaConformidadeDsr: false,
  participaEscalaAutomatica: false,
  horasPorConvocacao: true,
  jornadaLabel: "Jornada (disponibilidade habitual)",
  jornadaHint:
    "Freelancer não tem jornada contratual. O que for cadastrado aqui serve apenas como disponibilidade para escala e ponto.",
  permiteAdiantamento: false,
  adiantamentoHint:
    "Freelancer é pago por acerto avulso, fora da folha CLT — não há adiantamento salarial.",
  formasPagamento: ["diarista", "horista"],
  entraEmFolha: false,
  exigeCienciaLegal: true,
  cienciaLegalMensagem:
    "Freelancer sem registro em carteira não possui vínculo formalizado. Havendo habitualidade, subordinação, pessoalidade e onerosidade, a Justiça do Trabalho pode reconhecer vínculo empregatício (arts. 2º e 3º da CLT), com recolhimento retroativo de verbas e encargos. O pagamento fica fora da folha CLT, como acerto avulso.",
};

const PJ_LIKE: ContratoPolicy = {
  regime: "pj",
  label: "PJ",
  jornadaComoDisponibilidade: false,
  validaCargaSemanal: false,
  exigeFolgaSemanal: false,
  folgaSemanal: "opcional",
  folgaLabel: "Dias sem previsão de trabalho",
  folgaHint: "Contratos PJ/MEI não têm descanso semanal remunerado. Este campo é apenas referência operacional para a escala.",
  participaConformidadeDsr: false,
  participaEscalaAutomatica: true,
  horasPorConvocacao: false,
  jornadaLabel: "Jornada",
  jornadaHint: null,
  permiteAdiantamento: false,
  adiantamentoHint: "Contratos PJ/MEI não entram em folha, portanto não têm adiantamento salarial.",
  formasPagamento: ["mensalista", "diarista", "horista"],
  entraEmFolha: false,
  exigeCienciaLegal: false,
  cienciaLegalMensagem: null,
};

const POLICIES: Record<RegimeTrabalho, ContratoPolicy> = {
  clt: CLT_LIKE,
  estagio: { ...CLT_LIKE, regime: "estagio", label: "Estagiário" },
  temporario: { ...CLT_LIKE, regime: "temporario", label: "Temporário" },
  intermitente: INTERMITENTE,
  pj: PJ_LIKE,
  mei: { ...PJ_LIKE, regime: "mei", label: "MEI" },
  freelancer: FREELANCER,
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

/** Formas de pagamento admitidas pelo regime (nunca vazio). */
export function formasPagamentoDoRegime(regime?: string | null): FormaPagamentoRegime[] {
  const formas = contratoPolicy(regime).formasPagamento;
  return formas.length ? formas : ["mensalista"];
}

/** Garante uma forma de pagamento válida para o regime (usa a 1ª admitida). */
export function formaPagamentoValida(
  regime: string | null | undefined,
  forma?: string | null,
): FormaPagamentoRegime {
  const permitidas = formasPagamentoDoRegime(regime);
  return permitidas.includes(forma as FormaPagamentoRegime)
    ? (forma as FormaPagamentoRegime)
    : permitidas[0];
}
