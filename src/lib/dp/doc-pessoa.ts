/**
 * Espelho de supabase/functions/_shared/doc-pessoa.ts para uso no cliente
 * (páginas já lidas, a partir do ocr_text salvo). Manter as duas cópias iguais
 * — src/test/dp/docPessoa.test.ts garante a paridade.
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
  "NOME", "PAGAMENTO", "REFERENCIA", "REFERÊNCIA", "VENCIMENTO", "DESCONTO",
  "PROVENTO", "BASE", "PERIODO", "PERÍODO", "MATRICULA", "MATRÍCULA",
];

/** Marcas de razão social: nunca podem ser aceitas como nome de pessoa. */
const MARCAS_EMPRESA = [
  /\bLTDA\b/i, /\bEIRELI\b/i, /\bMEI\b/i, /\bEPP\b/i, /\bS\.?\/?A\b/i,
  /\bME\b/, /\bCIA\b/i, /&/, /\bCOMERCIO\b/i, /\bCOMÉRCIO\b/i,
  /\bALIMENTOS\b/i, /\bRESTAURANTE\b/i, /\bLANCHONETE\b/i, /\bBAR\b/i,
  /\bMATRIZ\b/i, /\bFILIAL\b/i, /\bINDUSTRIA\b/i, /\bINDÚSTRIA\b/i,
  /\bSERVICOS\b/i, /\bSERVIÇOS\b/i, /\bEMPREENDIMENTOS\b/i, /\bPARTICIPACOES\b/i,
  /\bPARTICIPAÇÕES\b/i, /\bDISTRIBUIDORA\b/i, /\bSUPERMERCADO\b/i,
  /\bTRANSPORTES\b/i, /\bCONSTRUCOES\b/i, /\bCONSTRUÇÕES\b/i,
];

export function pareceRazaoSocial(v: string): boolean {
  const texto = (v ?? "").trim();
  if (!texto) return false;
  return MARCAS_EMPRESA.some((re) => re.test(texto));
}

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
  if (pareceRazaoSocial(nome)) return null;
  nome = partes.slice(0, 8).join(" ");
  return nome;
}

const RE_ROTULO_PESSOA =
  /(?:NOME\s+(?:DO|DA)\s+)?(?:FUNCION[AÁ]RIO|COLABORADOR|EMPREGADO|S[OÓ]CIO|BENEFICI[AÁ]RIO)\b/i;
const RE_ROTULO_NOME = /\bNOME\b/i;

/**
 * Procura o nome a partir de um rótulo: primeiro no restante da mesma linha e,
 * quando o rótulo está isolado (cabeçalho de coluna), nas próximas linhas úteis.
 */
function nomeAPartirDoRotulo(linhas: string[], idx: number, resto: string): string | null {
  const mesmaLinha = limparNome(resto.replace(/^[^A-Za-zÀ-ÿ]{0,10}/, ""));
  if (mesmaLinha) return mesmaLinha;

  let vistas = 0;
  for (let i = idx + 1; i < linhas.length && vistas < 3; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;
    vistas++;
    if (/CNPJ/i.test(linha)) continue;
    const limpo = limparNome(linha);
    if (limpo) return limpo;
  }
  return null;
}

/**
 * Nome da pessoa do documento. Prioriza a linha `PESSOA:` emitida pela leitura
 * (descartando razão social), depois rótulos específicos do funcionário — na
 * mesma linha ou na linha abaixo, quando o rótulo é cabeçalho de coluna — e só
 * em último recurso o rótulo genérico "Nome".
 */
export function extrairNomePessoa(ocr: string): string | null {
  const texto = ocr ?? "";
  const linhas = texto.split(/\r?\n/);

  const ia = texto.match(/PESSOA:\s*(.+)/i);
  if (ia) {
    const v = ia[1].trim();
    if (v && !/^DESCONHECID/i.test(v) && !pareceRazaoSocial(v)) {
      const limpo = limparNome(v);
      if (limpo) return limpo;
    }
  }

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (/CNPJ/i.test(linha)) continue;
    const m = linha.match(RE_ROTULO_PESSOA);
    if (!m) continue;
    const resto = linha.slice((m.index ?? 0) + m[0].length);
    const nome = nomeAPartirDoRotulo(linhas, i, resto);
    if (nome) return nome;
  }

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (/CNPJ/i.test(linha)) continue;
    const m = linha.match(RE_ROTULO_NOME);
    if (!m) continue;
    const resto = linha.slice((m.index ?? 0) + m[0].length);
    const nome = nomeAPartirDoRotulo(linhas, i, resto);
    if (nome) return nome;
  }

  return null;
}
