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
  return out;
}

/** Divergências ainda sem decisão explícita do gestor. */
export function divergenciasSemEscolha(
  divergencias: Divergencia[],
  escolhas: Record<string, EscolhaDivergencia>,
): Divergencia[] {
  return divergencias.filter((d) => !escolhas[d.campo]);
}
