/**
 * Conversão dos dados lidos na ficha de registro para as colunas do cadastro
 * do colaborador. Fica em módulo puro porque a mesma conversão é usada tanto
 * para gravar quanto para comparar com o cadastro já existente.
 */

import { montarEndereco } from "./endereco-parse";

export const txt = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

export const digits = (v: unknown): string => String(v ?? "").replace(/\D+/g, "");

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function dataIso(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

export function sexoNorm(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.startsWith("m")) return "M";
  if (s.startsWith("f")) return "F";
  return null;
}

/** Colunas do cadastro alimentadas pela ficha, com o rótulo usado na comparação. */
export const CAMPOS_FICHA: Array<{ coluna: string; label: string }> = [
  { coluna: "nome", label: "Nome" },
  { coluna: "cpf", label: "CPF" },
  { coluna: "matricula", label: "Matrícula" },
  { coluna: "data_nascimento", label: "Nascimento" },
  { coluna: "data_admissao", label: "Admissão" },
  { coluna: "sexo", label: "Gênero" },
  { coluna: "telefone", label: "Telefone" },
  { coluna: "whatsapp", label: "WhatsApp" },
  { coluna: "email_contato", label: "E-mail" },
  { coluna: "estado_civil", label: "Estado civil" },

  { coluna: "cargo", label: "Cargo (texto da ficha)" },
  { coluna: "salario_base", label: "Salário" },
  { coluna: "rg_numero", label: "RG" },
  { coluna: "rg_orgao", label: "Órgão do RG" },
  { coluna: "rg_uf", label: "UF do RG" },
  { coluna: "rg_emissao", label: "Emissão do RG" },
  { coluna: "ctps_numero", label: "CTPS" },
  { coluna: "ctps_serie", label: "Série da CTPS" },
  { coluna: "ctps_uf", label: "UF da CTPS" },
  { coluna: "ctps_expedicao", label: "Expedição da CTPS" },
  { coluna: "titulo_eleitor", label: "Título de eleitor" },
  { coluna: "titulo_zona", label: "Zona" },
  { coluna: "titulo_secao", label: "Seção" },
  { coluna: "reservista", label: "Reservista" },
  { coluna: "reservista_categoria", label: "Categoria da reservista" },
  { coluna: "nome_pai", label: "Nome do pai" },
  { coluna: "nome_mae", label: "Nome da mãe" },
  { coluna: "nacionalidade", label: "Nacionalidade" },
  { coluna: "naturalidade", label: "Naturalidade" },
  { coluna: "raca_cor", label: "Raça/cor" },
  { coluna: "grau_instrucao", label: "Grau de instrução" },
  { coluna: "deficiencia", label: "Deficiência" },
];

/** Monta o conjunto de colunas do cadastro a partir dos dados revisados da ficha. */
export function montarPayloadFicha(dados: Record<string, unknown>): Record<string, unknown> {
  return {
    nome: txt(dados.nome),
    cpf: digits(dados.cpf) || null,
    matricula: txt(dados.matricula),
    data_nascimento: dataIso(dados.data_nascimento),
    data_admissao: dataIso(dados.data_admissao),
    sexo: sexoNorm(dados.sexo),
    telefone: txt(dados.telefone),
    email_contato: txt(dados.email),
    endereco: montarEndereco((dados.endereco ?? {}) as Record<string, unknown>),
    cargo: txt(dados.cargo_nome),
    salario_base: num(dados.salario),
    rg_numero: txt(dados.rg_numero),
    rg_orgao: txt(dados.rg_orgao),
    rg_uf: txt(dados.rg_uf),
    rg_emissao: dataIso(dados.rg_emissao),
    ctps_numero: txt(dados.ctps_numero),
    ctps_serie: txt(dados.ctps_serie),
    ctps_uf: txt(dados.ctps_uf),
    ctps_expedicao: dataIso(dados.ctps_expedicao),
    titulo_eleitor: txt(dados.titulo_eleitor),
    titulo_zona: txt(dados.titulo_zona),
    titulo_secao: txt(dados.titulo_secao),
    reservista: txt(dados.reservista),
    reservista_categoria: txt(dados.reservista_categoria),
    nome_pai: txt(dados.nome_pai),
    nome_mae: txt(dados.nome_mae),
    nacionalidade: txt(dados.nacionalidade),
    naturalidade: txt(dados.naturalidade),
    raca_cor: txt(dados.raca_cor),
    grau_instrucao: txt(dados.grau_instrucao),
    deficiencia: txt(dados.deficiencia),
  };
}

export interface DiferencaFicha {
  coluna: string;
  label: string;
  atual: string;
  novo: string;
  /** true quando o cadastro está vazio e a ficha traz informação. */
  apenasCompleta: boolean;
}

const mostrar = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
};

/**
 * Diferenças entre o cadastro atual e a ficha lida. Só entram colunas em que a
 * ficha trouxe algum valor — o que a ficha não traz nunca apaga o cadastro.
 */
export function compararComCadastro(
  dados: Record<string, unknown>,
  atual: Record<string, unknown> | null,
): DiferencaFicha[] {
  const novo = montarPayloadFicha(dados);
  const base = atual ?? {};
  const out: DiferencaFicha[] = [];
  for (const { coluna, label } of CAMPOS_FICHA) {
    const valorNovo = novo[coluna];
    if (valorNovo === null || valorNovo === undefined || valorNovo === "") continue;
    const valorAtual = base[coluna];
    if (mostrar(valorAtual) === mostrar(valorNovo)) continue;
    out.push({
      coluna,
      label,
      atual: mostrar(valorAtual),
      novo: mostrar(valorNovo),
      apenasCompleta: mostrar(valorAtual) === "",
    });
  }
  return out;
}
