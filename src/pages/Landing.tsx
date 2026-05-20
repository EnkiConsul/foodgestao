import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TreePine,
  ArrowRight,
  Check,
  Wallet,
  LineChart,
  Target,
  TrendingUp,
  Users,
  ShieldCheck,
  Eye,
  Sparkles,
  Building2,
  User,
  Menu,
} from "lucide-react";

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_period: string;
  trial_days: number;
  sort_order: number;
  features: Record<string, unknown> | null;
};

const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });

const features = [
  {
    icon: Wallet,
    title: "Contas a pagar e receber unificadas",
    desc: "Todos os lançamentos em um único lugar, com vencimentos, status e anexos.",
  },
  {
    icon: LineChart,
    title: "Dashboard inteligente",
    desc: "Saldos, evolução mensal e top categorias atualizados em tempo real.",
  },
  {
    icon: Target,
    title: "Orçamentos com alertas",
    desc: "Defina limites por categoria e receba avisos em 70%, 90% e 100%.",
  },
  {
    icon: TrendingUp,
    title: "Fluxo de caixa projetado",
    desc: "Veja o saldo futuro com base nas suas contas e lançamentos previstos.",
  },
  {
    icon: Users,
    title: "Multiusuário e perfis de acesso",
    desc: "Convide sua equipe com permissões granulares por módulo.",
  },
  {
    icon: ShieldCheck,
    title: "Privacidade e LGPD",
    desc: "Modo privacidade com um clique e dados protegidos por RLS.",
  },
];

const pfItems = [
  "Controle do orçamento doméstico",
  "Cartões, contas e investimentos",
  "Metas e categorias pessoais",
  "Modo privacidade para mostrar a tela",
];

const pjItems = [
  "Multiempresa com contexto isolado",
  "Equipe com perfis de acesso",
  "Contas a pagar/receber e DRE",
  "Relatórios e exportações fiscais",
];

const steps = [
  { n: "01", title: "Crie sua conta", desc: "Cadastro em segundos, sem cartão de crédito." },
  { n: "02", title: "Onboarding em 4 passos", desc: "Perfil, dados, primeira conta e categorias." },
  { n: "03", title: "Comece a controlar", desc: "Lance, organize e visualize seu dinheiro." },
];

const faqs = [
  {
    q: "Preciso de cartão de crédito para testar?",
    a: "Não. O teste de 14 dias é liberado na hora, sem pedir cartão.",
  },
  {
    q: "Posso usar para finanças pessoais e da empresa?",
    a: "Sim. O Gestor Plin foi feito para alternar entre Pessoa Física e Pessoa Jurídica na mesma conta, com dados totalmente isolados.",
  },
  {
    q: "Meus dados estão seguros?",
    a: "Usamos criptografia em trânsito, isolamento por usuário/empresa (RLS) e seguimos a LGPD. Você pode exportar ou excluir seus dados a qualquer momento.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Sem fidelidade. Cancele com 1 clique nas configurações.",
  },
];

