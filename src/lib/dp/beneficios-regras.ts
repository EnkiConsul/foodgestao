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

// ------------------------------------------------------------------
// Dias considerados no mês (benefício pago por dia)
// ------------------------------------------------------------------

/** Origem dos dias do benefício diário. */
export type DiasOrigem = "jornada" | "fixo";

export const DIAS_ORIGEM_LABEL: Record<DiasOrigem, string> = {
  jornada: "Pela jornada do colaborador",
  fixo: "Quantidade fixa (acordo/CCT)",
};

export interface DiaSemanaTrabalho {
  /** 0 = domingo … 6 = sábado. */
  dow: number;
  trabalha: boolean;
}

const DOW_CURTO_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * Dias trabalháveis do mês a partir dos dias da semana marcados na jornada.
 * Conta quantas vezes cada `dow` marcado como trabalha ocorre na competência.
 *
 * Retorna `null` quando a jornada ainda não foi cadastrada (nenhum dia marcado),
 * para que a tela avise em vez de fingir um número.
 */
export function diasTrabalhaveisNoMes(
  dias: DiaSemanaTrabalho[] | null | undefined,
  competencia: Date | string = new Date(),
): number | null {
  const marcados = new Set((dias ?? []).filter((d) => d.trabalha).map((d) => d.dow));
  if (marcados.size === 0) return null;

  const ref = typeof competencia === "string" ? new Date(`${competencia.slice(0, 7)}-01T12:00:00`) : competencia;
  const ano = ref.getFullYear();
  const mes = ref.getMonth();
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();

  let total = 0;
  for (let dia = 1; dia <= ultimoDia; dia++) {
    if (marcados.has(new Date(ano, mes, dia).getDay())) total++;
  }
  return total;
}

/** Dias do mês comercial usados na simulação de benefícios diários. */
export const DIAS_MES_COMERCIAL = 30;
/** Semanas consideradas no mês comercial. */
export const SEMANAS_MES_COMERCIAL = 4;

export interface SimulacaoDiasInput {
  /** Dias da semana da jornada do colaborador. */
  dias: DiaSemanaTrabalho[] | null | undefined;
  /** Folgas de fim de semana por mês (DSR da unidade/empresa) — sábado ou domingo. */
  folgasFimDeSemanaMes?: number | null;
}

/** Quantidade de dias da semana marcados como folga na jornada. */
export function folgasSemanaisDaJornada(dias: DiaSemanaTrabalho[] | null | undefined): number | null {
  const lista = (dias ?? []);
  if (lista.filter((d) => d.trabalha).length === 0) return null;
  return lista.filter((d) => !d.trabalha).length;
}

/**
 * Dias simulados no mês para benefício pago por dia:
 * 30 dias − (folgas semanais × 4) − folgas de fim de semana no mês.
 *
 * Não importa em qual dia da semana a folga cai: conta apenas quantos dias da
 * semana estão marcados como folga no cadastro do colaborador. A folga de fim
 * de semana (sábado ou domingo) vem da configuração de DSR.
 *
 * Retorna `null` quando a jornada ainda não foi cadastrada.
 */
export function diasSimuladosMesComercial(input: SimulacaoDiasInput): number | null {
  const folgas = folgasSemanaisDaJornada(input.dias);
  if (folgas == null) return null;
  const fds = Math.max(0, Math.trunc(num(input.folgasFimDeSemanaMes)));
  return Math.max(0, DIAS_MES_COMERCIAL - folgas * SEMANAS_MES_COMERCIAL - fds);
}

/** Texto da conta da simulação — "30 dias − 1 folga semanal × 4 − 1 folga de fim de semana". */
export function descreverBaseSimulacao(input: SimulacaoDiasInput): string {
  const folgas = folgasSemanaisDaJornada(input.dias);
  if (folgas == null) return "jornada não cadastrada";
  const fds = Math.max(0, Math.trunc(num(input.folgasFimDeSemanaMes)));
  const partes = [`${DIAS_MES_COMERCIAL} dias`];
  if (folgas > 0) {
    partes.push(
      `${folgas} ${folgas === 1 ? "folga semanal" : "folgas semanais"} × ${SEMANAS_MES_COMERCIAL}`,
    );
  }
  if (fds > 0) {
    partes.push(`${fds} ${fds === 1 ? "folga de fim de semana" : "folgas de fim de semana"}`);
  }
  return partes.join(" − ");
}

/** Resumo legível da jornada semanal — "seg a sáb, folga domingo". */
export function descreverDiasJornada(dias: DiaSemanaTrabalho[] | null | undefined): string {
  const trabalha = (dias ?? []).filter((d) => d.trabalha).map((d) => d.dow).sort((a, b) => a - b);
  if (trabalha.length === 0) return "jornada não cadastrada";
  if (trabalha.length === 7) return "todos os dias da semana";
  const folgas = [0, 1, 2, 3, 4, 5, 6].filter((d) => !trabalha.includes(d));
  const listaTrabalha = trabalha.map((d) => DOW_CURTO_LABEL[d]).join(", ");
  return `${listaTrabalha} — folga ${folgas.map((d) => DOW_CURTO_LABEL[d]).join(", ")}`;
}


