// ------------------------------------------------------------------
// Domínio: DP → Piso salarial do cargo por sindicato patronal.
//
// O sindicato laboral vem do cargo, mas o patronal é da unidade. Cada convenção
// patronal negocia seu próprio piso, então o salário de referência é resolvido
// por (cargo, sindicato patronal da unidade, data). Unidades que compartilham o
// mesmo patronal compartilham o piso; uma unidade pode ter ajuste próprio, desde
// que não fique abaixo do piso do patronal. Sem piso do patronal, o sistema não
// herda o salário geral do cargo: exige o cadastro.
// ------------------------------------------------------------------

export interface CargoSalarioLinha {
  id?: string;
  cargo_id?: string;
  /** Preenchido apenas nos ajustes de uma unidade específica. */
  unidade_id?: string | null;
  /** Sindicato patronal ao qual o piso pertence. */
  sindicato_patronal_id?: string | null;
  salario_base: number;
  vigencia_inicio: string;
  vigencia_fim?: string | null;
  observacao?: string | null;
}

/** Compatibilidade com o nome anterior. */
export type CargoSalarioUnidade = CargoSalarioLinha;

export type OrigemSalario = "unidade" | "patronal" | "pendente";

export interface SalarioResolvido {
  /** Valor aplicável (null quando pendente de cadastro). */
  valor: number | null;
  origem: OrigemSalario;
  /** Piso do patronal vigente (mínimo legal para ajustes da unidade). */
  pisoPatronal: number | null;
  /** Linha usada como piso do patronal. */
  linhaPatronal?: CargoSalarioLinha | null;
  /** Linha de ajuste da unidade, quando existir. */
  linhaUnidade?: CargoSalarioLinha | null;
  /** Falta cadastrar o piso deste cargo para o patronal da unidade. */
  faltaPisoPatronal: boolean;
  /** A unidade não tem sindicato patronal vinculado. */
  semPatronalVinculado: boolean;
}

const hoje = () => new Date().toISOString().slice(0, 10);

/** A linha está vigente na data informada (YYYY-MM-DD). */
export function pisoVigente(p: CargoSalarioLinha, data: string): boolean {
  if (p.vigencia_inicio && p.vigencia_inicio > data) return false;
  if (p.vigencia_fim && p.vigencia_fim < data) return false;
  return true;
}

const maisRecente = (lista: CargoSalarioLinha[]): CargoSalarioLinha | null =>
  [...lista].sort((a, b) => (a.vigencia_inicio < b.vigencia_inicio ? 1 : -1))[0] ?? null;

/** Piso vigente do cargo naquele sindicato patronal. */
export function pisoDoPatronal(
  linhas: CargoSalarioLinha[] | null | undefined,
  patronalId: string | null | undefined,
  data: string = hoje(),
): CargoSalarioLinha | null {
  if (!patronalId) return null;
  return maisRecente(
    (linhas ?? []).filter(
      (p) => !p.unidade_id && p.sindicato_patronal_id === patronalId && pisoVigente(p, data),
    ),
  );
}

/** Ajuste vigente do cargo naquela unidade. */
export function ajusteDaUnidade(
  linhas: CargoSalarioLinha[] | null | undefined,
  unidadeId: string | null | undefined,
  data: string = hoje(),
): CargoSalarioLinha | null {
  if (!unidadeId) return null;
  return maisRecente((linhas ?? []).filter((p) => p.unidade_id === unidadeId && pisoVigente(p, data)));
}

/**
 * Salário de referência do cargo para a unidade na data:
 * ajuste da unidade → piso do patronal da unidade → pendente.
 */
export function salarioCargoNaUnidade(
  linhas: CargoSalarioLinha[] | null | undefined,
  unidadeId: string | null | undefined,
  patronalId: string | null | undefined,
  data: string = hoje(),
): SalarioResolvido {
  const lista = linhas ?? [];
  const linhaPatronal = pisoDoPatronal(lista, patronalId, data);
  const pisoPatronal = linhaPatronal && linhaPatronal.salario_base > 0 ? Number(linhaPatronal.salario_base) : null;
  const linhaUnidade = ajusteDaUnidade(lista, unidadeId, data);
  const semPatronalVinculado = !!unidadeId && !patronalId;
  const faltaPisoPatronal = !!patronalId && pisoPatronal == null;

  if (linhaUnidade && linhaUnidade.salario_base > 0) {
    return {
      valor: Number(linhaUnidade.salario_base),
      origem: "unidade",
      pisoPatronal,
      linhaPatronal,
      linhaUnidade,
      faltaPisoPatronal,
      semPatronalVinculado,
    };
  }
  if (pisoPatronal != null) {
    return {
      valor: pisoPatronal,
      origem: "patronal",
      pisoPatronal,
      linhaPatronal,
      linhaUnidade: null,
      faltaPisoPatronal: false,
      semPatronalVinculado,
    };
  }
  return {
    valor: null,
    origem: "pendente",
    pisoPatronal: null,
    linhaPatronal: null,
    linhaUnidade: null,
    faltaPisoPatronal,
    semPatronalVinculado,
  };
}

