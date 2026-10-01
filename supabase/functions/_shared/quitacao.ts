/**
 * Forma de quitação do pagamento, no servidor.
 *
 * Mesmos rótulos usados nas telas (`src/lib/dp/comprovante-quitacao.ts`), mais
 * o valor por extenso exigido no recibo de pagamento em dinheiro.
 */

export type Modalidade = "bancario" | "especie" | "misto";

export const MODALIDADE_LABEL: Record<Modalidade, string> = {
  bancario: "Pix ou Transferência",
  especie: "Dinheiro (Espécie)",
  misto: "Misto (Conta e Dinheiro)",
};

export function ehModalidade(v?: string | null): v is Modalidade {
  return v === "bancario" || v === "especie" || v === "misto";
}

export function modalidadeLabel(v?: string | null): string {
  return ehModalidade(v) ? MODALIDADE_LABEL[v] : "Não informada";
}

export function centsParaBRL(cents?: number | null): string {
  const v = Number(cents ?? 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "Dinheiro (Espécie) · R$ 300,00 em dinheiro" */
export function resumoQuitacao(dados: {
  modalidade?: string | null;
  valor_bancario_cents?: number | null;
  valor_especie_cents?: number | null;
}): string {
  const m = dados.modalidade;
  if (!ehModalidade(m)) return "Forma de pagamento não informada";
  const partes = [MODALIDADE_LABEL[m]];
  if (m !== "especie" && dados.valor_bancario_cents) {
    partes.push(`${centsParaBRL(dados.valor_bancario_cents)} na conta`);
  }
  if (m !== "bancario" && dados.valor_especie_cents) {
    partes.push(`${centsParaBRL(dados.valor_especie_cents)} em dinheiro`);
  }
  return partes.join(" · ");
}

// ------------------------------------------------------------------
// Valor por extenso (exigência do recibo de quitação)
// ------------------------------------------------------------------

const UNIDADES = [
  "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete",
  "dezoito", "dezenove",
];
const DEZENAS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa",
];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos",
  "setecentos", "oitocentos", "novecentos",
];

function trio(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

function inteiroExtenso(n: number): string {
  if (n === 0) return "zero";
  const grupos: Array<{ valor: number; singular: string; plural: string }> = [
    { valor: 1_000_000_000, singular: "bilhão", plural: "bilhões" },
    { valor: 1_000_000, singular: "milhão", plural: "milhões" },
    { valor: 1_000, singular: "mil", plural: "mil" },
  ];
  const partes: string[] = [];
  let resto = n;
  for (const g of grupos) {
    const q = Math.floor(resto / g.valor);
    resto = resto % g.valor;
    if (!q) continue;
    if (g.valor === 1_000) partes.push(q === 1 ? "mil" : `${trio(q)} mil`);
    else partes.push(`${trio(q)} ${q === 1 ? g.singular : g.plural}`);
  }
  if (resto) partes.push(trio(resto));
  if (partes.length <= 1) return partes.join("");
  const ultimo = partes.pop() as string;
  const ligacao = /^(cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)/.test(ultimo)
    ? ", "
    : " e ";
  return `${partes.join(", ")}${ligacao}${ultimo}`;
}

/** "R$ 1.234,56" => "mil, duzentos e trinta e quatro reais e cinquenta e seis centavos". */
export function valorPorExtenso(cents: number): string {
  const total = Math.max(0, Math.round(Number(cents) || 0));
  const reais = Math.floor(total / 100);
  const centavos = total % 100;
  const partes: string[] = [];
  if (reais) partes.push(`${inteiroExtenso(reais)} ${reais === 1 ? "real" : "reais"}`);
  if (centavos) partes.push(`${inteiroExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  if (!partes.length) return "zero real";
  return partes.join(" e ");
}
