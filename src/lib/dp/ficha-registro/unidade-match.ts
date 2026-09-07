/**
 * Correspondência entre o empregador escrito na ficha de registro e a empresa /
 * unidades já cadastradas.
 *
 * Serve a dois objetivos:
 * 1. Pré-selecionar a unidade certa quando o CNPJ da ficha é de uma unidade cadastrada.
 * 2. Avisar quando a ficha parece ser de outra empresa (CNPJ não confere com nada).
 */

export type UnidadeCadastrada = { id: string; nome: string; cnpj?: string | null };

export type EmpresaConfere = "sim" | "nao" | "indefinido";

export type UnidadeMatch = {
  unidade_id: string | null;
  motivo: "cnpj" | "nome" | null;
  cnpj_lido: string | null;
  empregador_lido: string | null;
  empresaConfere: EmpresaConfere;
};

export function digitsCnpj(value: unknown): string {
  return String(value ?? "").replace(/\D+/g, "");
}

export function formatCnpj(value: unknown): string {
  const d = digitsCnpj(value);
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return String(value ?? "");
}

function normalizeNome(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b(LTDA|ME|EPP|EIRELI|S\/?A|SA|COMERCIO|RESTAURANTE|MATRIZ|FILIAL)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Raiz do CNPJ (8 primeiros dígitos) — mesma empresa, filial diferente. */
function raiz(cnpj: string): string {
  return cnpj.length === 14 ? cnpj.slice(0, 8) : "";
}

export function matchUnidade(
  dados: Record<string, unknown> | null | undefined,
  unidades: UnidadeCadastrada[],
  companyCnpj?: string | null,
): UnidadeMatch {
  const lido = digitsCnpj((dados ?? {}).empregador_cnpj);
  const empregadorNome = (dados ?? {}).empregador_nome ? String((dados ?? {}).empregador_nome) : null;
  const cnpjLido = lido.length >= 11 ? lido : null;

  const base: UnidadeMatch = {
    unidade_id: null,
    motivo: null,
    cnpj_lido: cnpjLido,
    empregador_lido: empregadorNome,
    empresaConfere: "indefinido",
  };

  const ativos = unidades ?? [];

  // 1. CNPJ exato de uma unidade
  if (cnpjLido) {
    const porCnpj = ativos.find((u) => digitsCnpj(u.cnpj) && digitsCnpj(u.cnpj) === cnpjLido);
    if (porCnpj) return { ...base, unidade_id: porCnpj.id, motivo: "cnpj", empresaConfere: "sim" };
  }

  // 2. Confere se ao menos a empresa (raiz do CNPJ) é a mesma
  const empresaDigits = digitsCnpj(companyCnpj);
  const raizes = new Set(
    [empresaDigits, ...ativos.map((u) => digitsCnpj(u.cnpj))].map(raiz).filter(Boolean),
  );
  const mesmaEmpresa = cnpjLido ? raizes.has(raiz(cnpjLido)) || empresaDigits === cnpjLido : false;

  // 3. Nome da unidade citado no empregador da ficha
  let porNome: UnidadeCadastrada | undefined;
  if (empregadorNome) {
    const alvo = normalizeNome(empregadorNome);
    porNome = ativos.find((u) => {
      const n = normalizeNome(u.nome);
      return n.length >= 3 && (alvo.includes(n) || n.includes(alvo));
    });
  }

  if (!cnpjLido) {
    return porNome
      ? { ...base, unidade_id: porNome.id, motivo: "nome", empresaConfere: "indefinido" }
      : base;
  }

  if (mesmaEmpresa) {
    return porNome
      ? { ...base, unidade_id: porNome.id, motivo: "nome", empresaConfere: "sim" }
      : { ...base, empresaConfere: "sim" };
  }

  // CNPJ lido não bate com a empresa nem com nenhuma unidade: possivelmente outra empresa.
  // Se nenhuma unidade tem CNPJ cadastrado e a empresa também não, não há como afirmar.
  const temAlgumCnpj = !!empresaDigits || ativos.some((u) => digitsCnpj(u.cnpj));
  if (!temAlgumCnpj) {
    return porNome
      ? { ...base, unidade_id: porNome.id, motivo: "nome", empresaConfere: "indefinido" }
      : base;
  }

  return { ...base, empresaConfere: "nao" };
}
