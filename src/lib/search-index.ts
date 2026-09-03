/**
 * Static search index for the public site. Add new public/indexable pages here
 * so /buscar can surface them and Google's Sitelinks Search Box has real content.
 */
export type SearchDoc = {
  path: string;
  title: string;
  description: string;
  keywords: string[];
  section: "Início" | "Guias" | "Planos" | "Conta" | "Legal";
};

export const SEARCH_INDEX: SearchDoc[] = [
  {
    path: "/",
    title: "Aveto 360 — Gestão financeira para o food service",
    description:
      "Unifique finanças pessoais e da sua operação. Contas a pagar e receber, orçamentos, fluxo de caixa e relatórios.",
    keywords: [
      "gestão financeira", "food service", "restaurante", "mei", "pequenos negócios",
      "orçamento", "fluxo de caixa", "contas a pagar", "contas a receber", "relatórios",
    ],
    section: "Início",
  },
  {
    path: "/auth",
    title: "Entrar ou criar conta",
    description: "Acesse sua conta Aveto 360 ou crie um cadastro gratuito.",
    keywords: ["login", "entrar", "cadastro", "criar conta", "acessar", "senha"],
    section: "Conta",
  },
  {
    path: "/planos",
    title: "Planos e preços",
    description: "Escolha o plano ideal para sua operação. Teste grátis por 7 dias.",
    keywords: ["planos", "preço", "assinatura", "mensalidade", "trial", "gratuito"],
    section: "Planos",
  },
  {
    path: "/guias/das-mei",
    title: "DAS MEI 2026: o que é, valores, prazos e como pagar",
    description:
      "Guia completo do DAS MEI: valores atualizados de 2026, vencimento, emissão do boleto e o que acontece se atrasar.",
    keywords: [
      "das mei", "das", "mei", "microempreendedor", "boleto", "simples nacional",
      "inss", "iss", "icms", "guia", "vencimento", "2026",
    ],
    section: "Guias",
  },
  {
    path: "/privacidade",
    title: "Política de Privacidade",
    description: "Como o Aveto 360 trata seus dados pessoais em conformidade com a LGPD.",
    keywords: ["privacidade", "lgpd", "dados pessoais", "política"],
    section: "Legal",
  },
  {
    path: "/termos",
    title: "Termos de Uso",
    description: "Regras de uso da plataforma Aveto 360.",
    keywords: ["termos", "uso", "condições", "contrato"],
    section: "Legal",
  },
  {
    path: "/cookies",
    title: "Política de Cookies",
    description: "Como usamos cookies e como gerenciar suas preferências.",
    keywords: ["cookies", "consentimento", "rastreamento", "preferências"],
    section: "Legal",
  },
  {
    path: "/encarregado-dados",
    title: "Encarregado de Tratamento de Dados (DPO)",
    description: "Canal de contato com o DPO responsável pelo tratamento de dados pessoais.",
    keywords: ["dpo", "encarregado", "lgpd", "contato", "dados"],
    section: "Legal",
  },
];

/** Normalize text: lowercase + strip accents. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type SearchResult = SearchDoc & { score: number };

/**
 * Simple weighted, token-based match: title > keywords > description.
 * Returns results sorted by score desc, filtering out zero-score docs.
 */
export function searchIndex(query: string): SearchResult[] {
  const q = normalize(query).trim();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);

  return SEARCH_INDEX.map((doc) => {
    const title = normalize(doc.title);
    const description = normalize(doc.description);
    const keywords = doc.keywords.map(normalize);

    let score = 0;
    for (const t of tokens) {
      if (title.includes(t)) score += 5;
      if (keywords.some((k) => k.includes(t))) score += 3;
      if (description.includes(t)) score += 1;
    }
    // Boost exact phrase match in title.
    if (title.includes(q)) score += 4;

    return { ...doc, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
