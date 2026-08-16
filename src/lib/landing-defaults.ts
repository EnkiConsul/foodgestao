// Defaults espelhando o conteúdo original da landing page.
// Servem como fallback quando o super admin ainda não salvou um campo,
// e também como base para o botão "Restaurar padrão".

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
  hero: {
    badge: "Teste grátis 7 dias · sem cartão",
    title_prefix: "Controle financeiro ",
    title_highlight: "pessoal e da sua empresa",
    title_suffix: ", sem planilha.",
    subtitle:
      "Para MEI, autônomos, pequenas empresas e finanças pessoais. Contas a pagar e receber, fluxo de caixa projetado e relatórios — em uma só conta, com troca de PF/PJ em 1 clique.",
    bullets: [
      "Sem cartão de crédito para testar",
      "Cancele em 1 clique, sem fidelidade",
      "Dados protegidos (LGPD) e em servidores no Brasil",
    ],
    cta_primary: "Começe Grátis",
    cta_secondary: "Ver como funciona",
    trust_satisfaction: "4.9 em satisfação",
    trust_users: "Usado por MEIs e PMEs",
    trust_devices: "Mobile e desktop",
  } satisfies HeroContent,

  personas_strip: {
    label: "Feito para",
    items: ["MEI", "Autônomos", "Pequenas empresas", "Famílias", "Casais", "Freelancers"],
  } satisfies PersonasStripContent,

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
    title: "Tudo que você precisa para tirar o financeiro do papel",
    items: [
      { title: "Contas a pagar e receber unificadas", desc: "Todos os lançamentos com vencimentos, status, recorrências e anexos." },
      { title: "Dashboard inteligente", desc: "Saldos, evolução mensal e top categorias em tempo real." },
      { title: "Fluxo de caixa projetado", desc: "Veja o saldo futuro com base nas suas contas e lançamentos previstos." },
      { title: "Multiusuário e perfis", desc: "Convide sua equipe com permissões granulares por módulo." },
      { title: "Privacidade e LGPD", desc: "Modo privacidade, dados isolados por usuário/empresa (RLS)." },
      { title: "Pronto em 2 minutos", desc: "Onboarding guiado: perfil, dados, primeira conta e categorias." },
    ],
  } satisfies FeaturesContent,

  guarantee: {
    title: "7 dias grátis · sem cartão · cancele quando quiser",
    subtitle: "Acesso completo durante o teste. Sem letrinhas miúdas.",
    cta_label: "Começe Grátis",
  } satisfies GuaranteeContent,

  pricing_intro: {
    eyebrow: "Planos",
    title: "Comece grátis. Evolua quando precisar.",
    subtitle: "Todos os planos pagos incluem 7 dias de teste, sem cartão de crédito.",
  } satisfies PricingIntroContent,

  faq: {
    eyebrow: "Perguntas frequentes",
    title: "Tire suas dúvidas",
    items: [
      { q: "Preciso de cartão de crédito para testar?", a: "Não. O teste de 7 dias é liberado na hora, sem pedir cartão." },
      { q: "Funciona para MEI e pessoa física na mesma conta?", a: "Sim. Você alterna entre Pessoa Física e Pessoa Jurídica com 1 clique, com dados totalmente isolados." },
      { q: "Meus dados estão seguros?", a: "Criptografia em trânsito, isolamento por usuário/empresa (RLS) e conformidade com a LGPD. Você pode exportar ou excluir os dados a qualquer momento." },
      { q: "Posso cancelar quando quiser?", a: "Sim. Sem fidelidade. Cancele em 1 clique nas configurações." },
    ],
  } satisfies FaqContent,

  final_cta: {
    title: "Pronto para tirar o financeiro da planilha?",
    subtitle: "7 dias grátis. Sem cartão de crédito. Cancele quando quiser.",
    cta_label: "Começe Grátis",
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
