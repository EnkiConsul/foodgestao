/**
 * Conferência do valor pago (conta + dinheiro) contra o valor líquido do
 * documento (recibo, contracheque, adiantamento, férias, rescisão).
 *
 * O resultado é orientação: pagamento parcial ou divergente pode ser gravado,
 * mas pede ciência com justificativa na tela.
 */
import { centsParaBRL } from "@/lib/dp/comprovante-quitacao";

export type StatusValor = "exato" | "menor" | "maior" | "sem_referencia";

export type ConferenciaValor = {
  status: StatusValor;
  esperadoCents: number | null;
  comprovadoCents: number;
  /** comprovado - esperado (negativo = falta). */
  diferencaCents: number;
};

export function conferirValor(
  esperadoCents: number | null | undefined,
  bancarioCents: number | null | undefined,
  especieCents: number | null | undefined,
): ConferenciaValor {
  const comprovado = Number(bancarioCents ?? 0) + Number(especieCents ?? 0);
  const esperado = esperadoCents && esperadoCents > 0 ? Number(esperadoCents) : null;
  if (!esperado || comprovado <= 0) {
    return { status: "sem_referencia", esperadoCents: esperado, comprovadoCents: comprovado, diferencaCents: 0 };
  }
  const dif = comprovado - esperado;
  return {
    status: dif === 0 ? "exato" : dif < 0 ? "menor" : "maior",
    esperadoCents: esperado,
    comprovadoCents: comprovado,
    diferencaCents: dif,
  };
}

export function fraseConferenciaValor(c: ConferenciaValor): string | null {
  if (c.status === "exato") return `Valor confere: ${centsParaBRL(c.comprovadoCents)}`;
  if (c.status === "menor") return `Faltam ${centsParaBRL(-c.diferencaCents)} para a quitação integral`;
  if (c.status === "maior") return `Valor comprovado excede o documento em ${centsParaBRL(c.diferencaCents)}`;
  return null;
}

export const JUSTIFICATIVA_VALOR_MIN = 10;

/** Situação consolidada: comprovante principal + complementares. */
export type QuitacaoConsolidada = ConferenciaValor & { qtd: number };

export function consolidarQuitacao(dados: {
  liquidoCents?: number | null;
  temPrincipal: boolean;
  principalBancarioCents?: number | null;
  principalEspecieCents?: number | null;
  extraQtd?: number | null;
  extraCents?: number | null;
}): QuitacaoConsolidada {
  const qtd = (dados.temPrincipal ? 1 : 0) + Number(dados.extraQtd ?? 0);
  const c = conferirValor(
    dados.liquidoCents,
    Number(dados.principalBancarioCents ?? 0) + Number(dados.extraCents ?? 0),
    dados.principalEspecieCents,
  );
  return { ...c, qtd };
}

/** Rótulo curto para a lista: "R$ 700,00 ✓", "2 comprovantes · R$ 3.000,00 ✓", "R$ 400,00 de R$ 700,00". */
export function rotuloQuitacao(q: QuitacaoConsolidada): string | null {
  if (q.qtd === 0 || q.comprovadoCents <= 0) return null;
  const pref = q.qtd > 1 ? `${q.qtd} comprovantes · ` : "";
  if (q.status === "exato") return `${pref}${centsParaBRL(q.comprovadoCents)} ✓`;
  if (q.status === "menor") return `${pref}${centsParaBRL(q.comprovadoCents)} de ${centsParaBRL(q.esperadoCents)}`;
  if (q.status === "maior") return `${pref}${centsParaBRL(q.comprovadoCents)} (excede)`;
  return `${pref}${centsParaBRL(q.comprovadoCents)}`;
}
