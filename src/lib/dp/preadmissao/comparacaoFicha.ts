/**
 * Comparação entre a ficha oficial lida (importação) e os dados JÁ CONFERIDOS
 * na pré-admissão (staging revisado pelo gestor).
 *
 * Regra do fluxo: o que o gestor conferiu na pré-admissão é a referência. A
 * ficha devolvida pela contabilidade só substitui um campo quando o gestor
 * escolhe isso explicitamente, campo por campo. Nada é sobrescrito em silêncio
 * e nenhum cadastro é criado antes da conferência.
 */

/** Campo comparável: chave no staging, chave/caminho na ficha lida. */
export interface CampoComparavel {
  campo: string;
  rotulo: string;
  /** Caminho na ficha lida: ["nome"] ou ["endereco", "logradouro"]. */
  ficha: string[];
  /** Caminho no staging da pré-admissão. */
  staging: string[];
}

export const CAMPOS_COMPARAVEIS: CampoComparavel[] = [
  { campo: "nome", rotulo: "Nome", ficha: ["nome"], staging: ["nome"] },
  { campo: "cpf", rotulo: "CPF", ficha: ["cpf"], staging: ["cpf"] },
  { campo: "data_nascimento", rotulo: "Nascimento", ficha: ["data_nascimento"], staging: ["data_nascimento"] },
  { campo: "nome_mae", rotulo: "Nome da mãe", ficha: ["nome_mae"], staging: ["nome_mae"] },
  { campo: "nome_pai", rotulo: "Nome do pai", ficha: ["nome_pai"], staging: ["nome_pai"] },
  { campo: "telefone", rotulo: "Telefone", ficha: ["telefone"], staging: ["telefone"] },
  { campo: "rg_numero", rotulo: "RG", ficha: ["rg_numero"], staging: ["rg_numero"] },
  { campo: "ctps_numero", rotulo: "CTPS", ficha: ["ctps_numero"], staging: ["ctps_numero"] },
  { campo: "pis", rotulo: "PIS", ficha: ["pis_nit"], staging: ["pis"] },
  { campo: "titulo_eleitor", rotulo: "Título de eleitor", ficha: ["titulo_eleitor"], staging: ["titulo_eleitor"] },
  { campo: "estado_civil", rotulo: "Estado civil", ficha: ["estado_civil"], staging: ["estado_civil"] },
  { campo: "sexo", rotulo: "Sexo", ficha: ["sexo"], staging: ["sexo"] },
  { campo: "cep", rotulo: "CEP", ficha: ["endereco", "cep"], staging: ["cep"] },
  { campo: "logradouro", rotulo: "Endereço", ficha: ["endereco", "logradouro"], staging: ["endereco"] },
  { campo: "numero", rotulo: "Número", ficha: ["endereco", "numero"], staging: ["numero"] },
  { campo: "bairro", rotulo: "Bairro", ficha: ["endereco", "bairro"], staging: ["bairro"] },
  { campo: "cidade", rotulo: "Cidade", ficha: ["endereco", "cidade"], staging: ["cidade"] },
  { campo: "uf", rotulo: "UF", ficha: ["endereco", "uf"], staging: ["uf"] },
];

type Objeto = Record<string, unknown>;

function ler(origem: Objeto | null | undefined, caminho: string[]): string {
  let atual: unknown = origem ?? {};
  for (const parte of caminho) {
    if (!atual || typeof atual !== "object") return "";
    atual = (atual as Objeto)[parte];
  }
  if (atual === null || atual === undefined) return "";
  return String(atual).trim();
}

/** Comparação tolerante: ignora acentos, caixa, pontuação e espaços extras. */
export function equivalente(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  return norm(a) === norm(b);
}

export interface Divergencia extends CampoComparavel {
  /** Valor conferido na pré-admissão. */
  valorConferido: string;
  /** Valor lido na ficha oficial. */
  valorFicha: string;
}

/**
 * Campos em que a ficha lida discorda do que foi conferido. Campo vazio em um
 * dos lados não é divergência: nada a escolher, o valor preenchido é usado.
 */
export function divergenciasFicha(staging: Objeto | null, ficha: Objeto | null): Divergencia[] {
  const out: Divergencia[] = [];
  for (const c of CAMPOS_COMPARAVEIS) {
    const conferido = ler(staging, c.staging);
    const lido = ler(ficha, c.ficha);
    if (!conferido || !lido) continue;
    if (equivalente(conferido, lido)) continue;
    out.push({ ...c, valorConferido: conferido, valorFicha: lido });
  }
  return out;
}

/** Escolha por campo: "conferido" mantém a pré-admissão, "ficha" usa a ficha. */
export type EscolhaDivergencia = "conferido" | "ficha";

/**
 * Monta os dados que vão para o cadastro.
 *
 * Parte da ficha lida (que traz o que a contabilidade registrou) e, para cada
 * divergência, aplica a escolha do gestor. Sem escolha, mantém o conferido.
 * `somenteAnexar` mantém TODOS os valores conferidos, sem alterar campo algum.
 */