/**
 * Dias considerados para o benefício diário, na ordem de precedência:
 * dias apurados no ponto > dias da jornada > quantidade fixa > padrão (22).
 */
export function diasConsideradosBeneficio(input: {
  origem?: DiasOrigem | string | null;
  diasFixos?: number | null;
  diasJornada?: number | null;
  diasApurados?: number | null;
}): { dias: number; origem: "ponto" | DiasOrigem | "padrao" } {
  const apurados = num(input.diasApurados);
  if (apurados > 0) return { dias: Math.trunc(apurados), origem: "ponto" };

  if ((input.origem ?? "jornada") === "jornada") {
    const jornada = num(input.diasJornada);
    if (jornada > 0) return { dias: Math.trunc(jornada), origem: "jornada" };
  } else {
    const fixo = num(input.diasFixos);
    if (fixo > 0) return { dias: Math.trunc(fixo), origem: "fixo" };
  }

  const fallback = num(input.diasFixos);
  if (fallback > 0) return { dias: Math.trunc(fallback), origem: "fixo" };
  return { dias: DIAS_BASE_PADRAO, origem: "padrao" };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;


// ------------------------------------------------------------------
// Isonomia por enquadramento sindical
//
// O grupo comparável mais forte é o sindical: colegas representados pelo mesmo
// sindicato laboral e sob o mesmo sindicato patronal negociam os mesmos
// benefícios. Sem sindicato definido, cai para unidade + cargo.
// ------------------------------------------------------------------

/** Chaves dos benefícios que vivem no cadastro do colaborador. */
export type BeneficioChave = "vale_alimentacao" | "vale_transporte" | "premio_assiduidade" | string;

export interface ColegaIsonomia {
  colaborador_id: string;
  nome: string;
  cargo_id?: string | null;
  unidade_id?: string | null;
  /** Sindicato laboral do colaborador. */
  sindicato_id?: string | null;
  /** Sindicato patronal resolvido pela unidade. */
  patronal_id?: string | null;
  /**
   * Situação de cada benefício. `valorMes` é o equivalente mensal usado para
   * comparar periodicidades diferentes; `valorUnitario` + `periodicidade`
   * guardam o valor como ele foi cadastrado (ex.: R$ 24,00 por dia).
   */
  beneficios: Record<BeneficioChave, {
    ativo: boolean;
    valorMes?: number | null;
    valorUnitario?: number | null;
    periodicidade?: Periodicidade | null;
  }>;
}

export interface AlvoIsonomia {
  cargo_id?: string | null;
  unidade_id?: string | null;
  sindicato_id?: string | null;
  patronal_id?: string | null;
}

export type IsonomiaBase = "sindicato" | "cargo_unidade";

export interface GrupoIsonomia {
  colegas: ColegaIsonomia[];
  base: IsonomiaBase;
}

/**
 * Grupo de colegas em situação equivalente.
 *
 * Preferência pelo enquadramento sindical (laboral + patronal, quando ambos
 * conhecidos); na falta dele, unidade + cargo.
 */
export function grupoIsonomia(colegas: ColegaIsonomia[], alvo: AlvoIsonomia): GrupoIsonomia {
  if (alvo.sindicato_id) {
    const porSindicato = colegas.filter(
      (c) => c.sindicato_id === alvo.sindicato_id
        && (!alvo.patronal_id || !c.patronal_id || c.patronal_id === alvo.patronal_id),
    );
    if (porSindicato.length > 0) return { colegas: porSindicato, base: "sindicato" };
  }
  const porCargo = colegas.filter(
    (c) => (!alvo.unidade_id || c.unidade_id === alvo.unidade_id)
      && (!alvo.cargo_id || c.cargo_id === alvo.cargo_id),
  );
  return { colegas: porCargo, base: "cargo_unidade" };
}

export type DivergenciaTipo = "ausente" | "valor_menor";

export interface DivergenciaIsonomia {
  chave: BeneficioChave;
  beneficio_nome: string;
  tipo: DivergenciaTipo;
  /** Nomes dos colegas do grupo que recebem o benefício. */
  colegas: string[];
  /** Base da comparação usada. */
  base: IsonomiaBase;
  /** Nome do sindicato em comum, quando a base é sindical. */
  sindicato_nome?: string | null;
  /** Valor mensal predominante no grupo (quando conhecido). */
  valor_padrao?: number | null;
  /** Valor mensal deste colaborador (quando o benefício existe com valor menor). */
  valor_atual?: number | null;
  titulo: string;
  mensagem: string;
  recomendacao: string;
}

/** Valor predominante (moda) entre os colegas que recebem o benefício. */
function valorPredominante(valores: number[]): number | null {
  const validos = valores.filter((v) => Number.isFinite(v) && v > 0);
  if (validos.length === 0) return null;
  const contagem = new Map<number, number>();
  for (const v of validos) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  let melhor = validos[0];
  let max = 0;
  for (const [valor, qtd] of contagem) {
    if (qtd > max || (qtd === max && valor > melhor)) { melhor = valor; max = qtd; }
  }
  return melhor;
}

export interface BeneficioAlvoIsonomia {
  chave: BeneficioChave;
  nome: string;
  ativo: boolean;
  /** Valor mensal concedido a este colaborador (quando aplicável). */
  valorMes?: number | null;
  /** Comparar também o valor com o do grupo. */
  compararValor?: boolean;
}

const BASE_LEGAL =
  "Benefício concedido de forma habitual a colegas em situação equivalente pode ser exigido " +
  "judicialmente: isonomia (art. 461 da CLT e art. 7º, XXX da Constituição) e vedação à " +
  "alteração prejudicial (art. 468 da CLT).";

/**
 * Divergências de benefício deste colaborador contra o grupo equivalente.
 *
 * Vale tanto para cadastro novo quanto para edição: o que importa é o benefício
 * estar ausente (ou com valor menor) enquanto o grupo recebe.
 */
export function divergenciasIsonomia(
  itens: BeneficioAlvoIsonomia[],
  colegas: ColegaIsonomia[],
  alvo: AlvoIsonomia,
  opcoes?: { sindicatoNome?: string | null; minimoColegas?: number },
): DivergenciaIsonomia[] {
  const grupo = grupoIsonomia(colegas, alvo);
  const minimo = Math.max(1, opcoes?.minimoColegas ?? 1);
  const sindicatoNome = grupo.base === "sindicato" ? opcoes?.sindicatoNome ?? null : null;
  const referencia = sindicatoNome
    ? `representados pelo sindicato ${sindicatoNome}`
    : "no mesmo cargo e unidade";

  const out: DivergenciaIsonomia[] = [];

  for (const item of itens) {
    const comBeneficio = grupo.colegas.filter((c) => c.beneficios?.[item.chave]?.ativo);
    if (comBeneficio.length < minimo) continue;

    const nomes = comBeneficio.map((c) => c.nome);
    const padrao = valorPredominante(
      comBeneficio.map((c) => Number(c.beneficios?.[item.chave]?.valorMes ?? 0)),
    );

    if (!item.ativo) {
      out.push({
        chave: item.chave,
        beneficio_nome: item.nome,
        tipo: "ausente",
        colegas: nomes,
        base: grupo.base,
        sindicato_nome: sindicatoNome,
        valor_padrao: padrao,
        valor_atual: null,
        titulo: `Colegas ${referencia} recebem ${item.nome}`,
        mensagem:
          `${comBeneficio.length} colaborador(es) ${referencia} recebem este benefício e este ` +
          `cadastro está sem ele. ${BASE_LEGAL}`,
        recomendacao:
          "Conceda nas mesmas condições ou registre o motivo objetivo (previsão em norma " +
          "coletiva, condição do benefício ou opção do colaborador) com termo assinado.",
      });
      continue;
    }

    if (item.compararValor && padrao != null) {
      const atual = Number(item.valorMes ?? 0);
      // Diferença acima de 1 centavo evita alarme por arredondamento.
      if (atual > 0 && padrao - atual > 0.01) {
        out.push({
          chave: item.chave,
          beneficio_nome: item.nome,
          tipo: "valor_menor",
          colegas: nomes,
          base: grupo.base,
          sindicato_nome: sindicatoNome,
          valor_padrao: padrao,
          valor_atual: atual,
          titulo: `${item.nome} menor que o dos colegas ${referencia}`,
          mensagem:
            `O grupo recebe o equivalente a ${padrao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ` +
            `no mês e este cadastro está com ${atual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. ` +
            BASE_LEGAL,
          recomendacao:
            "Iguale o valor ao praticado no grupo ou registre o motivo objetivo da diferença.",
        });
      }
    }
  }

  return out;
}

/** Motivos objetivos aceitos para manter a diferença de benefício. */
export const MOTIVOS_ISONOMIA = [
  { valor: "norma_coletiva", label: "Previsão diferente em norma coletiva (CCT/ACT)" },
  { valor: "condicao_beneficio", label: "Não atende à condição do benefício" },
  { valor: "opcao_colaborador", label: "Opção do colaborador (não adesão)" },
  { valor: "outro", label: "Outro motivo (descrever)" },
] as const;

export type MotivoIsonomia = (typeof MOTIVOS_ISONOMIA)[number]["valor"];

export const MOTIVO_ISONOMIA_LABEL: Record<string, string> = Object.fromEntries(
  MOTIVOS_ISONOMIA.map((m) => [m.valor, m.label]),
);
