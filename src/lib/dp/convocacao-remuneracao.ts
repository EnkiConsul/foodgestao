// ------------------------------------------------------------------
// Domínio: DP → Remuneração prevista de um dia de convocação
//
// Abre o valor do dia em todas as parcelas que o compõem para o
// intermitente (que recebe as verbas proporcionais junto com o dia) e
// para o freelancer (acerto avulso, sem verbas CLT).
// Funções puras — nenhuma tela deve recalcular isso inline.
// ------------------------------------------------------------------

import { calcularInss, calcularFgts } from "./encargos";

const round2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** Janela legal do adicional noturno: 22:00 às 05:00. */
export const NOTURNO_INICIO_MIN = 22 * 60;
export const NOTURNO_FIM_MIN = 5 * 60;

/** Minutos desde a meia-noite de "HH:MM". */
export function minutosDoHorario(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * Minutos trabalhados dentro da janela noturna (22h–5h), considerando
 * jornadas que viram a madrugada.
 */
export function minutosNoturnos(
  entrada?: string | null,
  saida?: string | null,
  terminaNoDiaSeguinte = false,
): number {
  const ini = minutosDoHorario(entrada);
  let fim = minutosDoHorario(saida);
  if (ini === null || fim === null) return 0;
  if (terminaNoDiaSeguinte || fim <= ini) fim += 1440;

  let total = 0;
  // Duas janelas noturnas cobrem qualquer jornada de até 24h: a da própria
  // noite (22h–29h) e a madrugada do dia da entrada (0h–5h).
  const janelas: [number, number][] = [
    [0, NOTURNO_FIM_MIN],
    [NOTURNO_INICIO_MIN, 1440 + NOTURNO_FIM_MIN],
    [1440 + NOTURNO_INICIO_MIN, 2880 + NOTURNO_FIM_MIN],
  ];
  for (const [a, b] of janelas) {
    total += Math.max(0, Math.min(fim, b) - Math.max(ini, a));
  }
  return total;
}

export interface ConvocacaoRemuneracaoInput {
  /** Valor por hora (ou por diária, conforme `unidade`). */
  valorUnitario: number;
  unidade: "hora" | "diaria";
  /** Horas previstas (ou 1, para diária). */
  quantidade: number;
  entrada?: string | null;
  saida?: string | null;
  terminaNoDiaSeguinte?: boolean | null;
  /** Insalubridade/periculosidade em % sobre a remuneração das horas. */
  adicionalPercentual?: number | null;
  /** Adicional noturno em % (padrão legal 20%). */
  adicionalNoturnoPercentual?: number | null;
  valeAlimentacaoDia?: number | null;
  valeAlimentacaoDescontoDia?: number | null;
  premioAssiduidadeDia?: number | null;
  dependentesIrrf?: number | null;
  /** Intermitente recebe 13º e férias proporcionais no próprio dia. */
  comVerbasProporcionais?: boolean;
}

export interface ConvocacaoRemuneracaoParcela {
  chave: string;
  label: string;
  valor: number;
  /** Explicação curta exibida abaixo do rótulo. */
  detalhe?: string;
}

export interface ConvocacaoRemuneracao {
  horas: number;
  horasNoturnas: number;
  valorHoras: number;
  adicionalNoturno: number;
  adicionalInsalubridade: number;
  decimoTerceiro: number;
  ferias: number;
  tercoFerias: number;
  premioAssiduidade: number;
  /** Base tributável (INSS/FGTS): remuneração do trabalho e adicionais. */
  baseTributavel: number;
  valeAlimentacao: number;
  valeAlimentacaoDesconto: number;
  /** Bruto do dia: base tributável + vale-alimentação concedido. */
  bruto: number;
  inss: number;
  fgts: number;
  descontos: number;
  /** O que a pessoa recebe no dia (bruto − INSS − desconto do vale). */
  liquido: number;
  proventos: ConvocacaoRemuneracaoParcela[];
  descontosLista: ConvocacaoRemuneracaoParcela[];
}

/**
 * Abre a remuneração de um dia de convocação.
 * O FGTS aparece à parte: é depósito do empregador, nunca desconto.
 */
export function calcularRemuneracaoConvocacao(
  input: ConvocacaoRemuneracaoInput,
): ConvocacaoRemuneracao {
  const unitario = Math.max(0, num(input.valorUnitario));
  const qtd = Math.max(0, num(input.quantidade));
  const horas = input.unidade === "hora" ? qtd : 0;
  const valorHoras = round2(unitario * qtd);

  const horasNoturnas =
    input.unidade === "hora"
      ? round2(minutosNoturnos(input.entrada, input.saida, !!input.terminaNoDiaSeguinte) / 60)
      : 0;
  const pctNoturno = Math.max(0, num(input.adicionalNoturnoPercentual ?? 20));
  const adicionalNoturno =
    horasNoturnas > 0 && input.unidade === "hora"
      ? round2(horasNoturnas * unitario * (pctNoturno / 100))
      : 0;

  const pctAdicional = Math.min(100, Math.max(0, num(input.adicionalPercentual)));
  const adicionalInsalubridade = pctAdicional > 0 ? round2(valorHoras * (pctAdicional / 100)) : 0;

  const premioAssiduidade = round2(Math.max(0, num(input.premioAssiduidadeDia)));

  const baseVerbas = round2(valorHoras + adicionalNoturno + adicionalInsalubridade + premioAssiduidade);
  const comVerbas = input.comVerbasProporcionais !== false;
  const decimoTerceiro = comVerbas ? round2(baseVerbas / 12) : 0;
  const ferias = comVerbas ? round2(baseVerbas / 12) : 0;
  const tercoFerias = comVerbas ? round2(ferias / 3) : 0;

  const baseTributavel = round2(baseVerbas + decimoTerceiro + ferias + tercoFerias);

  const valeAlimentacao = round2(Math.max(0, num(input.valeAlimentacaoDia)));
  const valeAlimentacaoDesconto = round2(
    Math.min(valeAlimentacao, Math.max(0, num(input.valeAlimentacaoDescontoDia))),
  );

  const bruto = round2(baseTributavel + valeAlimentacao);
  const inss = comVerbas ? calcularInss(baseTributavel) : 0;
  const fgts = comVerbas ? calcularFgts(baseTributavel) : 0;
  const descontos = round2(inss + valeAlimentacaoDesconto);
  const liquido = round2(bruto - descontos);

  const proventos: ConvocacaoRemuneracaoParcela[] = [
    {
      chave: "horas",
      label: input.unidade === "hora" ? "Horas trabalhadas" : "Diária",
      valor: valorHoras,
      detalhe:
        input.unidade === "hora"
          ? `${horas.toLocaleString("pt-BR")} h × ${unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
          : undefined,
    },
    { chave: "noturno", label: `Adicional noturno (${pctNoturno}%)`, valor: adicionalNoturno, detalhe: horasNoturnas ? `${horasNoturnas.toLocaleString("pt-BR")} h após as 22h` : undefined },
    { chave: "adicional", label: `Insalubridade/periculosidade (${pctAdicional}%)`, valor: adicionalInsalubridade },
    { chave: "premio", label: "Prêmio de assiduidade (parte do dia)", valor: premioAssiduidade },
    { chave: "decimo", label: "13º proporcional", valor: decimoTerceiro },
    { chave: "ferias", label: "Férias proporcionais", valor: ferias },
    { chave: "terco", label: "1/3 de férias", valor: tercoFerias },
    { chave: "va", label: "Vale-alimentação do dia", valor: valeAlimentacao },
  ].filter((p) => p.valor > 0);

  const descontosLista: ConvocacaoRemuneracaoParcela[] = [
    { chave: "inss", label: "INSS", valor: inss },
    { chave: "va_desc", label: "Desconto do vale-alimentação", valor: valeAlimentacaoDesconto },
  ].filter((p) => p.valor > 0);

  return {
    horas,
    horasNoturnas,
    valorHoras,
    adicionalNoturno,
    adicionalInsalubridade,
    decimoTerceiro,
    ferias,
    tercoFerias,
    premioAssiduidade,
    baseTributavel,
    valeAlimentacao,
    valeAlimentacaoDesconto,
    bruto,
    inss,
    fgts,
    descontos,
    liquido,
    proventos,
    descontosLista,
  };
}

/** Lê o snapshot gravado na publicação e devolve a abertura do dia. */
export function remuneracaoDoSnapshot(
  snap: any,
  oferta?: { entrada?: string | null; saida?: string | null; termina_no_dia_seguinte?: boolean | null },
): ConvocacaoRemuneracao | null {
  if (!snap || typeof snap !== "object") return null;
  const unitario = num(snap.valor_unitario);
  const qtd = num(snap.quantidade_prevista);
  if (unitario <= 0 || qtd <= 0) return null;
  return calcularRemuneracaoConvocacao({
    valorUnitario: unitario,
    quantidade: qtd,
    unidade: snap.unidade_remuneracao === "diaria" ? "diaria" : "hora",
    entrada: oferta?.entrada,
    saida: oferta?.saida,
    terminaNoDiaSeguinte: oferta?.termina_no_dia_seguinte ?? false,
    adicionalPercentual: snap.adicional_percentual,
    adicionalNoturnoPercentual: snap.adicional_noturno_percentual ?? 20,
    valeAlimentacaoDia: snap.vale_alimentacao_dia,
    valeAlimentacaoDescontoDia: snap.vale_alimentacao_desconto_dia,
    premioAssiduidadeDia: snap.premio_assiduidade_dia,
    dependentesIrrf: snap.dependentes_irrf,
  });
}
