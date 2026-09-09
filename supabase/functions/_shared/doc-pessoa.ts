/**
 * Extração da pessoa (nome + CPF) a partir do texto lido de uma página de
 * documento de DP. Espelhado em src/lib/dp/doc-pessoa.ts — qualquer mudança
 * de regra deve ser aplicada nos dois arquivos (teste de paridade cobre isso).
 */

const ROTULOS_PROIBIDOS = [
  "PIS", "PASEP", "NIT", "INSS", "MATRICULA", "MATRÍCULA", "CTPS", "RG",
  "CNPJ", "CEI", "CAEPF", "CONTA", "AGENCIA", "AGÊNCIA", "CODIGO", "CÓDIGO",
];

export function onlyDigits(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

export function isCpfValido(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/**
 * CPF só é aceito quando aparece junto ao rótulo "CPF" (ou emitido pela leitura
 * como CPF_PESSOA) E passa nos dígitos verificadores. Números rotulados como
 * PIS/NIT/matrícula INSS nunca são aceitos, mesmo tendo 11 dígitos.
 */
export function extrairCpfValido(ocr: string): string | null {
  const texto = ocr ?? "";

  const linhaIa = texto.match(/CPF_PESSOA:\s*([\d.\-\s]{11,20})/i);
  if (linhaIa && isCpfValido(linhaIa[1])) return onlyDigits(linhaIa[1]);

  const re = /CPF[^0-9A-Za-z]{0,20}(\d{3}\.?\s?\d{3}\.?\s?\d{3}\s?-?\s?\d{2})/gi;
  for (const m of texto.matchAll(re)) {
    const antes = texto.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0).toUpperCase();
    // Só rejeita quando o rótulo "CPF" vem colado a outro rótulo (ex.: "PIS/CPF").
    if (ROTULOS_PROIBIDOS.some((r) => new RegExp(`${r}\\s*[/-]\\s*$`).test(antes))) continue;
    if (isCpfValido(m[1])) return onlyDigits(m[1]);
  }
  return null;
}

const PALAVRAS_NAO_NOME = [
  "TOTAL", "LIQUIDO", "LÍQUIDO", "SALARIO", "SALÁRIO", "EMPRESA", "FOLHA",
  "RECIBO", "CONTRACHEQUE", "DEMONSTRATIVO", "COMPETENCIA", "COMPETÊNCIA",
  "CNPJ", "CPF", "ADMISSAO", "ADMISSÃO", "CARGO", "FUNCAO", "FUNÇÃO",
];

function limparNome(bruto: string): string | null {
  let nome = (bruto ?? "")
    .replace(/[\d.:;|_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (nome.length < 5) return null;
  const partes = nome.split(" ").filter(Boolean);
  if (partes.length < 2) return null;
  const upper = nome.toUpperCase();
  if (PALAVRAS_NAO_NOME.some((p) => upper.startsWith(p))) return null;
  if (!/^[A-Za-zÀ-ÿ' ]+$/.test(nome)) return null;
  nome = partes.slice(0, 8).join(" ");
  return nome;
}

/**
 * Nome da pessoa do documento. Prioriza a linha `PESSOA:` emitida pela leitura
 * e cai para rótulos usuais de folha/contracheque.
 */
export function extrairNomePessoa(ocr: string): string | null {
  const texto = ocr ?? "";

  const ia = texto.match(/PESSOA:\s*(.+)/i);
  if (ia) {
    const v = ia[1].trim();
    if (v && !/^DESCONHECID/i.test(v)) {
      const limpo = limparNome(v);
      if (limpo) return limpo;
    }
  }

  const rotulos = [
    /NOME\s+DO\s+(?:FUNCIONARIO|FUNCIONÁRIO|COLABORADOR|EMPREGADO|SOCIO|SÓCIO)[^A-Za-zÀ-ÿ]{0,10}([A-Za-zÀ-ÿ' ]{5,80})/i,
    /(?:FUNCIONARIO|FUNCIONÁRIO|COLABORADOR|EMPREGADO)[^A-Za-zÀ-ÿ]{0,10}([A-Za-zÀ-ÿ' ]{5,80})/i,
    /NOME[^A-Za-zÀ-ÿ]{0,10}([A-Za-zÀ-ÿ' ]{5,80})/i,
  ];
  for (const re of rotulos) {
    const m = texto.match(re);
    if (m) {
      const limpo = limparNome(m[1]);
      if (limpo) return limpo;
    }
  }
  return null;
}
