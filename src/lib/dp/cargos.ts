// ------------------------------------------------------------------
// Domínio: DP → Cargos e salário de referência.
// Regra do produto: um cargo = um salário. O cadastro do colaborador é a
// porta de entrada; o cargo é criado/completado a partir dele.
// ------------------------------------------------------------------

export interface CargoRef {
  id: string;
  nome: string;
  salario_base?: number | null;
  ativo?: boolean;
}

export type ComparacaoCargo =
  | { status: "ok" }
  | { status: "sem_salario_informado" }
  | { status: "cargo_sem_salario"; salarioInformado: number }
  | { status: "divergente"; salarioCargo: number; salarioInformado: number };

/** Tolerância de centavos para comparar valores monetários. */
const TOL = 0.005;

/** Salário de referência do cargo (null quando ainda não foi definido). */
export function salarioReferencia(cargo: CargoRef | null | undefined): number | null {
  const v = cargo?.salario_base;
  return v == null || Number.isNaN(Number(v)) ? null : Number(v);
}

/**
 * Compara o salário informado no colaborador com o salário de referência do cargo.
 * `salarioInformado` deve ser a base salarial (mensal), não o valor da hora.
 */
export function compararSalarioCargo(
  cargo: CargoRef | null | undefined,
  salarioInformado: number | null | undefined,
): ComparacaoCargo {
  const informado = salarioInformado == null ? 0 : Number(salarioInformado);
  if (!informado || informado <= 0) return { status: "sem_salario_informado" };

  const referencia = salarioReferencia(cargo);
  if (referencia == null || referencia <= 0) {
    return { status: "cargo_sem_salario", salarioInformado: informado };
  }
  if (Math.abs(referencia - informado) <= TOL) return { status: "ok" };
  return { status: "divergente", salarioCargo: referencia, salarioInformado: informado };
}

const ROMANOS = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** Remove um sufixo romano do fim do nome ("ATENDENTE III" → "ATENDENTE"). */
function nomeRaiz(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const ultima = partes[partes.length - 1]?.toUpperCase();
  if (partes.length > 1 && ultima && ROMANOS.includes(ultima)) {
    return partes.slice(0, -1).join(" ");
  }
  return partes.join(" ");
}

const norm = (v: string) => v.trim().toLowerCase();

/**
 * Sugere o nome de uma variação do cargo que ainda não exista:
 * "ATENDENTE" → "ATENDENTE II" → "ATENDENTE III" ...
 */
export function sugerirNomeVariacao(nome: string, existentes: { nome: string }[]): string {
  const raiz = nomeRaiz(nome || "").trim();
  if (!raiz) return "";
  const usados = new Set(existentes.map((c) => norm(c.nome)));
  for (const sufixo of ROMANOS) {
    const candidato = `${raiz} ${sufixo}`;
    if (!usados.has(norm(candidato))) return candidato;
  }
  return `${raiz} ${existentes.length + 1}`;
}

/** Formata em reais para as mensagens de conflito. */
export function moedaBR(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