export function dadosParaCadastro(
  staging: Objeto | null,
  ficha: Objeto,
  escolhas: Record<string, EscolhaDivergencia>,
  somenteAnexar = false,
): Objeto {
  const out: Objeto = { ...ficha };
  const escrever = (caminho: string[], valor: string) => {
    if (caminho.length === 1) {
      out[caminho[0]] = valor;
      return;
    }
    const [raiz, folha] = caminho;
    out[raiz] = { ...((out[raiz] ?? {}) as Objeto), [folha]: valor };
  };
  for (const c of CAMPOS_COMPARAVEIS) {
    const conferido = ler(staging, c.staging);
    if (!conferido) continue;
    const lido = ler(ficha, c.ficha);
    if (somenteAnexar) {
      escrever(c.ficha, conferido);
      continue;
    }
    if (!lido || equivalente(conferido, lido)) {
      if (!lido) escrever(c.ficha, conferido);
      continue;
    }
    if (escolhas[c.campo] !== "ficha") escrever(c.ficha, conferido);
  }
  // Dados pessoais que o candidato preencheu e a ficha da contabilidade não
  // traz (e-mail, escolaridade, nacionalidade e afins) não podem se perder.
  for (const [chave, valor] of Object.entries(staging ?? {})) {
    if (CHAVES_STAGING_MAPEADAS.has(chave) || CHAVES_STAGING_IGNORADAS.has(chave)) continue;
    if (valor === null || valor === undefined) continue;
    if (typeof valor === "object") continue;
    const texto = String(valor).trim();
    if (!texto) continue;
    const atual = out[chave];
    const jaTem = atual !== null && atual !== undefined && String(atual).trim() !== "";
    if (!jaTem) out[chave] = texto;
  }
  return out;
}

/** Chaves do staging já tratadas pela comparação campo a campo. */
const CHAVES_STAGING_MAPEADAS = new Set(CAMPOS_COMPARAVEIS.map((c) => c.staging[0]));

/** Chaves do staging que nunca vão para o cadastro por este caminho. */
const CHAVES_STAGING_IGNORADAS = new Set([
  "id", "company_id", "status", "versao", "pessoas", "documentos",
  "admin_dados", "dados", "created_at", "updated_at",
]);

/** Divergências ainda sem decisão explícita do gestor. */
export function divergenciasSemEscolha(
  divergencias: Divergencia[],
  escolhas: Record<string, EscolhaDivergencia>,
): Divergencia[] {
  return divergencias.filter((d) => !escolhas[d.campo]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Informações administrativas: vínculo, cargo, unidade, setor, salário, jornada
// ─────────────────────────────────────────────────────────────────────────────

/** Nomes canônicos já resolvidos pelo cadastro da empresa. */
export interface NomesCanonicos {
  cargo?: string | null;
  unidade?: string | null;
  setor?: string | null;
  regime?: string | null;
  forma_pagamento?: string | null;
}

export interface DivergenciaAdmin {
  campo: string;
  rotulo: string;
  valorConferido: string;
  valorFicha: string;
}

/** Campos administrativos comparados: conferido (pré-admissão) × ficha lida. */
export const CAMPOS_ADMIN_COMPARAVEIS: Array<{ campo: string; rotulo: string; ficha: string[] }> = [
  { campo: "data_admissao", rotulo: "Data de admissão", ficha: ["data_admissao"] },
  { campo: "salario", rotulo: "Salário", ficha: ["salario_base"] },
  { campo: "cargo", rotulo: "Cargo", ficha: ["cargo"] },
  { campo: "unidade", rotulo: "Unidade", ficha: ["unidade"] },
  { campo: "setor", rotulo: "Setor", ficha: ["setor"] },
  { campo: "regime_trabalho", rotulo: "Vínculo", ficha: ["regime"] },
  { campo: "forma_pagamento", rotulo: "Forma de pagamento", ficha: ["forma_pagamento"] },
  { campo: "jornada_descricao", rotulo: "Jornada prevista", ficha: ["jornada"] },
];

/** Valor conferido de cada campo administrativo, já em texto de tela. */
export function valorAdminConferido(
  campo: string,
  adminDados: Objeto | null,
  nomes: NomesCanonicos,
): string {
  const a = adminDados ?? {};
  if (campo === "cargo") return String(nomes.cargo ?? "").trim();
  if (campo === "unidade") return String(nomes.unidade ?? "").trim();
  if (campo === "setor") return String(nomes.setor ?? "").trim();
  if (campo === "regime_trabalho") return String(nomes.regime ?? a.regime_trabalho ?? "").trim();
  if (campo === "forma_pagamento") return String(nomes.forma_pagamento ?? a.forma_pagamento ?? "").trim();
  const v = a[campo];
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * Divergências administrativas entre o que o gestor preencheu na pré-admissão e
 * o que veio na ficha da contabilidade. Campo vazio em um dos lados não conta.
 */
export function divergenciasAdmin(
  adminDados: Objeto | null,
  ficha: Objeto | null,
  nomes: NomesCanonicos,
): DivergenciaAdmin[] {
  const out: DivergenciaAdmin[] = [];
  for (const c of CAMPOS_ADMIN_COMPARAVEIS) {
    const conferido = valorAdminConferido(c.campo, adminDados, nomes);
    const lido = ler(ficha, c.ficha);
    if (!conferido || !lido) continue;
    if (equivalente(conferido, lido)) continue;
    out.push({ campo: `admin.${c.campo}`, rotulo: c.rotulo, valorConferido: conferido, valorFicha: lido });
  }
  return out;
}

/** Divergências administrativas ainda sem decisão do gestor. */
export function divergenciasAdminSemEscolha(
  divergencias: DivergenciaAdmin[],
  escolhas: Record<string, EscolhaDivergencia>,
): DivergenciaAdmin[] {
  return divergencias.filter((d) => !escolhas[d.campo]);
}

/** Busca um cadastro canônico pelo nome lido na ficha (comparação tolerante). */
export function resolverPorNome<T extends { id: string; nome: string }>(
  lista: T[],
  nome: string,
): T | null {
  const alvo = String(nome ?? "").trim();
  if (!alvo) return null;
  return lista.find((i) => equivalente(i.nome, alvo)) ?? null;
}
