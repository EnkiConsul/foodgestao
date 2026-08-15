// ------------------------------------------------------------------
// Domínio: DP → Benefícios (vale-alimentação/refeição, saúde, outros)
//
// Fonte única de:
//  - cálculo do valor concedido no mês e do desconto do colaborador;
//  - alerta jurídico quando a empresa não desconta nada;
//  - alerta de isonomia ao retirar um benefício de um colaborador;
//  - texto do termo de dispensa/não adesão.
//
// Funções puras — nenhuma tela recalcula isso inline.
// ------------------------------------------------------------------

export type Periodicidade = "diario" | "mensal";
export type DescontoTipo = "nenhum" | "percentual" | "valor";

export const PERIODICIDADE_LABEL: Record<Periodicidade, string> = {
  diario: "Valor por dia",
  mensal: "Valor por mês",
};

export const DESCONTO_TIPO_LABEL: Record<DescontoTipo, string> = {
  nenhum: "Sem desconto do colaborador",
  percentual: "Percentual do benefício",
  valor: "Valor fixo em reais",
};

/** Dias considerados no mês quando a empresa não informa. */
export const DIAS_BASE_PADRAO = 22;

/** Faixa de desconto usual e aceita pela praxe/negociação coletiva (1% a 20%). */
export const DESCONTO_RECOMENDADO_MIN = 1;
export const DESCONTO_RECOMENDADO_MAX = 20;

export interface BeneficioValorInput {
  valor?: number | null;
  periodicidade?: Periodicidade | string | null;
  dias_base?: number | null;
  desconto_tipo?: DescontoTipo | string | null;
  /** Percentual (quando `desconto_tipo = percentual`) ou valor fixo. */
  desconto_valor?: number | null;
}

export interface BeneficioCalculo {
  /** Valor concedido no mês. */
  bruto: number;
  /** Desconto do colaborador no mês. */
  desconto: number;
  /** Custo líquido da empresa. */
  liquido: number;
  /** Percentual efetivo descontado do benefício. */
  percentualEfetivo: number;
}

/** Valor concedido e desconto no mês, conforme periodicidade e regra de desconto. */
export function calcularBeneficioMes(input: BeneficioValorInput): BeneficioCalculo {
  const valor = num(input.valor);
  const periodicidade = (input.periodicidade ?? "mensal") as Periodicidade;
  const dias = Math.max(0, num(input.dias_base) || DIAS_BASE_PADRAO);
  const bruto = round2(periodicidade === "diario" ? valor * dias : valor);

  const tipo = (input.desconto_tipo ?? "nenhum") as DescontoTipo;
  let desconto = 0;
  if (tipo === "percentual") {
    const p = Math.min(100, Math.max(0, num(input.desconto_valor)));
    desconto = round2(bruto * (p / 100));
  } else if (tipo === "valor") {
    desconto = Math.min(bruto, round2(Math.max(0, num(input.desconto_valor))));
  }

  return {
    bruto,
    desconto,
    liquido: round2(bruto - desconto),
    percentualEfetivo: bruto > 0 ? round2((desconto / bruto) * 100) : 0,
  };
}

export interface AlertaBeneficio {
  codigo: string;
  severidade: "aviso" | "info";
  titulo: string;
  mensagem: string;
  recomendacao?: string;
}

/**
 * Risco de o benefício de alimentação ser considerado salário.
 *
 * Regra aplicada: a alimentação fornecida no âmbito do PAT ou prevista em
 * norma coletiva tem natureza indenizatória (Lei 6.321/76; art. 457, §2º da
 * CLT, com a redação da Lei 13.467/17; art. 458, §2º, IV da CLT). O risco
 * aumenta quando o pagamento é habitual, em dinheiro e sem qualquer
 * coparticipação do colaborador — situação em que a fiscalização e a Justiça
 * do Trabalho podem tratar o valor como salário, com reflexo em INSS, FGTS,
 * 13º, férias e horas extras.
 */
export function alertasBeneficioAlimentacao(input: BeneficioValorInput): AlertaBeneficio[] {
  const calc = calcularBeneficioMes(input);
  if (calc.bruto <= 0) return [];

  const tipo = (input.desconto_tipo ?? "nenhum") as DescontoTipo;
  const out: AlertaBeneficio[] = [];

  if (tipo === "nenhum" || calc.desconto <= 0) {
    out.push({
      codigo: "va_sem_desconto",
      severidade: "aviso",
      titulo: "Benefício sem coparticipação do colaborador",
      mensagem:
        "Sem nenhum desconto e com pagamento habitual, existe risco de o valor ser " +
        "considerado salário (reflexo em INSS, FGTS, 13º, férias e horas extras).",
      recomendacao:
        `Adote uma coparticipação simbólica (praxe de ${DESCONTO_RECOMENDADO_MIN}% a ` +
        `${DESCONTO_RECOMENDADO_MAX}% do benefício), forneça via PAT/cartão-alimentação ` +
        "ou garanta previsão em CCT/ACT.",
    });
  } else if (calc.percentualEfetivo > DESCONTO_RECOMENDADO_MAX) {
    out.push({
      codigo: "va_desconto_alto",
      severidade: "aviso",
      titulo: "Desconto acima da praxe",
      mensagem:
        `O desconto representa ${calc.percentualEfetivo.toFixed(1)}% do benefício, acima da ` +
        `faixa usual de até ${DESCONTO_RECOMENDADO_MAX}%.`,
      recomendacao: "Confirme se a norma coletiva autoriza este percentual.",
    });
  }

  if ((input.desconto_tipo ?? "nenhum") !== "nenhum" && calc.desconto > 0) {
    out.push({
      codigo: "va_indenizatorio",
      severidade: "info",
      titulo: "Natureza indenizatória",
      mensagem:
        "Com coparticipação e fornecimento via PAT ou cartão-alimentação, o benefício não " +
        "integra o salário para fins de encargos.",
    });
  }

  return out;
}