/** Tolerância de centavos. */
const TOL = 0.005;

export type ValidacaoOverride =
  | { ok: true }
  | { ok: false; motivo: "valor_invalido" }
  | { ok: false; motivo: "abaixo_do_piso"; piso: number }
  | { ok: false; motivo: "sem_piso_patronal" };

/**
 * O ajuste de uma unidade só é aceito se houver piso do patronal cadastrado e o
 * valor não ficar abaixo dele (o piso sindical é mínimo, não teto).
 */
export function validarOverrideUnidade(
  valor: number | null | undefined,
  pisoPatronal: number | null | undefined,
): ValidacaoOverride {
  const v = valor == null ? 0 : Number(valor);
  if (!v || v <= 0) return { ok: false, motivo: "valor_invalido" };
  if (pisoPatronal == null || pisoPatronal <= 0) return { ok: false, motivo: "sem_piso_patronal" };
  if (v + TOL < pisoPatronal) return { ok: false, motivo: "abaixo_do_piso", piso: Number(pisoPatronal) };
  return { ok: true };
}

/** Aplica um reajuste percentual a um valor, arredondando em centavos. */
export function aplicarReajuste(valor: number, percentual: number): number {
  const p = Number.isFinite(percentual) ? percentual : 0;
  return Math.round(valor * (1 + p / 100) * 100) / 100;
}

/** Dia anterior a uma data YYYY-MM-DD — fim de vigência do piso substituído. */
export function diaAnterior(data: string): string {
  const d = new Date(`${data}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type StatusVigencia = "vigente" | "futuro" | "encerrado";

/** Situação da linha em relação à data de referência. */
export function statusVigencia(p: CargoSalarioLinha, data: string = hoje()): StatusVigencia {
  if (p.vigencia_inicio && p.vigencia_inicio > data) return "futuro";
  if (p.vigencia_fim && p.vigencia_fim < data) return "encerrado";
  return "vigente";
}

/** Linha em aberto (sem fim de vigência) do cargo naquele escopo. */
export function linhaEmAberto(
  linhas: CargoSalarioLinha[] | null | undefined,
  escopo: { patronalId?: string | null; unidadeId?: string | null },
): CargoSalarioLinha | null {
  const lista = linhas ?? [];
  if (escopo.unidadeId) {
    return lista.find((p) => p.unidade_id === escopo.unidadeId && !p.vigencia_fim) ?? null;
  }
  if (escopo.patronalId) {
    return (
      lista.find(
        (p) => !p.unidade_id && p.sindicato_patronal_id === escopo.patronalId && !p.vigencia_fim,
      ) ?? null
    );
  }
  return null;
}

/** Mensagem em português para erros do banco ao gravar o piso. */
export function mensagemErroPiso(e: unknown): string {
  const any = e as any;
  const bruto: string =
    (typeof any?.message === "string" && any.message) ||
    (typeof any?.details === "string" && any.details) ||
    (typeof e === "string" ? e : "") ||
    "Erro desconhecido.";
  if (/duplicate key|already exists|uniq/i.test(bruto)) {
    return "Já existe um valor em aberto para este cargo neste escopo. Use “Novo reajuste” para substituir o valor anterior mantendo o histórico.";
  }
  if (/vigencia_fim|dp_cargo_salarios_check/i.test(bruto)) {
    return "A data de fim de vigência não pode ser anterior ao início.";
  }
  if (/salario_base_check/i.test(bruto)) return "O salário informado deve ser maior que zero.";
  if (/row-level security|permission/i.test(bruto)) {
    return "Você não tem permissão para alterar salários nesta empresa.";
  }
  if (/mesma empresa/i.test(bruto)) return bruto;
  return bruto;
}

