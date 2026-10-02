/**
 * Divergência com a Ficha de Registro.
 *
 * A ficha é registro contábil (espelho de CTPS/eSocial). Qualquer condição de
 * trabalho gravada no sistema diferente do que a ficha registrou — cargo,
 * salário, horário, vínculo, forma de pagamento — exige justificativa formal e
 * termo de ciência. O alerta só aparece quando há divergência no salvamento.
 */
import { num } from "./payload";

export const JUSTIFICATIVA_DIVERGENCIA_MIN = 15;

export interface DivergenciaFicha {
  campo: string;
  label: string;
  ficha: string;
  sistema: string;
}

export const normalizarNome = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const moeda = (v: number | null) =>
  v == null ? "Não informado" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface CondicoesComparaveis {
  cargoNome?: string | null;
  salario?: number | string | null;
  regime?: string | null;
  formaPagamento?: string | null;
  /** Texto do horário quando foi editado em relação à ficha. */
  horarioAlterado?: { ficha: string; sistema: string } | null;
}

/** Só compara o que a ficha efetivamente registrou: ausência na ficha não gera alerta. */
export function divergenciasComFicha(
  ficha: CondicoesComparaveis,
  sistema: CondicoesComparaveis,
  rotulos: { regime?: (v: string) => string; forma?: (v: string) => string } = {},
): DivergenciaFicha[] {
  const out: DivergenciaFicha[] = [];

  const cargoFicha = normalizarNome(ficha.cargoNome);
  const cargoSistema = normalizarNome(sistema.cargoNome);
  if (cargoFicha && cargoSistema && cargoFicha !== cargoSistema) {
    out.push({ campo: "cargo", label: "Cargo", ficha: cargoFicha, sistema: cargoSistema });
  }

  const salFicha = num(ficha.salario);
  const salSistema = num(sistema.salario);
  if (salFicha != null && salFicha > 0 && salSistema != null && Math.abs(salFicha - salSistema) >= 0.01) {
    out.push({ campo: "salario", label: "Salário", ficha: moeda(salFicha), sistema: moeda(salSistema) });
  }

  if (ficha.regime && sistema.regime && ficha.regime !== sistema.regime) {
    const r = rotulos.regime ?? ((v: string) => v);
    out.push({ campo: "regime", label: "Vínculo", ficha: r(ficha.regime), sistema: r(sistema.regime) });
  }

  if (ficha.formaPagamento && sistema.formaPagamento && ficha.formaPagamento !== sistema.formaPagamento) {
    const f = rotulos.forma ?? ((v: string) => v);
    out.push({
      campo: "forma_pagamento",
      label: "Forma de pagamento",
      ficha: f(ficha.formaPagamento),
      sistema: f(sistema.formaPagamento),
    });
  }

  if (sistema.horarioAlterado) {
    out.push({ campo: "horario", label: "Horário", ...sistema.horarioAlterado });
  }

  return out;
}

export const resumoDivergencias = (d: DivergenciaFicha[]) =>
  d.map((x) => `${x.label}: ficha "${x.ficha}" → sistema "${x.sistema}"`).join("; ");

export const cienciaDivergenciaValida = (justificativa: string, ciente: boolean) =>
  ciente && justificativa.trim().length >= JUSTIFICATIVA_DIVERGENCIA_MIN;
