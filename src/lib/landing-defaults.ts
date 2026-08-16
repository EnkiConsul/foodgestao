// Defaults espelhando o conteúdo original da landing page.
// Servem como fallback quando o super admin ainda não salvou um campo,
// e também como base para o botão "Restaurar padrão".

export type NavItem = { label: string; href: string };
export type NavContent = {
  items: NavItem[];
  cta_login: string;
  cta_primary: string;
};

export type HeroContent = {
  badge: string;
  title_prefix: string;
  title_highlight: string;
  title_suffix: string;
  subtitle: string;
  bullets: string[];
  cta_primary: string;
  cta_secondary: string;
  trust_satisfaction: string;
  trust_users: string;
  trust_devices: string;
};

export type PersonasStripContent = {
  label: string;
  items: string[];
};

export type PainContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  pain_title: string;
  pains: string[];
  gain_title: string;
  gains: string[];
};

export type SegmentItem = { title: string; desc: string };
export type SegmentsContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  items: SegmentItem[];
};

export type HowStep = { title: string; desc: string };
export type HowItWorksContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  steps: HowStep[];
  note: string;
};

export type ComparisonRow = { k: string; a: string; b: string };
export type ComparisonContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  col_resource: string;
  col_spreadsheet: string;
  col_plin: string;
  rows: ComparisonRow[];
  cta_label: string;
};

export type PersonaCard = {
  tag: string;
  title: string;
  bullets: string[];
  cta_label: string;
  persona: "pf" | "mei" | "pj";
};
export type PersonaCardsContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  cards: PersonaCard[];
};

export type FeatureItem = { title: string; desc: string };
export type FeaturesContent = {
  eyebrow: string;
  title: string;
  items: FeatureItem[];
};

export type GuaranteeContent = {
  title: string;
  subtitle: string;
  cta_label: string;
};

export type PricingIntroContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  tab_financeiro: string;
  tab_dp: string;
  dp_title: string;
  dp_subtitle: string;
  dp_cta_label: string;
  legal: string;
};

export type LoyaltyStep = { title: string; desc: string };
export type LoyaltyContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  steps: LoyaltyStep[];
  timeline_title: string;
  timeline_note: string;
};

export type PlanMatrixContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  col_resource: string;
};


export type FaqItem = { q: string; a: string };
export type FaqContent = {
  eyebrow: string;
  title: string;
  items: FaqItem[];
};

export type FinalCtaContent = {
  title: string;
  subtitle: string;
  cta_label: string;
};

export type FooterContent = {
  copyright: string;
  link_login: string;
  link_plans: string;
  link_faq: string;
  link_privacy: string;
  link_terms: string;
  link_cookies: string;
  link_cookie_settings: string;
  link_dpo: string;
};