// ------------------------------------------------------------------
// Isonomia ao retirar um benefício
// ------------------------------------------------------------------

export interface ColegaBeneficio {
  colaborador_id: string;
  nome: string;
  cargo_id?: string | null;
  unidade_id?: string | null;
  /** O colega tem o benefício ativo? */
  ativo: boolean;
}

export interface IsonomiaAlerta {
  /** Colegas do mesmo cargo/unidade que mantêm o benefício. */
  colegas: string[];
  titulo: string;
  mensagem: string;
  recomendacao: string;
}

/**
 * Alerta de isonomia ao desativar um benefício.
 *
 * Base legal: art. 461 da CLT (mesmo trabalho, mesmo salário e vantagens),
 * art. 7º, XXX da Constituição e art. 468 da CLT (vedação à alteração
 * prejudicial). Benefício concedido de forma habitual a colegas em situação
 * equivalente pode ser exigido judicialmente; a diferença precisa de motivo
 * objetivo (norma coletiva, condição do benefício, adesão voluntária) ou de
 * manifestação escrita do colaborador.
 */
export function alertaIsonomia(
  beneficioNome: string,
  colegas: ColegaBeneficio[],
  alvo: { cargo_id?: string | null; unidade_id?: string | null },
): IsonomiaAlerta | null {
  const equivalentes = colegas.filter(
    (c) => c.ativo
      && (!alvo.cargo_id || c.cargo_id === alvo.cargo_id)
      && (!alvo.unidade_id || c.unidade_id === alvo.unidade_id),
  );
  if (equivalentes.length === 0) return null;

  return {
    colegas: equivalentes.map((c) => c.nome),
    titulo: `Colegas no mesmo cargo mantêm o ${beneficioNome}`,
    mensagem:
      `${equivalentes.length} colaborador(es) em situação equivalente recebem este benefício. ` +
      "Deixar de conceder sem motivo objetivo pode ser questionado por isonomia " +
      "(art. 461 da CLT) e como alteração prejudicial (art. 468 da CLT).",
    recomendacao:
      "Registre o motivo objetivo (previsão em norma coletiva, condição do benefício ou " +
      "opção do colaborador) e colha o termo de dispensa assinado.",
  };
}

// ------------------------------------------------------------------
// Termo de dispensa / não adesão
// ------------------------------------------------------------------

export interface TermoDispensaDados {
  empresa: string;
  empresaCnpj?: string | null;
  colaborador: string;
  colaboradorCpf?: string | null;
  cargo?: string | null;
  beneficio: string;
  motivo?: string | null;
  cidade?: string | null;
  data?: string | null;
}

const fmtData = (iso?: string | null) => {
  const d = iso ? new Date(`${iso}T12:00:00`) : new Date();
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
};

/** Texto do termo de dispensa, usado no documento imprimível. */
export function termoDispensaTexto(d: TermoDispensaDados): string[] {
  const motivo = d.motivo?.trim()
    ? `Declaro ainda que a não adesão decorre de: ${d.motivo.trim()}.`
    : "Declaro que a não adesão é livre e espontânea, sem qualquer imposição do empregador.";
  return [
    `Eu, ${d.colaborador}${d.colaboradorCpf ? `, CPF ${d.colaboradorCpf}` : ""}` +
      `${d.cargo ? `, ocupante do cargo de ${d.cargo}` : ""}, declaro para os devidos fins que ` +
      `fui informado(a) pela empresa ${d.empresa}${d.empresaCnpj ? ` (CNPJ ${d.empresaCnpj})` : ""} ` +
      `sobre a existência do benefício ${d.beneficio} e que OPTO POR NÃO ADERIR a este benefício.`,
    motivo,
    "Estou ciente de que esta manifestação não implica renúncia a direitos previstos em lei ou " +
      "em norma coletiva e que poderei solicitar a adesão ao benefício a qualquer momento, por escrito.",
    `${d.cidade ? `${d.cidade}, ` : ""}${fmtData(d.data)}.`,
  ];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;