function PublicHeader() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#recursos", label: "Recursos" },
    { href: "#pf-pj", label: "PF x PJ" },
    { href: "#planos", label: "Planos" },
    { href: "#faq", label: "FAQ" },
  ];
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-14 items-center justify-between px-3 sm:h-16 sm:px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground sm:h-9 sm:w-9">
            <TreePine className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <span className="text-base font-bold tracking-tight text-foreground sm:text-lg">
            Gestor <span className="text-primary">Plin</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button asChild size="sm" className="h-9 px-3 text-xs sm:text-sm">
            <Link to="/auth?tab=signup">
              <span className="sm:hidden">Testar grátis</span>
              <span className="hidden sm:inline">Iniciar teste grátis</span>
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border/60 bg-background md:hidden">
          <div className="container mx-auto flex flex-col gap-2 px-4 py-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2">
              <Button asChild variant="outline" size="sm" className="flex-1">
                <Link to="/auth">Entrar</Link>
              </Button>
              <Button asChild size="sm" className="flex-1">
                <Link to="/auth?tab=signup">Testar grátis</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function HeroMockup() {
  return (
    <div className="relative">
      <div
        className="absolute -inset-6 -z-10 rounded-3xl opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 40%, hsl(var(--primary) / 0.25), transparent 70%)",
        }}
      />
      <Card className="overflow-hidden border-border/60 shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/50 px-3 py-2 sm:px-4 sm:py-2.5">
          <span className="h-2 w-2 rounded-full bg-destructive/70 sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 rounded-full bg-warning/70 sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 rounded-full bg-success/70 sm:h-2.5 sm:w-2.5" />
          <span className="ml-2 truncate text-[10px] text-muted-foreground sm:ml-3 sm:text-xs">
            app.gestorplin.com / dashboard
          </span>
        </div>
        <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-5">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: "Saldo", value: "R$ 48.2k", tone: "text-foreground" },
              { label: "A receber", value: "R$ 12.4k", tone: "text-success" },
              { label: "A pagar", value: "R$ 6.8k", tone: "text-warning" },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border/60 bg-card p-2 sm:p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">{k.label}</p>
                <p className={`mt-1 text-sm font-semibold sm:text-lg ${k.tone}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Evolução dos últimos 6 meses</p>
              <Badge variant="secondary" className="text-[10px]">Pago</Badge>
            </div>
            <div className="flex h-24 items-end gap-2">
              {[40, 55, 48, 70, 62, 85].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-md bg-gradient-to-t from-primary/30 to-primary"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {[
              { t: "Aluguel escritório", c: "Despesa fixa", v: "- R$ 2.400", tag: "Pago", tone: "text-destructive" },
              { t: "Cliente Acme — NF 1182", c: "Receita", v: "+ R$ 4.800", tag: "A vencer", tone: "text-success" },
              { t: "Energia elétrica", c: "Utilidades", v: "- R$ 380", tag: "Atrasado", tone: "text-destructive" },
            ].map((r) => (
              <div
                key={r.t}
                className="flex items-center justify-between rounded-md border border-border/40 bg-background/60 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.t}</p>
                  <p className="text-xs text-muted-foreground">{r.c}</p>
                </div>
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <Badge variant="outline" className="text-[10px]">{r.tag}</Badge>
                  <span className={`font-semibold ${r.tone}`}>{r.v}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.12), transparent 70%)",
        }}
      />
      <div className="container mx-auto grid gap-10 px-4 py-12 sm:py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-28">
        <div>
          <Badge variant="secondary" className="mb-4 gap-1.5 sm:mb-5">
            <Sparkles className="h-3.5 w-3.5" />
            Novo · Teste grátis por 14 dias
          </Badge>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Suas finanças <span className="text-primary">pessoais</span> e da{" "}
            <span className="text-primary">empresa</span> em um só lugar.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground sm:mt-5 sm:text-lg">
            O Gestor Plin une controle de contas a pagar e receber, orçamentos, fluxo de caixa e
            relatórios — alternando entre Pessoa Física e Pessoa Jurídica na mesma conta.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
            <Button asChild size="lg" className="w-full text-base sm:w-auto">
              <Link to="/auth?tab=signup">
                Iniciar teste de 14 dias
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full text-base sm:w-auto">
              <a href="#planos">Ver planos</a>
            </Button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:mt-6 sm:gap-x-6 sm:text-sm">
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-success" /> Sem cartão de crédito
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-success" /> Cancele quando quiser
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-success" /> Suporte em português
            </span>
          </div>
        </div>
        <HeroMockup />
      </div>
    </section>
  );
}

function FeaturesGrid() {
  return (
    <section id="recursos" className="border-t border-border/60 bg-muted/30 py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">Recursos</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Tudo que você precisa para tirar o financeiro do papel
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">
            Pensado para MEIs, pequenas empresas e quem quer organizar a vida pessoal sem planilhas.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <CardContent className="p-5 sm:p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold sm:text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function PfPjSection() {
  const [tab, setTab] = useState<"pf" | "pj">("pf");
  const items = tab === "pf" ? pfItems : pjItems;
  return (
    <section id="pf-pj" className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">PF x PJ</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Uma conta. Dois mundos. Zero confusão.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">
            Alterne entre Pessoa Física e Pessoa Jurídica com um clique. Cada contexto tem suas
            contas, categorias e relatórios isolados.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-3xl sm:mt-10">
          <div className="mx-auto mb-6 flex w-full max-w-sm rounded-full border border-border bg-card p-1 sm:mb-8">
            <button
              onClick={() => setTab("pf")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-all sm:gap-2 sm:px-4 sm:text-sm ${
                tab === "pf" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="h-4 w-4" /> Pessoa Física
            </button>
            <button
              onClick={() => setTab("pj")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-all sm:gap-2 sm:px-4 sm:text-sm ${
                tab === "pj" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="h-4 w-4" /> Pessoa Jurídica
            </button>
          </div>

          <Card className="border-border/60">
            <CardContent className="grid gap-4 p-5 sm:gap-6 sm:p-8 sm:grid-cols-2">
              {items.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-sm text-foreground">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <p className="mt-5 text-center text-xs text-muted-foreground sm:text-sm">
            <Eye className="mr-1.5 inline h-4 w-4" />
            Inclui modo privacidade para esconder valores em apresentações.
          </p>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="border-y border-border/60 bg-muted/30 py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">Como funciona</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Pronto para usar em menos de 2 minutos
          </h2>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:mt-12 sm:gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <Card key={s.n} className="border-border/60">
              <CardContent className="p-5 sm:p-6">
                <p className="text-3xl font-bold text-primary/30 sm:text-4xl">{s.n}</p>
                <h3 className="mt-3 text-base font-semibold sm:text-lg">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("plans")
        .select("id, slug, name, description, price_cents, billing_period, trial_days, sort_order, features")
        .eq("is_active", true)
        .eq("is_public", true)
        .order("sort_order", { ascending: true });
      setPlans((data as Plan[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const featureLabel = (key: string, value: unknown): string | null => {
    const v = value as number | boolean | string;
    switch (key) {
      case "max_transactions_per_month":
        return v === -1 ? "Lançamentos ilimitados" : `${v} lançamentos/mês`;
      case "max_companies":
        return v === -1 ? "Empresas ilimitadas" : `${v} empresa${v === 1 ? "" : "s"}`;
      case "max_users_per_company":
        return v === -1 ? "Usuários ilimitados" : `${v} usuário${v === 1 ? "" : "s"} por empresa`;
      case "max_attachments_per_transaction":
        return `${v} anexo${v === 1 ? "" : "s"} por lançamento`;
      case "export_csv":
        return v ? "Exportação em CSV" : null;
      case "export_pdf":
        return v ? "Exportação em PDF" : null;
      case "reports_advanced":
        return v ? "Relatórios avançados" : null;
      case "ai_enabled":
        return v ? "Recursos com IA" : null;
      case "support":
        return v === "community"
          ? "Suporte por comunidade"
          : v === "email"
            ? "Suporte por e-mail"
            : v === "priority"
              ? "Suporte prioritário"
              : v === "dedicated"
                ? "Suporte dedicado"
                : null;
      default:
        return null;
    }
  };

  return (
    <section id="planos" className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">Planos</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Comece grátis. Evolua quando precisar.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">
            Todos os planos pagos incluem 14 dias de teste, sem cartão de crédito.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-6xl gap-5 pt-3 sm:mt-12 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-border/60">
                  <CardContent className="space-y-4 p-5 sm:p-6">
                    <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                    <div className="h-10 w-32 animate-pulse rounded bg-muted" />
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <div key={j} className="h-3 w-full animate-pulse rounded bg-muted" />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            : plans.map((p) => {
                const featured = p.slug === "pro";
                const entries = p.features ? Object.entries(p.features) : [];
                const labels = entries
                  .map(([k, v]) => featureLabel(k, v))
                  .filter((x): x is string => !!x);
                return (
                  <Card
                    key={p.id}
                    className={`relative border-border/60 ${
                      featured ? "border-primary shadow-xl ring-1 ring-primary/40" : ""
                    }`}
                  >
                    {featured && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Mais popular</Badge>
                    )}
                    <CardContent className="flex h-full flex-col p-5 sm:p-6">
                      <h3 className="text-lg font-semibold">{p.name}</h3>
                      {p.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                      )}
                      <div className="mt-4 sm:mt-5">
                        <span className="text-3xl font-bold tracking-tight sm:text-4xl">
                          {formatPrice(p.price_cents)}
                        </span>
                        {p.price_cents > 0 && (
                          <span className="ml-1 text-sm text-muted-foreground">/mês</span>
                        )}
                      </div>
                      {p.trial_days > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {p.trial_days} dias grátis para testar
                        </p>
                      )}
                      <ul className="mt-6 flex-1 space-y-2.5">
                        {labels.slice(0, 6).map((l) => (
                          <li key={l} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                            <span className="text-foreground/90">{l}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        asChild
                        className="mt-6 w-full"
                        variant={featured ? "default" : "outline"}
                      >
                        <Link
                          to={
                            p.price_cents === 0
                              ? "/auth?tab=signup"
                              : `/auth?tab=signup&plan=${p.slug}`
                          }
                        >
                          {p.price_cents === 0 ? "Começar grátis" : "Iniciar teste"}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
        </div>
        
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="border-t border-border/60 bg-muted/30 py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">Perguntas frequentes</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">Tire suas dúvidas</h2>
        </div>
        <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:mt-10 md:grid-cols-2">
          {faqs.map((f) => (
            <Card key={f.q} className="border-border/60">
              <CardContent className="p-5">
                <h3 className="text-base font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl bg-sidebar p-6 text-center text-sidebar-foreground sm:p-10 lg:p-14">
          <div
            className="absolute inset-0 -z-0 opacity-50"
            style={{
              background:
                "radial-gradient(40% 60% at 50% 0%, hsl(var(--sidebar-primary) / 0.3), transparent 70%)",
            }}
          />
          <div className="relative z-10">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              Pronto para colocar suas finanças no piloto automático?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-sidebar-foreground/80 sm:mt-4 sm:text-base">
              14 dias grátis. Sem cartão de crédito. Cancele quando quiser.
            </p>
            <Button asChild size="lg" className="mt-6 w-full text-base sm:mt-8 sm:w-auto" variant="default">
              <Link to="/auth?tab=signup">
                Iniciar teste de 14 dias
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-border/60 bg-background py-10">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <TreePine className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">Gestor Plin</span>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Gestor Plin. Todos os direitos reservados.
        </p>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <Link to="/auth" className="hover:text-foreground">Entrar</Link>
          <a href="#planos" className="hover:text-foreground">Planos</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  useEffect(() => {
    document.title = "Gestor Plin — Controle financeiro pessoal e empresarial";
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main>
        <HeroSection />
        <FeaturesGrid />
        <PfPjSection />
        <HowItWorks />
        <PricingSection />
        <FaqSection />
        <FinalCta />
      </main>
      <PublicFooter />
    </div>
  );
}