export const LANDING_DEFAULTS = {
  nav: {
    items: [
      { label: "Início", href: "#" },
      { label: "Soluções", href: "#modulos" },
      { label: "Recursos", href: "#recursos" },
      { label: "FAQ", href: "#faq" },
      { label: "Contato", href: "#contato" },
    ],
    cta_login: "Entrar",
    cta_primary: "Conheça a solução",
  } satisfies NavContent,

  hero: {
    badge: "Gestão feita para bares e restaurantes",
    title_prefix: "O seu ",
    title_highlight: "bar ou restaurante",
    title_suffix: " sob controle, sem planilha.",
    subtitle:
      "Contas a pagar e a receber, lançamentos bancários automáticos, conciliação, fluxo de caixa e DRE gerencial — em um só lugar, com a equipe organizada no módulo de Departamento Pessoal.",
    bullets: [
      "Extrato do banco entrando sozinho e conciliação em poucos cliques",
      "Fluxo de caixa e DRE gerencial prontos, sem montar planilha",
      "Dados protegidos (LGPD) e em servidores no Brasil",
    ],
    cta_primary: "Conheça a solução",
    cta_secondary: "Falar com especialista",
    trust_satisfaction: "Feito com donos de restaurante",
    trust_users: "Bares, restaurantes e redes",
    trust_devices: "Mobile e desktop",
  } satisfies HeroContent,


  personas_strip: {
    label: "Feito para",
    items: ["Bares", "Restaurantes", "Pizzarias", "Hamburguerias", "Cafeterias", "Redes e filiais"],
  } satisfies PersonasStripContent,

  pain: {
    eyebrow: "O dia a dia hoje",
    title: "O caixa fecha, mas ninguém sabe se o mês fechou no lucro",
    subtitle:
      "Bar e restaurante têm dezenas de pagamentos por semana, fornecedor no boleto, maquininha, delivery e equipe girando. A planilha não acompanha esse ritmo.",
    pain_title: "Sem o 360°FOOD",
    pains: [
      "Boletos de fornecedor descobertos só quando já venceram",
      "Extrato do banco conferido à mão, lançamento por lançamento",
      "Maquininha, delivery e PIX misturados sem saber o que entrou de verdade",
      "Custo de equipe estimado no papel: hora extra, folga e ponto sem controle",
      "Fim do mês sem saber a margem de cada unidade",
    ],
    gain_title: "Com o 360°FOOD",
    gains: [
      "Contas a pagar e a receber com aviso de vencimento antes de atrasar",
      "Extrato do banco entrando automático e conciliação em poucos cliques",
      "Recebimentos separados por forma de pagamento e por unidade",
      "Ponto, escala e folha organizados no módulo de Departamento Pessoal",
      "Fluxo de caixa e DRE gerencial prontos, sem montar planilha",
    ],
  } satisfies PainContent,

  segments: {
    eyebrow: "Segmentos",
    title: "Feito para quem vive o salão e a cozinha",
    subtitle:
      "A operação de alimentos fora do lar tem rotina própria — o 360°FOOD já vem preparado para ela.",
    items: [
      { title: "Bares e casas noturnas", desc: "Turnos à noite, equipe rotativa e alto volume de pagamentos em cartão e PIX." },
      { title: "Restaurantes", desc: "Fornecedor no boleto, custo de ficha técnica e controle de margem por período." },
      { title: "Pizzarias e hamburguerias", desc: "Delivery e salão no mesmo caixa, com recebíveis separados por canal." },
      { title: "Cafeterias e padarias", desc: "Ticket baixo e muitos lançamentos: categorização automática economiza horas." },
      { title: "Redes e filiais", desc: "Cada unidade com dados isolados e visão consolidada do grupo." },
      { title: "Franquias e sócios", desc: "Relatórios prontos para sócios, contador e franqueadora." },
    ],
  } satisfies SegmentsContent,

  how_it_works: {
    eyebrow: "Como funciona",
    title: "Do cadastro ao primeiro relatório em poucos passos",
    subtitle: "Sem instalação e sem projeto de implantação. Você usa no celular e no computador.",
    steps: [
      { title: "Crie a conta do seu negócio", desc: "Cadastro rápido com os dados do bar ou restaurante e das unidades." },
      { title: "Conecte o banco ou importe o extrato", desc: "Os lançamentos chegam sozinhos e ficam prontos para conciliar." },
      { title: "Organize contas e equipe", desc: "Contas a pagar e a receber, categorias e o time no Departamento Pessoal." },
      { title: "Acompanhe caixa e resultado", desc: "Fluxo de caixa projetado e DRE gerencial atualizados a cada lançamento." },
    ],
    note: "Nossa equipe acompanha a configuração inicial junto com você.",
  } satisfies HowItWorksContent,

  comparison: {
    eyebrow: "Planilha vs 360°FOOD",
    title: "Saia da planilha sem perder o controle",
    subtitle:
      "Por que centenas de MEIs e pequenas empresas estão substituindo o Excel pelo 360°FOOD.",
    col_resource: "Recurso",
    col_spreadsheet: "Planilha",
    col_plin: "360°FOOD",
    rows: [
      { k: "Atualização", a: "Manual e demorada", b: "Lançamentos rápidos com categorização" },
      { k: "Fluxo de caixa futuro", a: "Fórmulas que quebram", b: "Projeção automática por conta" },
      { k: "Alertas de vencimento", a: "Você precisa lembrar", b: "Avisos de A Vencer e Atrasado" },
      { k: "Multiusuário", a: "Conflito de versões", b: "Equipe com perfis de acesso" },
      { k: "Acesso mobile", a: "Sofrível no celular", b: "Responsivo, otimizado para mobile" },
      { k: "Backup e segurança", a: "Por sua conta", b: "Backup automático e LGPD" },
      { k: "Relatórios", a: "Você monta do zero", b: "DRE, categorias e exportações prontos" },
    ],
    cta_label: "Começe Grátis",
  } satisfies ComparisonContent,

  persona_cards: {
    eyebrow: "Para quem é",
    title: "Uma conta, três jeitos de usar",
    subtitle:
      "Alterne entre Pessoa Física e Pessoa Jurídica em 1 clique — dados isolados, mesma conta.",
    cards: [
      {
        tag: "Pessoal",
        title: "Para você e sua família",
        bullets: ["Orçamento doméstico", "Cartões e contas", "Modo privacidade para apresentar"],
        cta_label: "Começe Grátis",
        persona: "pf",
      },
      {
        tag: "MEI",
        title: "Para MEIs e autônomos",
        bullets: ["DAS, NFs e clientes", "Lançamentos recorrentes", "Relatórios para o contador"],
        cta_label: "Começe Grátis",
        persona: "mei",
      },
      {
        tag: "Empresa",
        title: "Para pequenas empresas",
        bullets: ["Multiempresa isolada", "Equipe com permissões", "Contas a pagar/receber e DRE"],
        cta_label: "Começe Grátis",
        persona: "pj",
      },
    ],
  } satisfies PersonaCardsContent,

  features: {
    eyebrow: "Recursos",
    title: "O que você resolve no 360°FOOD",
    items: [
      { title: "Contas a pagar e a receber", desc: "Boletos de fornecedor, recebíveis e recorrências com aviso antes de vencer." },
      { title: "Banco conectado e conciliação", desc: "O extrato entra sozinho, o sistema sugere a categoria e você confirma em poucos cliques." },
      { title: "Fluxo de caixa projetado", desc: "Veja o saldo dos próximos dias e semanas antes de fechar um pedido grande." },
      { title: "DRE gerencial por unidade", desc: "Resultado do mês por unidade e por categoria, sem montar planilha." },
      { title: "Equipe organizada", desc: "Ponto, escala, férias e folha no módulo de Departamento Pessoal." },
      { title: "Dados protegidos", desc: "Acesso por perfil, dados isolados por empresa e conformidade com a LGPD." },
    ],

  } satisfies FeaturesContent,

  guarantee: {
    title: "Primeiro mês grátis · cartão validado sem cobrança · cancele quando quiser",
    subtitle:
      "Acesso completo desde o primeiro dia. A primeira cobrança acontece somente 30 dias depois.",
    cta_label: "Começar com o 1º mês grátis",
  } satisfies GuaranteeContent,

  loyalty: {
    eyebrow: "Programa Fidelidade 360",
    title: "Seu primeiro mês é grátis. E a cada 3 mensalidades pagas, a próxima é por nossa conta.",
    subtitle:
      "12 meses de 360° Food e você paga apenas 9. Cobrança recorrente no cartão, sem parcelar o valor anual e sem comprometer o limite de uma só vez.",
    steps: [
      {
        title: "Cartão validado, sem cobrança",
        desc: "Na contratação o cartão é validado e tokenizado com segurança pelo gateway. Nada é cobrado no ato.",
      },
      {
        title: "Primeira cobrança em 30 dias",
        desc: "O primeiro mês é cortesia. A mensalidade só entra no cartão 30 dias após a contratação.",
      },
      {
        title: "Meses 5 e 9 gratuitos",
        desc: "A cada três mensalidades pagas em dia, o 360° Food libera automaticamente a mensalidade seguinte.",
      },
      {
        title: "Benefício visível na fatura",
        desc: "Nos meses de cortesia a fatura é emitida com o desconto Fidelidade 360 e total de R$ 0,00.",
      },
    ],
    timeline_title: "Como fica o seu ciclo de 12 meses",
    timeline_note:
      "Vigência de 12 meses. Meses gratuitos condicionados ao pagamento em dia das três mensalidades anteriores. Benefício exclusivo para novos clientes, um por CNPJ ou grupo econômico e não cumulativo com outras promoções. Upgrade permitido durante o contrato; renovação e reajuste informados previamente.",
  } satisfies LoyaltyContent,

  pricing_intro: {
    eyebrow: "Planos",
    title: "Um plano para cada momento do seu negócio",
    subtitle:
      "Escolha a solução e o plano. No Fidelidade 360 você paga 9 mensalidades em 12 meses; no mensal flexível, cancela quando quiser.",
    tab_financeiro: "Financeiro",
    tab_dp: "Departamento Pessoal",
    dp_title: "Departamento Pessoal com preços em breve",
    dp_subtitle:
      "Ponto, escala, férias e folha em um só lugar. A cobrança do módulo DP é separada da do financeiro — fale com o nosso time para condições de lançamento.",
    dp_cta_label: "Falar com o time",
    legal:
      "Preços em reais, por empresa. Fidelidade 360: vigência de 12 meses, 9 mensalidades recorrentes no cartão, meses 1, 5 e 9 gratuitos conforme pagamentos em dia. Mensal flexível: sem meses gratuitos, cancelamento antes da próxima renovação.",
  } satisfies PricingIntroContent,

  plan_matrix: {
    eyebrow: "Comparativo",
    title: "Comparativo completo dos planos",
    subtitle: "Todos os planos incluem lançamentos ilimitados, conciliação automática e agente de IA.",
    col_resource: "Funcionalidades",
  } satisfies PlanMatrixContent,

  faq: {
    eyebrow: "Perguntas frequentes",
    title: "Tire suas dúvidas",
    items: [
      { q: "Como funciona o primeiro mês grátis?", a: "Você escolhe o plano, cadastra o cartão e o acesso é liberado na hora. O cartão é apenas validado e tokenizado — a primeira cobrança acontece 30 dias depois." },
      { q: "Como ganho os meses gratuitos?", a: "A cada três mensalidades pagas em dia, a próxima mensalidade é gratuita. No ciclo de 12 meses isso acontece nos meses 5 e 9, somados à cortesia do mês 1." },
      { q: "O valor anual compromete o limite do cartão?", a: "Não. Não fazemos parcelamento do valor anual. São nove cobranças mensais recorrentes, então só o valor da mensalidade do mês ocupa o limite." },
      { q: "E se o pagamento atrasar ou o cartão for recusado?", a: "Fazemos novas tentativas e avisamos você por WhatsApp. Em caso de atraso persistente o acesso é suspenso parcialmente e reativado automaticamente após a regularização. Meses em atraso não contam para liberar o benefício." },
      { q: "Posso escolher o mensal flexível?", a: "Sim. O mensal flexível é cobrado mês a mês, sem meses gratuitos, com cancelamento antes da próxima renovação — e você pode migrar para o Fidelidade 360 quando quiser." },
      { q: "Posso fazer upgrade de plano?", a: "Sim, o upgrade é permitido durante o contrato e passa a valer na cobrança seguinte." },
      { q: "O módulo de Departamento Pessoal está incluído?", a: "Não. Financeiro e Departamento Pessoal são soluções com cobrança separada. Fale com o nosso time para conhecer as condições do DP." },
      { q: "Meus dados estão seguros?", a: "Criptografia em trânsito, isolamento por usuário/empresa e conformidade com a LGPD. Não armazenamos o número completo nem o código de segurança do cartão — apenas o token do gateway, a bandeira e os quatro últimos dígitos." },
    ],
  } satisfies FaqContent,

  final_cta: {
    title: "Pronto para tirar o financeiro do restaurante da planilha?",
    subtitle: "Primeiro mês grátis. A cada 3 mensalidades pagas, a próxima é por conta do 360° Food.",
    cta_label: "Começar com o 1º mês grátis",
  } satisfies FinalCtaContent,


  footer: {
    copyright: "© {year} 360°FOOD. Todos os direitos reservados.",
    link_login: "Entrar",
    link_plans: "Planos",
    link_faq: "FAQ",
    link_privacy: "Política de Privacidade",
    link_terms: "Termos de Uso",
    link_cookies: "Política de Cookies",
    link_cookie_settings: "Gerenciar cookies",
    link_dpo: "Encarregado (DPO)",
  } satisfies FooterContent,
} as const;

export type LandingSection = keyof typeof LANDING_DEFAULTS;
export type LandingContentMap = typeof LANDING_DEFAULTS;
