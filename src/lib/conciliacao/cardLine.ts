/**
 * Classificação padronizada das linhas de fatura de cartão de crédito.
 *
 * Cada banco escreve a linha de um jeito diferente:
 *
 *   Neon    `ModernMarket             GOIANIA      BR`  (colunas)
 *   Neon    `MP *VOXALIMENTOS         GOIANIA      BR`  (prefixo de adquirente)
 *   BMG     `CREDITO_A_VISTA`                            (código genérico)
 *   Nubank  `Ipremium Store 2/3`, `Juros de atraso`, `Pagamento recebido`
 *
 * Aqui reduzimos todos esses formatos a uma única estrutura, usada pela
 * conciliação, pelo extrato e pela sincronização: tipo da linha, encargo,
 * parcela, estabelecimento e cidade.
 */

// Nota: este módulo não importa `cardDescription.ts` (que importa daqui) para
// evitar ciclo — a checagem de código de operação é local.


export type CardLineKind = "compra" | "pagamento_fatura" | "encargo" | "sem_identificacao";

export interface CardInstallment {
  current: number;
  total: number;
}

export interface CardLine {
  kind: CardLineKind;
  /** Texto do banco normalizado (espaços colapsados). */
  text: string;
  /** Estabelecimento, apenas em compras. */
  merchant: string | null;
  /** Cidade do estabelecimento, quando o banco envia. */
  city: string | null;
  /** Parcela extraída do texto ("Ipremium Store 2/3"). */
  installment: CardInstallment | null;
}

/** Pagamentos/creditos da própria fatura: nunca têm fornecedor. */
const BILL_MOVEMENT_RE =
  /(pagamento\s+(?:da\s+)?fatura|pagamento\s+recebido|pagamento_recebido|credit\s*card\s*payment|encerramento\s+de\s+d[ií]vida|cr[eé]dito\s+de\s+atraso|estorno|devolu[cç][aã]o|reembolso|ajuste\s+de\s+cr[eé]dito)/i;

/** Encargos e tarifas do cartão: também não têm fornecedor. */
const CHARGE_RE =
  /(\bjuros?\b|\bmulta\b|\bmora\b|\biof\b|\btarifa\b|\banuidade\b|\bencargos?\b|\bsaldo\s+em\s+atraso\b|\brotativo\b|\bparcelamento\s+(?:da\s+)?fatura\b|\btaxa[s]?\b|\bseguro\b|\bavalia[cç][aã]o\s+emergencial\b)/i;

/** Prefixos de adquirente/subadquirente colados ao nome da loja. */
const AGGREGATOR_RE = /^\s*[A-Za-z0-9.]{2,12}\s*\*+\s*/;

