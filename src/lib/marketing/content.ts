/**
 * Conteúdo estático do site institucional 360°FOOD.
 * Regra: nada de números, integrações, clientes ou provas sociais inventadas.
 */

export const SITE_ORIGIN = "https://gestor360food.com";

export type SiteSolution = {
  key: "financeiro" | "dp";
  name: string;
  route: string;
  headline: string;
  description: string;
  benefits: string[];
  cta: string;
};

export const SOLUTIONS: SiteSolution[] = [
  {
    key: "financeiro",
    name: "Financeiro 360°",
    route: "/financeiro",
    headline: "Entenda o seu dinheiro antes de tomar a próxima decisão.",
    description:
      "Contas, bancos, caixa e resultado organizados para você saber o que aconteceu, o que está para acontecer e como está a margem da operação.",
    benefits: [
      "Contas a pagar e receber",
      "Open Finance e conciliação bancária",
      "Fluxo de caixa e orçamento",
      "DRE gerencial e relatórios",
      "IA para apoiar a organização das movimentações",
      "Acesso para equipe e contador",
    ],
    cta: "Conhecer o Financeiro 360°",
  },
  {
    key: "dp",
    name: "Pessoas 360°",
    route: "/departamento-pessoal",
    headline: "Organize sua equipe sem depender de planilhas e grupos de WhatsApp.",
    description:
      "Escalas, folgas, férias, documentos, solicitações e comunicação da equipe em um único ambiente.",
    benefits: [
      "Cadastro de colaboradores, cargos, unidades e turnos",
      "Escalas, calendário e convocações",
      "Folgas, férias, trocas e aprovações",
      "Documentos e históricos organizados",
      "Comunicação interna",
      "Portal do Colaborador",
    ],
    cta: "Conhecer o Pessoas 360°",
  },
];

export const DIFFERENTIALS = [
  {
    title: "Especializado em alimentação",
    text: "Linguagem e rotinas pensadas para bares, restaurantes e operações gastronômicas — não um ERP genérico adaptado.",
    highlight: true,
  },
  {
    title: "Financeiro e DP no mesmo ecossistema",
    text: "Duas frentes críticas da gestão com experiência integrada, no mesmo ambiente e com os mesmos acessos.",
    highlight: true,
  },
  {
    title: "Contratação modular",
    text: "Comece pelo Financeiro, pelo Departamento Pessoal ou pelos dois. Você contrata somente o que precisa.",
  },
  {
    title: "Multiempresa",
    text: "Diferentes CNPJs no mesmo ambiente, conforme o plano contratado.",
  },
  {
    title: "Automação financeira",
    text: "Open Finance, importação de movimentações, conciliação bancária e IA assistida para reduzir digitação.",
  },
  {
    title: "Rotina real da equipe",
    text: "Escalas, folgas, trocas, documentos e comunicação como acontecem em uma operação que não segue o horário comercial.",
  },
  {
    title: "Gestão conectada",
    text: "Proprietário, gestores, equipe administrativa, contador e colaboradores com acessos adequados ao seu papel.",
  },
  {
    title: "Acesso em qualquer tela",
    text: "Acesse pelo computador, tablet ou celular, direto do navegador.",
  },
];

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Escolha Financeiro, DP ou os dois",
    text: "Você conhece as soluções e decide o que faz sentido para o momento da sua operação.",
  },
  {
    step: "02",
    title: "Cadastre sua empresa e configure os acessos",
    text: "Empresa, contas, categorias e perfis de acesso para proprietário, gestores, administrativo e contador.",
  },
  {
    step: "03",
    title: "Centralize a rotina e acompanhe a operação",
    text: "Lançamentos, conciliação, escalas e documentos em um só lugar, com informação pronta para decidir.",
  },
];

export const BEFORE_AFTER = {
  before: [
    "Informações espalhadas entre planilhas, bancos e mensagens",
    "Digitação e conferência manual de movimentações",
    "Escalas e trocas resolvidas por papel e WhatsApp",
    "Documentos de colaboradores em pastas e celulares diferentes",
    "Decisões atrasadas por falta de visão do caixa e da margem",
  ],
  after: [
    "Dados financeiros organizados por categoria e centro de custo",
    "Movimentações importadas e conciliadas com apoio de automação",
    "Escala publicada, com folgas, trocas e aprovações registradas",
    "Documentos e históricos centralizados por colaborador",
    "Fluxo de caixa, DRE gerencial e relatórios para decidir com clareza",
  ],
};

export const ACCESS_PROFILES = [
  { role: "Proprietário", text: "Visão do negócio e das empresas que administra." },
  { role: "Gestor", text: "Rotina da unidade, escalas e aprovações do dia a dia." },
  { role: "Administrativo", text: "Lançamentos, contas, conciliação e documentos." },
  { role: "Contabilidade", text: "Acesso dedicado, com visão de leitura das informações financeiras." },
  { role: "Colaborador", text: "Portal próprio com escala, solicitações e documentos." },
];

/* ============================ PLANOS ============================ */

export type FinancePlan = {
  slug: string;
  name: string;
  price: number;
  tagline: string;
  highlight?: boolean;
  limits: {
    empresas: string;
    usuarios: string;
    contador: string;
    openFinance: string;
    lancamentos: string;
    whatsapp: string;
  };
};

