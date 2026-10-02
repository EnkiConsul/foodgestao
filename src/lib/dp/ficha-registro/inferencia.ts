/**
 * Sugestões automáticas tiradas da própria ficha de registro. O gestor só
 * confere e aprova; qualquer escolha manual prevalece sobre a sugestão.
 */
import type { JornadaSugerida } from "./jornada-parse";

/** Art. 74, § 2º da CLT: acima de 20 trabalhadores o controle de jornada é obrigatório. */
export const LIMITE_PONTO_OBRIGATORIO = 20;

const preenchido = (v: unknown) => String(v ?? "").replace(/\s+/g, "").length > 0;

/** Matrícula eSocial, PIS, CTPS ou opção de FGTS na ficha indicam vínculo CLT. */
export function inferirRegime(d: Record<string, unknown>): string | null {
  const fgts = String(d.fgts_optante ?? d.fgts ?? "").toLowerCase();
  if (
    preenchido(d.matricula_esocial) ||
    preenchido(d.pis_nit) ||
    preenchido(d.ctps_numero) ||
    fgts === "true" || fgts.startsWith("s") || /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(fgts)
  ) return "clt";
  return null;
}

/** Salário por hora → horista; rotina em 4+ dias da semana ou salário mensal → mensalista. */
export function inferirFormaPagamento(d: Record<string, unknown>, jornada: JornadaSugerida): string | null {
  const periodo = String(d.salario_periodo ?? "").toLowerCase();
  if (periodo.startsWith("hor") || periodo === "h") return "horista";
  if (periodo.startsWith("dia")) return "diarista";
  const diasTrabalhados = jornada.dias.filter((x) => x.trabalha).length;
  if (periodo.startsWith("mens") || diasTrabalhados >= 4) return "mensalista";
  return null;
}

export function salarioDaFicha(d: Record<string, unknown>): number | null {
  const bruto = d.salario;
  if (bruto === null || bruto === undefined || bruto === "") return null;
  const n = typeof bruto === "number" ? bruto : Number(String(bruto).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export type FamiliarFicha = { nome?: string | null; parentesco?: string | null; data_nascimento?: string | null; cpf?: string | null };

/** Só filhos, enteados, tutelados e cônjuge viram dependentes; pai e mãe ficam na filiação. */
export function parentescoDependente(p: string | null | undefined): "filho" | "enteado" | "tutelado" | "conjuge" | null {
  const t = String(p ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/entead/.test(t)) return "enteado";
  if (/tutel/.test(t)) return "tutelado";
  if (/filh/.test(t)) return "filho";
  if (/conjuge|espos|marido|companheir/.test(t)) return "conjuge";
  return null;
}

export function dependentesDaFicha(d: Record<string, unknown>) {
  const lista = Array.isArray(d.familiares) ? (d.familiares as FamiliarFicha[]) : [];
  return lista
    .map((f) => ({
      nome: String(f.nome ?? "").trim().toUpperCase(),
      parentesco: parentescoDependente(f.parentesco),
      data_nascimento: /^\d{4}-\d{2}-\d{2}$/.test(String(f.data_nascimento ?? "")) ? String(f.data_nascimento) : null,
      cpf: String(f.cpf ?? "").replace(/\D/g, "") || null,
    }))
    .filter((f): f is { nome: string; parentesco: "filho" | "enteado" | "tutelado" | "conjuge"; data_nascimento: string | null; cpf: string | null } =>
      f.nome.length >= 3 && !!f.parentesco);
}
