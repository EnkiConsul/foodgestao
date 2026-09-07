/**
 * Endereço da ficha: as fichas trazem o endereço em partes (logradouro, bairro,
 * município, CEP) ou em uma linha só. Aqui o texto é quebrado no formato que o
 * cadastro do colaborador já guarda; o que não for seguro fica em `texto` para
 * conferência na revisão.
 */

export type EnderecoEstruturado = {
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  /** Texto original lido da ficha, sempre preservado. */
  texto: string | null;
};

const UF = /\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/;

export function normalizeCep(value: string | null | undefined): string | null {
  const d = String(value ?? "").replace(/\D+/g, "");
  if (d.length !== 8) return null;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Quebra uma linha única de endereço ("Rua X, 258, Bairro, Cidade - GO, CEP 72.872-057"). */
export function parseEnderecoTexto(texto: string | null | undefined): EnderecoEstruturado {
  const original = String(texto ?? "").trim();
  const vazio: EnderecoEstruturado = {
    logradouro: null, numero: null, bairro: null, cidade: null, uf: null, cep: null,
    texto: original || null,
  };
  if (!original) return vazio;

  const cepMatch = /CEP[:\s]*([\d.\-]{8,12})|(\b\d{2}\.?\d{3}-?\d{3}\b)/i.exec(original);
  const cep = normalizeCep(cepMatch?.[1] ?? cepMatch?.[2] ?? null);

  const semCep = original.replace(/CEP[:\s]*[\d.\-]{8,12}/i, "").replace(/\b\d{2}\.?\d{3}-?\d{3}\b/, "");
  const partes = semCep.split(/[,;]/).map((p) => p.trim()).filter(Boolean);

  const ufMatch = UF.exec(semCep.toUpperCase());
  const uf = ufMatch?.[1] ?? null;

  let cidade: string | null = null;
  const cidadeParte = partes.find((p) => UF.test(p.toUpperCase()) && p.length <= 60);
  if (cidadeParte) {
    cidade = cidadeParte.replace(/[-–]\s*[A-Z]{2}\s*$/i, "").replace(UF, "").replace(/[-–]\s*$/, "").trim() || null;
  }

  const logradouro = partes[0] ?? null;
  const numeroMatch = partes[1] ? /^(\d{1,6})\b/.exec(partes[1]) : null;
  const numero = numeroMatch?.[1] ?? null;

  const bairro = partes.find((p, i) => i > 0 && p !== cidadeParte && !/^\d+$/.test(p)) ?? null;

  return {
    logradouro,
    numero,
    bairro: bairro && bairro !== logradouro ? bairro : null,
    cidade,
    uf,
    cep,
    texto: original,
  };
}

/** Junta o que veio em campos separados com o que der para inferir do texto. */
export function montarEndereco(input: Partial<EnderecoEstruturado> | null | undefined): EnderecoEstruturado {
  const doTexto = parseEnderecoTexto(input?.texto);
  return {
    logradouro: input?.logradouro?.trim() || doTexto.logradouro,
    numero: input?.numero?.trim() || doTexto.numero,
    bairro: input?.bairro?.trim() || doTexto.bairro,
    cidade: input?.cidade?.trim() || doTexto.cidade,
    uf: (input?.uf?.trim().toUpperCase() || doTexto.uf) ?? null,
    cep: normalizeCep(input?.cep) ?? doTexto.cep,
    texto: input?.texto?.trim() || doTexto.texto,
  };
}
