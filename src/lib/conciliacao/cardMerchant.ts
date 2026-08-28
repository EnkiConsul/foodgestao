/**
 * Estabelecimento (fornecedor) nos lançamentos de fatura de cartão.
 *
 * Nessas linhas o Open Finance não manda `merchant` nem `paymentData`: o único
 * dado do fornecedor é a descrição no formato do extrato de cartão —
 * `NOME DO ESTABELECIMENTO  CIDADE  PAIS` ("PONTO DA CARNE GOIANIA BR"). Aqui
 * separamos o nome da cidade/país para alimentar a sugestão de fornecedor.
 * Não há CNPJ nessas linhas: só o nome.
 */

import { isCardOperationCode } from "@/lib/conciliacao/cardDescription";

export interface CardMerchant {
  name: string | null;
  city: string | null;
}

const EMPTY: CardMerchant = { name: null, city: null };

/** Códigos de país no fim da descrição do cartão. */
const COUNTRY_TOKENS = new Set([
  "BR", "BRA", "BRASIL", "GB", "UK", "US", "USA", "PT", "ES", "AR", "CL", "UY",
  "IT", "FR", "DE", "NL", "IE", "CA", "MX", "PY",
]);

/** Conectores de cidades compostas ("Valparaíso de Goiás", "Aparecida de Goiânia"). */
const CITY_CONNECTORS = new Set(["DE", "DA", "DO", "DOS", "DAS", "D"]);

/** Tokens de cidade comuns nos extratos (nome do estabelecimento vem antes). */
const CITY_TOKENS = new Set([
  "GOIANIA", "ANAPOLIS", "ABADIANIA", "APARECIDA", "VALPARAISO", "LUZIANIA",
  "TRINDADE", "SENADOR", "CANEDO", "CATALAO", "JATAI", "ITUMBIARA", "CALDAS",
  "NOVAS", "PIRENOPOLIS", "GOIANESIA", "FORMOSA", "PLANALTINA", "RIALMA",
  "CERES", "MORRINHOS", "URUACU", "MINEIROS", "QUIRINOPOLIS", "GOIAS",
  "BRASILIA", "TAGUATINGA", "GAMA", "CEILANDIA", "SOBRADINHO",
  "SAO", "PAULO", "RIO", "JANEIRO", "BELO", "HORIZONTE", "CURITIBA",
  "SALVADOR", "RECIFE", "FORTALEZA", "MANAUS", "PORTO", "ALEGRE", "CAMPINAS",
  "SANTOS", "NITEROI", "GUARULHOS", "OSASCO", "SANTO", "ANDRE", "BERNARDO",
  "CAMPO", "GRANDE", "CUIABA", "PALMAS", "TERESINA", "NATAL", "MACEIO",
  "JOAO", "PESSOA", "ARACAJU", "VITORIA", "FLORIANOPOLIS", "JOINVILLE",
  "LONDRINA", "MARINGA", "UBERLANDIA", "UBERABA", "RIBEIRAO", "PRETO",
  "SOROCABA", "BAURU", "JUNDIAI", "PIRACICABA", "LIMEIRA",
  "SOUTHAMPTON", "LONDON", "DUBLIN", "AMSTERDAM", "LISBOA", "MADRID",
]);

/** Pagamentos da própria fatura: não têm fornecedor. */
const BILL_PAYMENT_RE =
  /(pagamento\s+(?:da\s+)?fatura|pagamento\s+recebido|pagamento_recebido|credit\s*card\s*payment)/i;

function normalizeToken(token: string): string {
  return token
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

/** true quando a linha é pagamento da fatura do cartão (sem fornecedor). */
export function isCardBillPayment(
  description: string | null | undefined,
  category?: string | null,
): boolean {
  const text = `${description ?? ""} ${category ?? ""}`;
  return BILL_PAYMENT_RE.test(text);
}

/**
 * Separa nome do estabelecimento e cidade na descrição de cartão.
 * Devolve nome nulo quando a descrição é só código de operação
 * (`CREDITO_A_VISTA`) ou pagamento de fatura.
 */
export function merchantFromCardDescription(
  description: string | null | undefined,
  category?: string | null,
): CardMerchant {
  const raw = String(description ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return EMPTY;
  if (isCardOperationCode(raw)) return EMPTY;
  if (isCardBillPayment(raw, category)) return EMPTY;

  // "Valparaiso deBR" → separa o código do país colado ao conector.
  const separated = raw.replace(
    /\b(de|da|do)(BR|BRA|GB|UK|US|USA|PT|ES|AR|CL|UY|IT|FR|DE|NL|IE|CA|MX|PY)\b/g,
    "$1 $2",
  );

  let tokens = separated.split(" ").filter(Boolean);
  const cityTokens: string[] = [];

  // País no fim.
  while (tokens.length > 1 && COUNTRY_TOKENS.has(normalizeToken(tokens[tokens.length - 1]))) {
    tokens.pop();
  }

  // Cidade no fim (inclusive composta e cortada: "APARECIDA DE").
  let guard = 0;
  while (tokens.length > 1 && guard < 4) {
    const last = normalizeToken(tokens[tokens.length - 1]);
    if (CITY_TOKENS.has(last) || CITY_CONNECTORS.has(last)) {
      cityTokens.unshift(tokens.pop() as string);
      guard += 1;
      continue;
    }
    break;
  }

  // Sobrou só conector no fim do nome ("SORVETERIA ... de").
  while (tokens.length > 1 && CITY_CONNECTORS.has(normalizeToken(tokens[tokens.length - 1]))) {
    cityTokens.unshift(tokens.pop() as string);
  }

  const name = tokens.join(" ").trim();
  const city = cityTokens.filter((t) => !CITY_CONNECTORS.has(normalizeToken(t))).join(" ").trim();
  if (name.length < 3) return EMPTY;

  return { name, city: city || null };
}
