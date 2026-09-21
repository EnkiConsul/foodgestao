/**
 * Fixtures determinísticas de CNPJ e CEP usadas SOMENTE no build de
 * homologação. Dados totalmente fictícios: nenhuma consulta sai para a
 * Receita Federal, BrasilAPI ou ViaCEP quando o build é de homologação.
 *
 * Importante: nada aqui é acionável no build de produção — os pontos de uso
 * checam `isHomologacao()` (que exige o banco de homologação) e não existe
 * CNPJ mágico, parâmetro de URL ou bypass no caminho de produção.
 */

export interface CnpjFixture {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  email: string | null;
  telefone: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  situacao: string | null;
  endereco_formatado: string;
}

/** CNPJs fictícios (dígitos verificadores válidos) reservados para teste. */
const CNPJ_FIXTURES: CnpjFixture[] = [
  {
    cnpj: "58241366000132",
    razao_social: "RESTAURANTE MODELO HOMOLOGACAO LTDA",
    nome_fantasia: "RESTAURANTE MODELO",
    email: "contato@exemplo-homologacao.test",
    telefone: "6230000000",
    logradouro: "RUA DE TESTE",
    numero: "100",
    complemento: null,
    bairro: "CENTRO",
    municipio: "GOIANIA",
    uf: "GO",
    cep: "74000000",
    situacao: "ATIVA",
    endereco_formatado: "RUA DE TESTE, 100 - CENTRO, GOIANIA/GO - 74000-000",
  },
  {
    cnpj: "19131243000197",
    razao_social: "BAR EXEMPLO HOMOLOGACAO LTDA",
    nome_fantasia: "BAR EXEMPLO",
    email: "bar@exemplo-homologacao.test",
    telefone: "6230000001",
    logradouro: "AVENIDA FICTICIA",
    numero: "250",
    complemento: "LOJA 2",
    bairro: "SETOR TESTE",
    municipio: "APARECIDA DE GOIANIA",
    uf: "GO",
    cep: "74900000",
    situacao: "ATIVA",
    endereco_formatado: "AVENIDA FICTICIA, 250, LOJA 2 - SETOR TESTE, APARECIDA DE GOIANIA/GO - 74900-000",
  },
];

/**
 * Resposta determinística para qualquer CNPJ de 14 dígitos: usa a fixture
 * correspondente ou deriva uma empresa fictícia estável a partir dos dígitos.
 */
export function cnpjFixture(digitos: string): CnpjFixture {
  const encontrado = CNPJ_FIXTURES.find((f) => f.cnpj === digitos);
  if (encontrado) return { ...encontrado };

  const sufixo = digitos.slice(-4);
  return {
    cnpj: digitos,
    razao_social: `EMPRESA HOMOLOGACAO ${sufixo} LTDA`,
    nome_fantasia: `EMPRESA ${sufixo}`,
    email: `empresa${sufixo}@exemplo-homologacao.test`,
    telefone: "6230000000",
    logradouro: "RUA DE HOMOLOGACAO",
    numero: sufixo,
    complemento: null,
    bairro: "SETOR HOMOLOGACAO",
    municipio: "GOIANIA",
    uf: "GO",
    cep: "74000000",
    situacao: "ATIVA",
    endereco_formatado: `RUA DE HOMOLOGACAO, ${sufixo} - SETOR HOMOLOGACAO, GOIANIA/GO - 74000-000`,
  };
}

export interface CepFixture {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

const CEP_FIXTURES: Record<string, CepFixture> = {
  "74000000": { logradouro: "RUA DE TESTE", bairro: "CENTRO", cidade: "GOIANIA", uf: "GO" },
  "74900000": {
    logradouro: "AVENIDA FICTICIA",
    bairro: "SETOR TESTE",
    cidade: "APARECIDA DE GOIANIA",
    uf: "GO",
  },
  "01001000": { logradouro: "PRACA DE EXEMPLO", bairro: "SE", cidade: "SAO PAULO", uf: "SP" },
};

/** CEP determinístico e fictício; `null` reproduz o "CEP não encontrado". */
export function cepFixture(cep: string): CepFixture | null {
  if (cep.length !== 8) return null;
  if (CEP_FIXTURES[cep]) return { ...CEP_FIXTURES[cep] };
  if (cep.endsWith("99999")) return null;
  const sufixo = cep.slice(-3);
  return {
    logradouro: `RUA HOMOLOGACAO ${sufixo}`,
    bairro: "SETOR HOMOLOGACAO",
    cidade: "GOIANIA",
    uf: "GO",
  };
}
