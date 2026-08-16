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
