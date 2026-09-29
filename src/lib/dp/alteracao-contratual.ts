/**
 * Alteração de condição de trabalho: detecta o que mudou no contrato de um
 * colaborador já cadastrado e sinaliza o efeito jurídico da mudança.
 *
 * Regra de ouro: nenhuma condição contratual (vínculo, cargo, unidade, setor,
 * sindicato, remuneração, benefícios, jornada, ponto, adiantamento) pode ser
 * trocada em silêncio. Toda mudança precisa de:
 *  - ciência do que está mudando (de → para);
 *  - data a partir da qual a nova condição vale (pode ser retroativa, quando o
 *    gestor está corrigindo um cadastro que já estava errado);
 *  - justificativa registrada, para o histórico do vínculo.
 *
 * Vale para todos os vínculos — CLT, intermitente, estágio, temporário, PJ, MEI,
 * freelancer e sócio. O que muda por vínculo é o alerta jurídico exibido.
 */

import { contratoPolicy, regimeFormalizado, isSocio } from "@/lib/dp/contrato-policy";

/** Como a alteração entra no histórico do vínculo. */
export type EfeitoAlteracao = "correcao" | "nova_vigencia";

/** Gravidade do alerta jurídico exibido ao gestor. */
export type NivelAlerta = "alto" | "medio" | "info";

export interface AlertaAlteracao {
  nivel: NivelAlerta;
  titulo: string;
  mensagem: string;
}

export interface AlteracaoContratual {
  campo: string;
  label: string;
  de: string;
  para: string;
}

/** Foto das condições contratuais relevantes de um colaborador. */
export interface SnapshotContratual {
  regime?: string | null;
  vinculo_label?: string | null;
  cargo_id?: string | null;
  unidade_id?: string | null;
  setor_id?: string | null;
  sindicato_id?: string | null;
  forma_pagamento?: string | null;
  salario_base?: number | null;
  valor_hora?: number | null;
  valor_diaria?: number | null;
  adicional_percentual?: number | null;
  insalubridade_percentual?: number | null;
  periculosidade_percentual?: number | null;
  vale_transporte?: boolean | null;
  vale_transporte_valor_dia?: number | null;
  premio_assiduidade?: boolean | null;
  folga_fixa_semana?: number | null;
  possui_folha_ponto?: boolean | null;
  optante_adiantamento?: boolean | null;
}

/** Resolve nomes de cadastros relacionados para exibir "de → para" legível. */
export interface RotulosContratuais {
  cargo?: (id: string | null | undefined) => string | null;
  unidade?: (id: string | null | undefined) => string | null;
  setor?: (id: string | null | undefined) => string | null;
  sindicato?: (id: string | null | undefined) => string | null;
}

const FORMA_LABEL: Record<string, string> = {
  mensalista: "Mensalista",
  horista: "Horista",
  diarista: "Diarista",
  semanal: "Semanal",
  por_turno: "Por turno",
  servico_acordo: "Por serviço/acordo",
};

const DOW_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const VAZIO = "Não informado";

const moeda = (v?: number | null) =>
  v == null ? VAZIO : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const percentual = (v?: number | null) => (v == null || v === 0 ? "Sem adicional" : `${v}%`);

const simNao = (v?: boolean | null) => (v === true ? "Sim" : "Não");

const texto = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : VAZIO);

const mesmoNumero = (a?: number | null, b?: number | null) =>
  (a ?? null) === (b ?? null) || Number(a ?? 0) === Number(b ?? 0);

/**
 * Compara duas fotos do contrato e devolve só o que mudou de fato.
 * Campos de cadastro relacionado (cargo, unidade, setor, sindicato) são exibidos
 * pelo nome, não pelo identificador.
 */
