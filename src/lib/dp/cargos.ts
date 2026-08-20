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

// ------------------------------------------------------------------
// Apresentação dos adicionais de risco do cargo
// ------------------------------------------------------------------

export interface SeloRiscoCargo {
  tipo: "insalubridade" | "periculosidade" | "indefinido";
  label: string;
  percentual: number | null;
}

const pct = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Formata percentual sem casas desnecessárias ("30%", "12,5%"). */
function percentualBR(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/**
 * Selos de risco do cargo com base nos percentuais efetivamente gravados.
 * O switch "insalubre ou perigoso" sozinho não define o tipo do adicional.
 */
export function selosRiscoCargo(cargo: {
  insalubre_periculoso?: boolean | null;
  insalubridade_percentual?: number | null;
  periculosidade_percentual?: number | null;
} | null | undefined): SeloRiscoCargo[] {
  if (!cargo) return [];
  const insal = pct(cargo.insalubridade_percentual);
  const peric = pct(cargo.periculosidade_percentual);
  const out: SeloRiscoCargo[] = [];

  if (insal > 0) {
    out.push({ tipo: "insalubridade", label: `insalubridade ${percentualBR(insal)}`, percentual: insal });
  }
  if (peric > 0) {
    out.push({ tipo: "periculosidade", label: `periculosidade ${percentualBR(peric)}`, percentual: peric });
  }
  if (out.length === 0 && cargo.insalubre_periculoso) {
    out.push({ tipo: "indefinido", label: "risco a definir", percentual: null });
  }
  return out;
}

/** Texto do percentual para a ficha do cargo ("30%" ou "não aplicável"). */
export function textoPercentualRisco(valor: number | null | undefined): string {
  const v = pct(valor);
  return v > 0 ? percentualBR(v) : "não aplicável";
}


// ------------------------------------------------------------------
// Adicionais de risco: a ficha do colaborador e o cargo falam do mesmo campo.
// Insalubridade/periculosidade são característica da função, então quando o
// valor digitado na ficha difere do cargo vale perguntar se aquilo é regra do
// cargo (e propaga) ou exceção só daquela pessoa.
// ------------------------------------------------------------------

export interface RiscoPercentuais {
  insalubridade: number;
  periculosidade: number;
}

export type DivergenciaRisco =
  | { tipo: "igual" }
  | {
      /** A ficha tem risco maior que o cargo (inclusão/aumento). */
      tipo: "aumento";
      ficha: RiscoPercentuais;
      cargo: RiscoPercentuais;
    }
  | {
      /** A ficha zera ou reduz um risco que o cargo prevê. */
      tipo: "reducao";
      ficha: RiscoPercentuais;
      cargo: RiscoPercentuais;
    };

const mesmoPercentual = (a: number, b: number) => Math.abs(a - b) <= 0.001;

/** Compara os percentuais de risco da ficha com os do cargo. */
export function compararRiscoCargo(
  ficha: RiscoPercentuais,
  cargo: RiscoPercentuais | null | undefined,
): DivergenciaRisco {
  const doCargo: RiscoPercentuais = {
    insalubridade: Number(cargo?.insalubridade ?? 0) || 0,
    periculosidade: Number(cargo?.periculosidade ?? 0) || 0,
  };
  const naFicha: RiscoPercentuais = {
    insalubridade: Number(ficha.insalubridade ?? 0) || 0,
    periculosidade: Number(ficha.periculosidade ?? 0) || 0,
  };
  if (
    mesmoPercentual(naFicha.insalubridade, doCargo.insalubridade) &&
    mesmoPercentual(naFicha.periculosidade, doCargo.periculosidade)
  ) {
    return { tipo: "igual" };
  }
  const reduziu =
    naFicha.insalubridade < doCargo.insalubridade ||
    naFicha.periculosidade < doCargo.periculosidade;
  return { tipo: reduziu ? "reducao" : "aumento", ficha: naFicha, cargo: doCargo };
}

/** Texto curto dos percentuais, para o diálogo ("Periculosidade 30%"). */
export function textoRisco(r: RiscoPercentuais): string {
  const partes: string[] = [];
  if (r.insalubridade > 0) partes.push(`Insalubridade ${r.insalubridade}%`);
  if (r.periculosidade > 0) partes.push(`Periculosidade ${r.periculosidade}%`);
  return partes.length ? partes.join(" • ") : "Sem adicional de risco";
}
