// Helpers e tipos para o módulo DRE Contábil
import { formatBRL } from "@/lib/billing";

export type DRERegime = "caixa" | "competencia";
export type DRETipoPeriodo = "mensal" | "trimestral" | "semestral" | "anual" | "personalizado";

export interface DRERubricaLinha {
  rubrica_id: string;
  codigo: string;
  nome: string;
  grupo_pai_codigo: string | null;
  tipo: string | null;
  natureza: "credora" | "devedora";
  is_calculada: boolean;
  ordem: number;
  valor_base: number;
  ajuste: number;
  substituir: number | null;
  qt_ajustes: number;
  valor: number;
}

export interface DRETotais {
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  custos: number;
  lucro_bruto: number;
  despesas_operacionais: number;
  outras_receitas_operacionais: number;
  ebit: number;
  receitas_financeiras: number;
  despesas_financeiras: number;
  resultado_financeiro: number;
  lair: number;
  provisoes: number;
  lucro_liquido: number;
  margem_bruta_pct: number;
  margem_operacional_pct: number;
  margem_liquida_pct: number;
}

export interface DREGenerated {
  company_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  regime: DRERegime;
  rubricas: DRERubricaLinha[];
  totais: DRETotais;
}

export function formatValor(n: number | null | undefined, opts?: { showNegativeParens?: boolean }): string {
  const v = Number(n ?? 0);
  if (opts?.showNegativeParens && v < 0) return `(${formatBRL(Math.abs(v))})`;
  return formatBRL(v);
}

export function formatPct(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `${v.toFixed(1).replace(".", ",")}%`;
}

export function nivelIndent(codigo: string): number {
  if (["REC_LIQ", "LUC_BRU", "EBIT", "LAIR", "LUCRO_LIQ"].includes(codigo)) return 0;
  const parts = codigo.split(".");
  return Math.max(0, parts.length - 1);
}

export function isSubtotal(codigo: string): boolean {
  return ["REC_LIQ", "LUC_BRU", "EBIT", "LAIR", "LUCRO_LIQ"].includes(codigo);
}

export function isCabecalho(codigo: string): boolean {
  return /^[0-9]+$/.test(codigo);
}

export function computeSubtotal(codigo: string, totais: DRETotais): number {
  switch (codigo) {
    case "REC_LIQ": return totais.receita_liquida;
    case "LUC_BRU": return totais.lucro_bruto;
    case "EBIT": return totais.ebit;
    case "LAIR": return totais.lair;
    case "LUCRO_LIQ": return totais.lucro_liquido;
    default: return 0;
  }
}

export function periodoFromTipo(tipo: DRETipoPeriodo, ref = new Date()): { from: string; to: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  let from: Date, to: Date;
  switch (tipo) {
    case "mensal": from = new Date(y, m, 1); to = new Date(y, m + 1, 0); break;
    case "trimestral": {
      const qStart = Math.floor(m / 3) * 3;
      from = new Date(y, qStart, 1); to = new Date(y, qStart + 3, 0); break;
    }
    case "semestral": {
      const sStart = m < 6 ? 0 : 6;
      from = new Date(y, sStart, 1); to = new Date(y, sStart + 6, 0); break;
    }
    case "anual": from = new Date(y, 0, 1); to = new Date(y, 12, 0); break;
    default: from = new Date(y, m, 1); to = new Date(y, m + 1, 0);
  }
  return { from: toISO(from), to: toISO(to) };
}