export function detectarAlteracoesContratuais(
  antes: SnapshotContratual,
  depois: SnapshotContratual,
  rotulos: RotulosContratuais = {},
): AlteracaoContratual[] {
  const out: AlteracaoContratual[] = [];

  const add = (campo: string, label: string, de: string, para: string) => {
    if (de !== para) out.push({ campo, label, de, para });
  };

  const nome = (
    fn: ((id: string | null | undefined) => string | null) | undefined,
    id: string | null | undefined,
  ) => texto(fn?.(id) ?? (id ? null : null));

  // Vínculo / regime
  const policyAntes = contratoPolicy(antes.regime, antes.vinculo_label);
  const policyDepois = contratoPolicy(depois.regime, depois.vinculo_label);
  add("vinculo", "Tipo de vínculo", policyAntes.label, policyDepois.label);

  // Cadastros relacionados
  if ((antes.cargo_id ?? null) !== (depois.cargo_id ?? null)) {
    add("cargo", "Cargo", nome(rotulos.cargo, antes.cargo_id), nome(rotulos.cargo, depois.cargo_id));
  }
  if ((antes.unidade_id ?? null) !== (depois.unidade_id ?? null)) {
    add("unidade", "Unidade", nome(rotulos.unidade, antes.unidade_id), nome(rotulos.unidade, depois.unidade_id));
  }
  if ((antes.setor_id ?? null) !== (depois.setor_id ?? null)) {
    add("setor", "Setor", nome(rotulos.setor, antes.setor_id), nome(rotulos.setor, depois.setor_id));
  }
  if ((antes.sindicato_id ?? null) !== (depois.sindicato_id ?? null)) {
    add(
      "sindicato",
      "Sindicato",
      nome(rotulos.sindicato, antes.sindicato_id),
      nome(rotulos.sindicato, depois.sindicato_id),
    );
  }

  // Remuneração
  add(
    "forma_pagamento",
    "Forma de pagamento",
    FORMA_LABEL[String(antes.forma_pagamento ?? "")] ?? VAZIO,
    FORMA_LABEL[String(depois.forma_pagamento ?? "")] ?? VAZIO,
  );
  if (!mesmoNumero(antes.salario_base, depois.salario_base)) {
    add("salario_base", "Salário base", moeda(antes.salario_base), moeda(depois.salario_base));
  }
  if (!mesmoNumero(antes.valor_hora, depois.valor_hora)) {
    add("valor_hora", "Valor da hora", moeda(antes.valor_hora), moeda(depois.valor_hora));
  }
  if (!mesmoNumero(antes.valor_diaria, depois.valor_diaria)) {
    add("valor_diaria", "Valor da diária", moeda(antes.valor_diaria), moeda(depois.valor_diaria));
  }
  if (!mesmoNumero(antes.adicional_percentual, depois.adicional_percentual)) {
    add(
      "adicional_percentual",
      "Adicional noturno",
      percentual(antes.adicional_percentual),
      percentual(depois.adicional_percentual),
    );
  }
  if (!mesmoNumero(antes.insalubridade_percentual, depois.insalubridade_percentual)) {
    add(
      "insalubridade_percentual",
      "Insalubridade",
      percentual(antes.insalubridade_percentual),
      percentual(depois.insalubridade_percentual),
    );
  }
  if (!mesmoNumero(antes.periculosidade_percentual, depois.periculosidade_percentual)) {
    add(
      "periculosidade_percentual",
      "Periculosidade",
      percentual(antes.periculosidade_percentual),
      percentual(depois.periculosidade_percentual),
    );
  }

  // Benefícios de valor fixo
  add("vale_transporte", "Vale-transporte", simNao(antes.vale_transporte), simNao(depois.vale_transporte));
  if (
    depois.vale_transporte === true &&
    antes.vale_transporte === true &&
    !mesmoNumero(antes.vale_transporte_valor_dia, depois.vale_transporte_valor_dia)
  ) {
    add(
      "vale_transporte_valor_dia",
      "Vale-transporte por dia",
      moeda(antes.vale_transporte_valor_dia),
      moeda(depois.vale_transporte_valor_dia),
    );
  }
  add(
    "premio_assiduidade",
    "Prêmio de assiduidade",
    simNao(antes.premio_assiduidade),
    simNao(depois.premio_assiduidade),
  );

  // Jornada e controles
  if ((antes.folga_fixa_semana ?? null) !== (depois.folga_fixa_semana ?? null)) {
    add(
      "folga_fixa_semana",
      "Folga semanal fixa",
      antes.folga_fixa_semana == null ? "Folga variável" : DOW_LABEL[antes.folga_fixa_semana] ?? VAZIO,
      depois.folga_fixa_semana == null ? "Folga variável" : DOW_LABEL[depois.folga_fixa_semana] ?? VAZIO,
    );
  }
  add(
    "possui_folha_ponto",
    "Folha de ponto",
    simNao(antes.possui_folha_ponto),
    simNao(depois.possui_folha_ponto),
  );
  add(
    "optante_adiantamento",
    "Adiantamento salarial",
    simNao(antes.optante_adiantamento),
    simNao(depois.optante_adiantamento),
  );

  return out;
}

/**
 * Alertas jurídicos da mudança. Todos os vínculos entram: o que muda é o risco
 * de cada transição. Nenhum alerta bloqueia — o gestor decide com ciência.
 */
