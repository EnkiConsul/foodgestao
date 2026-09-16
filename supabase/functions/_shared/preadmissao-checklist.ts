/**
 * FONTE ÚNICA das regras documentais da Pré-Admissão.
 *
 * Vive aqui (e não no frontend) porque o servidor é quem decide se a ficha pode
 * ser enviada e se está pronta para a contabilidade. A tela do candidato e a
 * tela de revisão do gestor recebem o checklist já resolvido por este módulo,
 * então nunca existem duas versões da regra.
 *
 * Este arquivo é TypeScript puro, sem dependência de Deno, e é coberto por
 * testes em `src/test/unit/preadmissaoChecklist.test.ts`.
 */

export type GrupoChecklist = "candidato" | "condicional" | "dependente" | "sesc";

export interface PessoaRelacionada {
  id: string;
  nome: string;
  data_nascimento?: string | null;
  parentesco?: string | null;
  finalidade_dependente?: boolean | null;
  finalidade_sesc?: boolean | null;
}

export interface FichaContexto {
  data_nascimento?: string | null;
  estado_civil?: string | null;
  sexo?: string | null;
}

export interface ItemChecklist {
  /** Chave estável: código do documento + pessoa, quando houver. */
  key: string;
  codigo: string;
  titulo: string;
  instrucao?: string;
  grupo: GrupoChecklist;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  obrigatorio: boolean;
}

export const DOCUMENTOS: Record<string, { titulo: string; instrucao?: string }> = {
  identidade: {
    titulo: "Identidade com CPF ou CNH",
    instrucao: "Envie o RG com CPF ou a CNH. Um dos dois já atende.",
  },
  ctps: {
    titulo: "Carteira de Trabalho (digital ou física)",
    instrucao: "Pode ser a foto da carteira física ou o PDF da carteira digital.",
  },
  foto_3x4: {
    titulo: "Foto estilo 3x4",
    instrucao: "Envie uma foto recente, de frente, com boa iluminação e o rosto visível.",
  },
  titulo_eleitor: { titulo: "Título de eleitor" },
  cns_sus: { titulo: "Cartão Nacional de Saúde (SUS)" },
  comprovante_endereco: {
    titulo: "Comprovante de endereço",
    instrucao: "Conta de luz, água ou internet dos últimos meses.",
  },
  certidao_nascimento: { titulo: "Certidão de nascimento" },
  certidao_estado_civil: {
    titulo: "Certidão de casamento ou averbação",
    instrucao: "Envie a certidão correspondente ao seu estado civil.",
  },
  reservista: { titulo: "Certificado de reservista" },
  licenciamento_veiculo: {
    titulo: "Último licenciamento do veículo",
    instrucao: "CRLV do ano vigente da motocicleta ou do veículo utilizado.",
  },
  dep_rg: { titulo: "RG" },
  dep_cpf: { titulo: "CPF" },
  dep_vacina: { titulo: "Cartão de vacina" },
  dep_declaracao_escolar: { titulo: "Declaração escolar" },
  sesc_rg: { titulo: "RG (Sesc)" },
  sesc_cpf: { titulo: "CPF (Sesc)" },
  sesc_foto: {
    titulo: "Foto estilo 3x4 (Sesc)",
    instrucao: "Foto recente, de frente, com o rosto visível.",
  },
};

/** Documentos gerais do checklist operacional da empresa. */
const GERAIS = ["identidade", "ctps", "foto_3x4", "titulo_eleitor", "cns_sus", "comprovante_endereco"];

