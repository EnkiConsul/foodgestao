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

import { moedaBR } from "./cargos";



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

const maisProxima = (lista: CargoSalarioLinha[]): CargoSalarioLinha | null =>
  [...lista].sort((a, b) => (a.vigencia_inicio > b.vigencia_inicio ? 1 : -1))[0] ?? null;

/**
 * Aceitar piso futuro evita pedir cadastro de piso quando a convenção já foi
 * negociada mas começa depois da data de referência (ex.: admissão antiga).
 */
export interface ResolucaoOpts {
  aceitarFuturo?: boolean;
}

/** Piso vigente do cargo naquele sindicato patronal. */
export function pisoDoPatronal(
  linhas: CargoSalarioLinha[] | null | undefined,
  patronalId: string | null | undefined,
  data: string = hoje(),
  opts?: ResolucaoOpts,
): CargoSalarioLinha | null {
  if (!patronalId) return null;
  const doPatronal = (linhas ?? []).filter(
    (p) => !p.unidade_id && p.sindicato_patronal_id === patronalId,
  );
  const vigente = maisRecente(doPatronal.filter((p) => pisoVigente(p, data)));
  if (vigente || !opts?.aceitarFuturo) return vigente;
  return maisProxima(doPatronal.filter((p) => statusVigencia(p, data) === "futuro"));
}

/** Ajuste vigente do cargo naquela unidade. */
export function ajusteDaUnidade(
  linhas: CargoSalarioLinha[] | null | undefined,
  unidadeId: string | null | undefined,
  data: string = hoje(),
  opts?: ResolucaoOpts,
): CargoSalarioLinha | null {
  if (!unidadeId) return null;
  const daUnidade = (linhas ?? []).filter((p) => p.unidade_id === unidadeId);
  const vigente = maisRecente(daUnidade.filter((p) => pisoVigente(p, data)));
  if (vigente || !opts?.aceitarFuturo) return vigente;
  return maisProxima(daUnidade.filter((p) => statusVigencia(p, data) === "futuro"));
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
  opts?: ResolucaoOpts,
): SalarioResolvido {
  const lista = linhas ?? [];
  const linhaPatronal = pisoDoPatronal(lista, patronalId, data, opts);
  const pisoPatronal = linhaPatronal && linhaPatronal.salario_base > 0 ? Number(linhaPatronal.salario_base) : null;
  const linhaUnidade = ajusteDaUnidade(lista, unidadeId, data, opts);
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


// ------------------------------------------------------------------
// Rótulo do salário do cargo (compartilhado entre a tela de Cargos e a
// ficha do colaborador). Nunca lê o campo legado `dp_cargos.salario_base`:
// o valor vem sempre dos pisos por sindicato patronal / unidade.
// ------------------------------------------------------------------

export interface RotuloSalarioCargo {
  /** Texto curto para exibir ao lado do nome do cargo. */
  texto: string;
  /** Explicação de onde o valor veio (tooltip). */
  dica: string;
  /** Valor resolvido quando há escopo definido (null em faixa ou pendente). */
  valor: number | null;
}

export interface EscopoRotuloSalario {
  unidadeId?: string | null;
  patronalId?: string | null;
  data?: string;
}

const PENDENTE = "piso a cadastrar";

export function rotuloSalarioCargo(
  linhas: CargoSalarioLinha[] | null | undefined,
  escopo: EscopoRotuloSalario = {},
): RotuloSalarioCargo {
  const lista = linhas ?? [];
  const data = escopo.data || hoje();

  // Com unidade escolhida, o salário é único: ajuste da unidade → piso do patronal.
  if (escopo.unidadeId) {
    const r = salarioCargoNaUnidade(lista, escopo.unidadeId, escopo.patronalId ?? null, data, {
      aceitarFuturo: true,
    });
    if (r.valor == null) {
      return {
        texto: PENDENTE,
        dica: r.semPatronalVinculado
          ? "A unidade não tem sindicato patronal vinculado"
          : "Cadastre o piso do sindicato patronal desta unidade",
        valor: null,
      };
    }
    return {
      texto: moedaBR(r.valor),
      dica:
        r.origem === "unidade"
          ? "Ajuste desta unidade"
          : "Piso do sindicato patronal da unidade",
      valor: r.valor,
    };
  }

  // Sem unidade: mostra a faixa dos pisos aplicáveis (vigentes ou já negociados).
  const valores = lista
    .filter((p) => {
      const st = statusVigencia(p, data);
      return st === "vigente" || st === "futuro";
    })
    .map((p) => Number(p.salario_base))
    .filter((v) => Number.isFinite(v) && v > 0);

  if (valores.length === 0) {
    return { texto: PENDENTE, dica: "Cadastre o piso do sindicato patronal", valor: null };
  }
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  if (min === max) {
    return {
      texto: moedaBR(min),
      dica: `${valores.length} piso(s) cadastrado(s)`,
      valor: min,
    };
  }
  return {
    texto: `${moedaBR(min)} a ${moedaBR(max)}`,
    dica: `${valores.length} pisos por sindicato patronal / unidade`,
    valor: null,
  };
}

/** Agrupa linhas de piso por cargo (uma consulta só para vários cargos). */
export function agruparPisosPorCargo<T extends { cargo_id?: string | null }>(
  linhas: T[] | null | undefined,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const p of linhas ?? []) {
    if (!p.cargo_id) continue;
    const arr = map.get(p.cargo_id) ?? [];
    arr.push(p);
    map.set(p.cargo_id, arr);
  }
  return map;
}