export function alertasAlteracaoContratual(
  antes: SnapshotContratual,
  depois: SnapshotContratual,
): AlertaAlteracao[] {
  const out: AlertaAlteracao[] = [];
  const socioAntes = isSocio(antes.vinculo_label);
  const socioDepois = isSocio(depois.vinculo_label);
  const formalAntes = !socioAntes && regimeFormalizado(antes.regime);
  const formalDepois = !socioDepois && regimeFormalizado(depois.regime);
  const trocouVinculo = (antes.regime ?? null) !== (depois.regime ?? null) || socioAntes !== socioDepois;

  if (trocouVinculo && formalAntes && !formalDepois) {
    out.push({
      nivel: "alto",
      titulo: "Saída de vínculo formal sem rescisão",
      mensagem:
        "Transformar um contrato com registro em carteira em vínculo sem registro não extingue o contrato anterior. O caminho correto é registrar o desligamento na data do término, apurar as verbas rescisórias e cadastrar a nova relação. Mantendo a alteração direta, o período trabalhado sob registro continua gerando direitos e a mudança pode ser considerada nula (art. 9º da CLT).",
    });
  }
  if (trocouVinculo && !formalAntes && formalDepois) {
    out.push({
      nivel: "medio",
      titulo: "Passagem para vínculo formal",
      mensagem:
        "A partir da data informada o colaborador passa a ter registro em carteira. Confira o piso da categoria, o sindicato da unidade, a jornada contratual e o descanso semanal antes de concluir.",
    });
  }
  if (trocouVinculo && socioDepois && !socioAntes) {
    out.push({
      nivel: "medio",
      titulo: "Passagem para sócio",
      mensagem:
        "Sócio não é empregado: deixa de ter jornada contratual, férias legais e folha de pagamento. A entrada no quadro societário depende de alteração do contrato social.",
    });
  }

  // Irredutibilidade salarial em vínculo formal.
  const salarioAntes = Number(antes.salario_base ?? 0);
  const salarioDepois = Number(depois.salario_base ?? 0);
  if (formalDepois && salarioAntes > 0 && salarioDepois > 0 && salarioDepois < salarioAntes) {
    out.push({
      nivel: "alto",
      titulo: "Redução de salário",
      mensagem:
        "O salário é irredutível (art. 7º, VI, da Constituição). A redução só é válida por acordo ou convenção coletiva. Se está corrigindo um valor digitado errado, escolha a opção de correção de cadastro e descreva isso na justificativa.",
    });
  }

  // Supressão de benefício habitual.
  const perdeuVt = antes.vale_transporte === true && depois.vale_transporte !== true;
  const perdeuPremio = antes.premio_assiduidade === true && depois.premio_assiduidade !== true;
  if (formalDepois && (perdeuVt || perdeuPremio)) {
    out.push({
      nivel: "medio",
      titulo: "Retirada de benefício",
      mensagem:
        "Benefício pago com habitualidade tende a integrar as condições do contrato e não pode ser simplesmente suprimido. Registre o acordo ou a previsão coletiva que autoriza a retirada.",
    });
  }

  // Controle de ponto em vínculo sem registro.
  if (!formalDepois && !socioDepois && depois.possui_folha_ponto === true) {
    out.push({
      nivel: "alto",
      titulo: "Controle de ponto em vínculo sem registro",
      mensagem:
        "Exigir marcação de entrada e saída de quem não tem registro em carteira é prova direta de subordinação e habitualidade (arts. 2º e 3º da CLT) e é um dos principais fundamentos para o reconhecimento de vínculo empregatício. Mantenha o ponto desligado para este vínculo.",
    });
  }

  // Adiantamento em vínculo sem registro.
  if (!formalDepois && !socioDepois && depois.optante_adiantamento === true) {
    out.push({
      nivel: "medio",
      titulo: "Adiantamento em vínculo sem registro",
      mensagem:
        "Valor mensal fixo com adiantamento em data certa reforça os indícios de habitualidade e dependência econômica. É possível manter, desde que a empresa tenha ciência do risco.",
    });
  }

  const policyDepois = contratoPolicy(depois.regime, depois.vinculo_label);
  if (trocouVinculo && !formalDepois && !socioDepois && policyDepois.cienciaLegalMensagem) {
    out.push({
      nivel: "info",
      titulo: `Vínculo ${policyDepois.label}`,
      mensagem: policyDepois.cienciaLegalMensagem,
    });
  }

  return out;
}

/** Há alerta de risco alto na mudança? (usado para exigir justificativa) */
export function temRiscoAlto(alertas: AlertaAlteracao[]): boolean {
  return alertas.some((a) => a.nivel === "alto");
}