/** Sufixo de parcela: "2/3", "PARC 02/06", "- 3/10". */
const INSTALLMENT_RE = /[\s\-–]*(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i;

/** Códigos de país no fim da descrição do cartão. */
const COUNTRY_TOKENS = new Set([
  "BR", "BRA", "BRASIL", "GB", "UK", "US", "USA", "PT", "ES", "AR", "CL", "UY",
  "IT", "FR", "DE", "NL", "IE", "CA", "MX", "PY",
]);

/** Conectores de cidades compostas ("Valparaíso de Goiás"). */
const CITY_CONNECTORS = new Set(["DE", "DA", "DO", "DOS", "DAS", "D"]);

/**
 * Cidades reconhecidas nos extratos já sem colunas. Sem colunas não há como
 * saber onde termina o nome da loja, então só cortamos o que é reconhecível —
 * cidade desconhecida permanece no nome (melhor um nome longo do que um nome
 * errado).
 */
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

function collapse(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeToken(token: string): string {
  return token
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

/** true quando a linha é pagamento/crédito da própria fatura. */
export function isCardBillMovement(text: string | null | undefined, category?: string | null): boolean {
  return BILL_MOVEMENT_RE.test(`${text ?? ""} ${category ?? ""}`);
}

/** true quando a linha é encargo/tarifa do cartão. */
export function isCardChargeLine(text: string | null | undefined, category?: string | null): boolean {
  const value = `${text ?? ""} ${category ?? ""}`;
  if (isCardBillMovement(text, category)) return false;
  return CHARGE_RE.test(value);
}

/** Remove prefixo de adquirente ("MP *VOXALIMENTOS" → "VOXALIMENTOS"). */
export function stripAggregatorPrefix(name: string): string {
  const stripped = name.replace(AGGREGATOR_RE, "").trim();
  return stripped.length >= 3 ? stripped : name.trim();
}

/** Separa a parcela do fim do texto ("Ipremium Store 2/3"). */
export function splitInstallment(text: string): { text: string; installment: CardInstallment | null } {
  const match = INSTALLMENT_RE.exec(text);
  if (!match) return { text: text.trim(), installment: null };
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!total || current > total) return { text: text.trim(), installment: null };
  const rest = text.slice(0, match.index).trim();
  if (rest.length < 3) return { text: text.trim(), installment: null };
  return { text: rest, installment: { current, total } };
}

function splitNameAndCity(text: string): { name: string; city: string | null } {
  // Colunas preservadas pelo banco: nome | cidade | país.
  const columns = text.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (columns.length >= 2 && columns[0].length >= 3) {
    const rest = columns.slice(1).filter((c) => !COUNTRY_TOKENS.has(normalizeToken(c)));
    return { name: columns[0], city: rest[0] ?? null };
  }

  // Sem colunas: separa país (inclusive colado, "Valparaiso deBR") e cidade.
  const separated = collapse(text).replace(
    /\b(de|da|do)(BR|BRA|GB|UK|US|USA|PT|ES|AR|CL|UY|IT|FR|DE|NL|IE|CA|MX|PY)\b/gi,
    "$1 $2",
  );
  const tokens = separated.split(" ").filter(Boolean);
  const cityTokens: string[] = [];

  while (tokens.length > 1 && COUNTRY_TOKENS.has(normalizeToken(tokens[tokens.length - 1]))) {
    tokens.pop();
  }

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

  while (tokens.length > 1 && CITY_CONNECTORS.has(normalizeToken(tokens[tokens.length - 1]))) {
    cityTokens.unshift(tokens.pop() as string);
  }

  const name = tokens.join(" ").trim();
  const city = cityTokens.filter((t) => !CITY_CONNECTORS.has(normalizeToken(t))).join(" ").trim();
  return { name, city: city || null };
}

export interface CardLineInput {
  /** Descrição gravada. */
  description?: string | null;
  /** JSON bruto do provedor (usa `descriptionRaw` quando existir). */
  raw?: unknown;
  /** Categoria do provedor. */
  category?: string | null;
  /** Nome estruturado do estabelecimento (`merchant`), quando o banco envia. */
  merchantName?: string | null;
}

/** Texto original do banco para a linha (colunas preservadas). */
export function cardLineText(input: CardLineInput): string {
  const raw = input.raw as { descriptionRaw?: unknown; description?: unknown } | null;
  return String(raw?.descriptionRaw ?? raw?.description ?? input.description ?? "");
}

/** Classificação única da linha de cartão. */
export function classifyCardLine(input: CardLineInput): CardLine {
  const original = cardLineText(input);
  const text = collapse(original);
  const category = input.category ?? null;

  if (!text) {
    return { kind: "sem_identificacao", text, merchant: null, city: null, installment: null };
  }

  if (isCardBillMovement(text, category)) {
    return { kind: "pagamento_fatura", text, merchant: null, city: null, installment: null };
  }

  if (isCardChargeLine(text, category)) {
    return { kind: "encargo", text, merchant: null, city: null, installment: null };
  }

  if (isOperationCode(text)) {
    return { kind: "sem_identificacao", text, merchant: null, city: null, installment: null };
  }

  const structured = collapse(input.merchantName);
  const { text: withoutInstallment, installment } = splitInstallment(original.trim());
  const parsed = splitNameAndCity(withoutInstallment);
  const name = structured || stripAggregatorPrefix(parsed.name);

  if (name.length < 3) {
    return { kind: "sem_identificacao", text, merchant: null, city: parsed.city, installment };
  }

  return { kind: "compra", text, merchant: name, city: parsed.city, installment };
}

/**
 * Rótulo curto do tipo da linha. Para linhas sem identificação devolve null: a
 * tradução do código genérico (`CREDITO_A_VISTA`) é feita em `cardDescription`.
 */
export function cardLineKindLabel(line: CardLine): string | null {
  if (line.kind === "pagamento_fatura") return "Pagamento da fatura";
  if (line.kind === "encargo") return "Encargo do cartão";
  return null;
}