// ------------------------------------------------------------------
// Edição de um piso já cadastrado
//
// Editar um piso mexe em folha, provisões e conferências, então a alteração
// exige justificativa e passa pelas mesmas regras de vigência do cadastro:
// fim >= início, ajuste de unidade nunca abaixo do piso do patronal e nenhuma
// sobreposição de vigências no mesmo escopo.
// ------------------------------------------------------------------

/** Mínimo de caracteres exigido na justificativa da alteração. */
export const JUSTIFICATIVA_MIN = 10;

export interface EdicaoPiso {
  id: string;
  salario_base: number;
  vigencia_inicio: string;
  vigencia_fim?: string | null;
  unidade_id?: string | null;
  sindicato_patronal_id?: string | null;
  observacao?: string | null;
  justificativa: string;
}

export type ValidacaoEdicaoPiso =
  | { ok: true }
  | { ok: false; campo: "justificativa" | "salario_base" | "vigencia_inicio" | "vigencia_fim" | "escopo"; mensagem: string };

/** Duas linhas do mesmo escopo se sobrepõem no tempo? */
export function vigenciasSobrepostas(
  a: { vigencia_inicio: string; vigencia_fim?: string | null },
  b: { vigencia_inicio: string; vigencia_fim?: string | null },
): boolean {
  const fimA = a.vigencia_fim || "9999-12-31";
  const fimB = b.vigencia_fim || "9999-12-31";
  return a.vigencia_inicio <= fimB && b.vigencia_inicio <= fimA;
}

const mesmoEscopo = (
  a: { unidade_id?: string | null; sindicato_patronal_id?: string | null },
  b: { unidade_id?: string | null; sindicato_patronal_id?: string | null },
) =>
  (a.unidade_id ?? null) === (b.unidade_id ?? null) &&
  (a.unidade_id
    ? true
    : (a.sindicato_patronal_id ?? null) === (b.sindicato_patronal_id ?? null));

/**
 * Valida a edição de um piso contra as demais linhas do cargo.
 * `outras` deve conter todas as linhas do cargo (a própria é ignorada pelo id).
 */
export function validarEdicaoPiso(
  edicao: EdicaoPiso,
  outras: CargoSalarioLinha[] | null | undefined,
): ValidacaoEdicaoPiso {
  if ((edicao.justificativa ?? "").trim().length < JUSTIFICATIVA_MIN) {
    return {
      ok: false,
      campo: "justificativa",
      mensagem: `Descreva o motivo da alteração com pelo menos ${JUSTIFICATIVA_MIN} caracteres.`,
    };
  }
  if (!edicao.salario_base || edicao.salario_base <= 0) {
    return { ok: false, campo: "salario_base", mensagem: "Informe um salário maior que zero." };
  }
  if (!edicao.vigencia_inicio) {
    return { ok: false, campo: "vigencia_inicio", mensagem: "Informe a data base (início da vigência)." };
  }
  if (edicao.vigencia_fim && edicao.vigencia_fim < edicao.vigencia_inicio) {
    return { ok: false, campo: "vigencia_fim", mensagem: "O fim da vigência não pode ser anterior ao início." };
  }
  if (!edicao.unidade_id && !edicao.sindicato_patronal_id) {
    return { ok: false, campo: "escopo", mensagem: "Escolha o sindicato patronal ou a unidade do valor." };
  }

  const demais = (outras ?? []).filter((p) => p.id && p.id !== edicao.id);

  const conflito = demais.find((p) => mesmoEscopo(p, edicao) && vigenciasSobrepostas(p, edicao));
  if (conflito) {
    return {
      ok: false,
      campo: "vigencia_inicio",
      mensagem: "Já existe outro valor deste escopo vigente no período informado. Ajuste as datas.",
    };
  }

  // Ajuste de unidade nunca abaixo do piso do patronal na data base.
  if (edicao.unidade_id) {
    const piso = pisoDoPatronal(demais, edicao.sindicato_patronal_id, edicao.vigencia_inicio, {
      aceitarFuturo: true,
    });
    const check = validarOverrideUnidade(edicao.salario_base, piso ? Number(piso.salario_base) : null);
    if (check.ok === false && check.motivo === "abaixo_do_piso") {
      return {
        ok: false,
        campo: "salario_base",
        mensagem: `O valor não pode ficar abaixo do piso do patronal (${moedaBR(check.piso)}).`,
      };
    }
  }
  return { ok: true };
}

/** Descreve o que mudou entre o valor antigo e o novo (para o log e a UI). */
export function diffPiso(
  antes: CargoSalarioLinha,
  depois: { salario_base: number; vigencia_inicio: string; vigencia_fim?: string | null; observacao?: string | null },
): string[] {
  const out: string[] = [];
  if (Number(antes.salario_base) !== Number(depois.salario_base)) {
    out.push(`valor ${moedaBR(Number(antes.salario_base))} → ${moedaBR(Number(depois.salario_base))}`);
  }
  if (antes.vigencia_inicio !== depois.vigencia_inicio) {
    out.push(`data base ${antes.vigencia_inicio} → ${depois.vigencia_inicio}`);
  }
  if ((antes.vigencia_fim ?? null) !== (depois.vigencia_fim ?? null)) {
    out.push(`fim ${antes.vigencia_fim ?? "em aberto"} → ${depois.vigencia_fim ?? "em aberto"}`);
  }
  if ((antes.observacao ?? "") !== (depois.observacao ?? "")) out.push("observação");
  return out;
}