export const FINANCE_PLANS: FinancePlan[] = [
  {
    slug: "essencial",
    name: "Essencial",
    price: 149.9,
    tagline: "Para uma empresa que precisa colocar o financeiro em ordem.",
    limits: {
      empresas: "1",
      usuarios: "2",
      contador: "1",
      openFinance: "2",
      lancamentos: "Ilimitados",
      whatsapp: "50/mês por empresa",
    },
  },
  {
    slug: "gestao",
    name: "Gestão",
    price: 299.9,
    tagline: "Para quem já divide a rotina financeira com um time.",
    highlight: true,
    limits: {
      empresas: "1",
      usuarios: "5",
      contador: "1",
      openFinance: "5",
      lancamentos: "Ilimitados",
      whatsapp: "50/mês por empresa",
    },
  },
  {
    slug: "multiempresa",
    name: "Multiempresa",
    price: 549.9,
    tagline: "Para redes e grupos com mais de um CNPJ.",
    limits: {
      empresas: "3",
      usuarios: "15",
      contador: "3",
      openFinance: "12",
      lancamentos: "Ilimitados",
      whatsapp: "50/mês por empresa",
    },
  },
];

export const PLAN_FEATURE_ROWS: { label: string; key: keyof FinancePlan["limits"] }[] = [
  { label: "Empresas / CNPJs", key: "empresas" },
  { label: "Usuários", key: "usuarios" },
  { label: "Acessos para contador", key: "contador" },
  { label: "Conexões Open Finance", key: "openFinance" },
  { label: "Lançamentos", key: "lancamentos" },
  { label: "Alertas pelo WhatsApp", key: "whatsapp" },
];

/** Meses gratuitos do programa Fidelidade 360 (1º, 5º e 9º mês). */
export const FIDELIDADE_FREE_MONTHS = [1, 5, 9];

export const FIDELIDADE_TEXT = {
  title: "Fidelidade 360",
  claim: "Use por 12 meses e pague apenas 9 mensalidades.",
  detail:
    "O 1º, o 5º e o 9º mês são gratuitos. A cobrança continua mensal — é um programa de fidelidade, não um plano anual. A condição se aplica ao Financeiro 360° e está sujeita aos termos da oferta.",
};

export const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ====================== PILARES POR MÓDULO ====================== */

export const FINANCE_PILLARS = [
  {
    title: "Controle do dia a dia",
    items: [
      "Lançamentos ilimitados",
      "Contas a pagar e a receber",
      "Clientes e fornecedores",
      "Cartões e formas de pagamento",
    ],
  },
  {
    title: "Bancos conectados",
    items: [
      "Open Finance",
      "Importação de movimentações do extrato",
      "Contas financeiras",
      "Conciliação bancária",
    ],
  },
  {
    title: "Visão do futuro",
    items: ["Fluxo de caixa", "Compromissos futuros", "Orçamento por categoria"],
  },
  {
    title: "Resultado do negócio",
    items: ["DRE gerencial", "Relatórios", "Categorias e subcategorias", "Centros de custo"],
  },
  {
    title: "Menos trabalho manual",
    items: [
      "IA assistida na organização das movimentações",
      "Sugestão de categoria por histórico",
      "Alertas pelo WhatsApp",
    ],
  },
  {
    title: "Equipe e contador conectados",
    items: ["Usuários por perfil", "Acesso para contabilidade", "Exportações", "Multiempresa"],
  },
];

export const DP_PILLARS = [
  {
    title: "Colaboradores organizados",
    items: ["Cadastro completo", "Cargos e unidades", "Turnos e jornada", "Sindicatos", "Pendências"],
  },
  {
    title: "Escalas e rotina da operação",
    items: ["Operação do dia", "Escala mensal", "Geração de escala", "Calendário", "Convocações"],
  },
  {
    title: "Folgas e férias",
    items: [
      "Solicitações e aprovações",
      "Trocas entre colaboradores",
      "Férias e regras",
      "Datas bloqueadas",
      "Apoio no acompanhamento de descanso semanal",
    ],
  },
  {
    title: "Documentos e históricos",
    items: [
      "Documentos por colaborador",
      "Adiantamentos",
      "Atestados",
      "Registros disciplinares",
      "ACT/CCT e histórico",
    ],
  },
  {
    title: "Comunicação",
    items: ["Mensagens e modelos", "Quadro de avisos", "Notificações"],
  },
  {
    title: "Portal do Colaborador",
    items: [
      "Mural e cadastro",
      "Escala e calendário",
      "Convocações e trocas",
      "Solicitações",
      "Documentos e histórico",
    ],
  },
];

export const COST_CENTER_EXAMPLES = ["Cozinha", "Bar", "Salão", "Delivery", "Marketing", "Administrativo"];

export const BUSINESS_TYPES = [
  { value: "bar", label: "Bar" },
  { value: "restaurante", label: "Restaurante" },
  { value: "lanchonete", label: "Lanchonete" },
  { value: "cafeteria", label: "Cafeteria" },
  { value: "pizzaria", label: "Pizzaria" },
  { value: "rede", label: "Rede de unidades" },
  { value: "dark_kitchen", label: "Dark kitchen" },
  { value: "buffet", label: "Buffet" },
  { value: "outro", label: "Outro" },
];

export const INTEREST_OPTIONS = [
  { value: "financeiro", label: "Financeiro 360°" },
  { value: "dp", label: "Pessoas 360°" },
  { value: "ambos", label: "Financeiro e DP" },
];

export const HEADCOUNT_OPTIONS = [
  { value: "1-10", label: "Até 10 colaboradores" },
  { value: "11-30", label: "11 a 30 colaboradores" },
  { value: "31-80", label: "31 a 80 colaboradores" },
  { value: "80+", label: "Mais de 80 colaboradores" },
];

export const BLOG_CATEGORIES = [
  "Gestão financeira para restaurantes",
  "Indicadores e DRE",
  "Fluxo de caixa",
  "Gestão de equipes e escalas",
  "Legislação e boas práticas de DP",
  "Gestão de redes e operações",
];