export function idadeEmAnos(nascimento?: string | null, hoje = new Date()): number | null {
  if (!nascimento) return null;
  const d = new Date(`${String(nascimento).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  let anos = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos--;
  return anos;
}

function normaliza(v?: string | null): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const SOLTEIRO = ["solteiro", "solteira"];
const COM_CERTIDAO = ["casado", "casada", "uniao estavel", "divorciado", "divorciada", "viuvo", "viuva", "separado", "separada"];

function item(
  codigo: string,
  grupo: GrupoChecklist,
  pessoa?: PessoaRelacionada | null,
  obrigatorio = true,
): ItemChecklist {
  const def = DOCUMENTOS[codigo] ?? { titulo: codigo };
  return {
    key: `${codigo}:${pessoa?.id ?? ""}`,
    codigo,
    titulo: def.titulo,
    instrucao: def.instrucao,
    grupo,
    pessoa_id: pessoa?.id ?? null,
    pessoa_nome: pessoa?.nome ?? null,
    obrigatorio,
  };
}

export interface ChecklistInput {
  ficha: FichaContexto;
  pessoas?: PessoaRelacionada[];
  /** Códigos exigidos pelo Cargo Previsto (vínculo requisito × cargo). */
  requisitosCargo?: string[];
  /** Códigos exigidos pela Unidade Prevista (vínculo requisito × unidade). */
  requisitosUnidade?: string[];
  hoje?: Date;
}

/**
 * Checklist completo: gerais + cargo + unidade + condicionais da pessoa +
 * dependentes + familiares do Sesc. As faixas de idade abaixo valem SOMENTE
 * neste fluxo (o checklist legado do colaborador continua com suas próprias
 * faixas em `src/lib/dp/documentos-requisitos.ts`).
 */
export function montarChecklist({
  ficha,
  pessoas = [],
  requisitosCargo = [],
  requisitosUnidade = [],
  hoje = new Date(),
}: ChecklistInput): ItemChecklist[] {
  const itens: ItemChecklist[] = GERAIS.map((c) => item(c, "candidato"));

  // Requisitos vindos do Cargo/Unidade canônicos — nunca pelo nome do cargo.
  for (const codigo of [...new Set([...requisitosCargo, ...requisitosUnidade])]) {
    itens.push(item(codigo, "condicional"));
  }

  const estado = normaliza(ficha.estado_civil);
  if (SOLTEIRO.includes(estado)) itens.push(item("certidao_nascimento", "condicional"));
  else if (COM_CERTIDAO.some((e) => estado.startsWith(e))) itens.push(item("certidao_estado_civil", "condicional"));

  const idade = idadeEmAnos(ficha.data_nascimento, hoje);
  if (normaliza(ficha.sexo).startsWith("m") && idade !== null && idade >= 18) {
    itens.push(item("reservista", "condicional"));
  }

  for (const p of pessoas) {
    const id = idadeEmAnos(p.data_nascimento, hoje);
    if (p.finalidade_dependente) {
      if (id !== null && id <= 14) {
        itens.push(item("dep_rg", "dependente", p));
        itens.push(item("dep_cpf", "dependente", p));
      }
      if (id !== null && id <= 5) itens.push(item("dep_vacina", "dependente", p));
      if (id !== null && id >= 6 && id <= 14) itens.push(item("dep_declaracao_escolar", "dependente", p));
    }
    if (p.finalidade_sesc) {
      itens.push(item("sesc_rg", "sesc", p));
      itens.push(item("sesc_cpf", "sesc", p));
      itens.push(item("sesc_foto", "sesc", p));
    }
  }

  // Sem duplicar item igual para o mesmo titular.
  const vistos = new Set<string>();
  return itens.filter((i) => (vistos.has(i.key) ? false : (vistos.add(i.key), true)));
}

export type SituacaoBloqueio = "ok" | "bloqueado" | "pendente";

export interface Bloqueio {
  situacao: SituacaoBloqueio;
  titulo: string;
  mensagem: string;
}

/**
 * Menor de 18 anos + trabalho previsto após as 22h = bloqueio trabalhista.
 * Não existe caminho de "continuar mesmo assim": o gestor precisa revisar a
 * condição de trabalho. Sem data de nascimento a situação é PENDENTE, nunca
 * regular.
 */
export function bloqueioMenorNoturno(
  input: { data_nascimento?: string | null; trabalho_apos_22h?: boolean | null },
  hoje = new Date(),
): Bloqueio {
  if (!input.trabalho_apos_22h) {
    return { situacao: "ok", titulo: "Sem trabalho após as 22h", mensagem: "" };
  }
  const idade = idadeEmAnos(input.data_nascimento, hoje);
  if (idade === null) {
    return {
      situacao: "pendente",
      titulo: "Validação de Idade Pendente",
      mensagem:
        "Esta pré-admissão prevê trabalho após as 22h e ainda não há data de nascimento informada. "
        + "A condição não pode ser considerada regular.",
    };
  }
  if (idade < 18) {
    return {
      situacao: "bloqueado",
      titulo: "Trabalho Noturno Não Permitido para Menor de 18 Anos",
      mensagem:
        "O candidato possui menos de 18 anos e esta Pré-Admissão prevê trabalho após as 22h. "
        + "Revise a condição de trabalho antes de continuar.",
    };
  }
  return { situacao: "ok", titulo: "Condição regular", mensagem: "" };
}

/** Itens obrigatórios ainda sem arquivo enviado. */
export function pendenciasDocumentais(
  itens: ItemChecklist[],
  enviados: { requisito_codigo: string; pessoa_id?: string | null }[],
): ItemChecklist[] {
  const chaves = new Set(enviados.map((e) => `${e.requisito_codigo}:${e.pessoa_id ?? ""}`));
  return itens.filter((i) => i.obrigatorio && !chaves.has(i.key));
}
