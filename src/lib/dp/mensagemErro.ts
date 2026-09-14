/**
 * Texto amigável para estados de erro de consulta do módulo Pessoas.
 *
 * Regra da casa: o usuário nunca vê texto técnico do servidor, mas também
 * nunca vê "nenhum registro" quando na verdade houve falha ou falta de
 * permissão. Este helper devolve a frase que acompanha o `DpErrorState`.
 */

const PERMISSAO = [
  "permission denied",
  "row-level security",
  "row level security",
  "not authorized",
  "nao autorizado",
  "não autorizado",
  "sem permissao",
  "sem permissão",
  "forbidden",
];

const REDE = [
  "failed to fetch",
  "network",
  "networkerror",
  "load failed",
  "timeout",
  "econnreset",
];

function textoBruto(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  const e = error as { message?: unknown; code?: unknown; details?: unknown };
  return [e.message, e.details, e.code]
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();
}

/** Tipo da falha, útil para decidir se oferecemos "tentar novamente". */
export function tipoErro(error: unknown): "permissao" | "rede" | "desconhecido" {
  const bruto = textoBruto(error);
  const codigo = (error as { code?: unknown } | null)?.code;
  if (codigo === "42501" || codigo === "PGRST301" || PERMISSAO.some((p) => bruto.includes(p))) {
    return "permissao";
  }
  if (REDE.some((p) => bruto.includes(p))) return "rede";
  return "desconhecido";
}

export function mensagemErro(error: unknown): string {
  switch (tipoErro(error)) {
    case "permissao":
      return "Você não tem permissão para ver estas informações. Fale com o responsável da empresa.";
    case "rede":
      return "Não conseguimos falar com o servidor. Verifique sua conexão e tente novamente.";
    default:
      return "Houve uma falha ao buscar as informações. Tente novamente — se continuar, relate o problema.";
  }
}
