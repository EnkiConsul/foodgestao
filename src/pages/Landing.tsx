import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TreePine,
  ArrowRight,
  Check,
  X,
  Wallet,
  LineChart,
  TrendingUp,
  Users,
  ShieldCheck,
  Sparkles,
  Building2,
  User,
  HeartHandshake,
  Star,
  Clock,
  Smartphone,
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

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
];

function useUtmQuery() {
  const { search } = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    const out = new URLSearchParams();
    UTM_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) out.set(k, v);
    });
    return out.toString();
  }, [search]);
}

function buildCta(base: string, utm: string, extra?: Record<string, string>) {
  const u = new URL(base, "https://x.local");
  if (extra) Object.entries(extra).forEach(([k, v]) => u.searchParams.set(k, v));
  if (utm) {
    const e = new URLSearchParams(utm);
    e.forEach((v, k) => u.searchParams.set(k, v));
  }
  return u.pathname + (u.search ? u.search : "");
}

function trackCta(label: string) {
  try {
    // dataLayer push (consumed by GTM/Meta Pixel/Google Ads when configured)
    (window as unknown as { dataLayer?: unknown[] }).dataLayer =
      (window as unknown as { dataLayer?: unknown[] }).dataLayer || [];
    (window as unknown as { dataLayer: unknown[] }).dataLayer.push({
      event: "cta_click_trial",
      cta_label: label,
    });
  } catch {
    // noop
  }
}

function CtaPrimary({
  utm,
  label = "Começar teste grátis",
  source,
  className = "",
  size = "lg",
  extra,
}: {
  utm: string;
  label?: string;
  source: string;
  className?: string;
  size?: "default" | "sm" | "lg";
  extra?: Record<string, string>;
}) {
  const href = buildCta("/auth?tab=signup", utm, extra);
  return (
    <Button asChild size={size} className={className}>
      <Link to={href} onClick={() => trackCta(source)}>
        {label}
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Link>
    </Button>
  );
}

/* ----------------------------- Header ----------------------------- */
function PublicHeader({ utm }: { utm: string }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="container mx-auto flex h-14 items-center justify-between px-3 sm:h-16 sm:px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground sm:h-9 sm:w-9">
            <TreePine className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <span className="text-base font-bold tracking-tight text-foreground sm:text-lg">
            Gestor <span className="text-primary">Plin</span>
          </span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to={buildCta("/auth", utm)}>Entrar</Link>
          </Button>
          <CtaPrimary
            utm={utm}
            source="header"
            label="Testar 14 dias grátis"
            size="sm"
            className="h-9 px-3 text-xs sm:text-sm"
          />
        </div>
      </div>
    </header>
  );
}

/* ----------------------------- Hero mockup ----------------------------- */
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
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                  {k.label}
                </p>
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

/* ----------------------------- Hero ----------------------------- */
function HeroSection({ utm }: { utm: string }) {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.12), transparent 70%)",
        }}
      />
      <div className="container mx-auto grid gap-10 px-4 py-12 sm:py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
        <div>
          <Badge variant="secondary" className="mb-4 gap-1.5 sm:mb-5">
            <Sparkles className="h-3.5 w-3.5" />
            Teste grátis 14 dias · sem cartão
          </Badge>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Controle financeiro <span className="text-primary">pessoal e da sua empresa</span>, sem planilha.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground sm:mt-5 sm:text-lg">
            Para MEI, autônomos, pequenas empresas e finanças pessoais. Contas a pagar e receber,
            fluxo de caixa projetado e relatórios — em uma só conta, com troca de PF/PJ em 1 clique.
          </p>

          <ul className="mt-5 space-y-2 sm:mt-6">
            {[
              "Sem cartão de crédito para testar",
              "Cancele em 1 clique, sem fidelidade",
              "Dados protegidos (LGPD) e em servidores no Brasil",
            ].map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm text-foreground/90">
                <Check className="h-4 w-4 text-success" /> {b}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-3 sm:mt-7 sm:flex-row">
            <CtaPrimary
              utm={utm}
              source="hero_primary"
              label="Começar teste de 14 dias"
              className="w-full text-base sm:w-auto"
            />
            <Button asChild size="lg" variant="outline" className="w-full text-base sm:w-auto">
              <a href="#comparativo">Ver como funciona</a>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground sm:text-sm">
            <span className="flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-warning text-warning" /> 4.9 em satisfação
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" /> Usado por MEIs e PMEs
            </span>
            <span className="flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-primary" /> Mobile e desktop
            </span>
          </div>
        </div>
        <HeroMockup />
      </div>
    </section>
  );
}

/* ----------------------------- Personas strip ----------------------------- */
function PersonasStrip() {
  const items = ["MEI", "Autônomos", "Pequenas empresas", "Famílias", "Casais", "Freelancers"];
  return (
    <section className="border-y border-border/60 bg-muted/30 py-6">
      <div className="container mx-auto px-4">
        <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Feito para
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {items.map((i) => (
            <span
              key={i}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/80 sm:text-sm"
            >
              {i}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Spreadsheet vs Plin ----------------------------- */
function ComparisonSection({ utm }: { utm: string }) {
  const rows = [
    { k: "Atualização", a: "Manual e demorada", b: "Lançamentos rápidos com categorização" },
    { k: "Fluxo de caixa futuro", a: "Fórmulas que quebram", b: "Projeção automática por conta" },
    { k: "Alertas de vencimento", a: "Você precisa lembrar", b: "Avisos de A Vencer e Atrasado" },
    { k: "Multiusuário", a: "Conflito de versões", b: "Equipe com perfis de acesso" },
    { k: "Acesso mobile", a: "Sofrível no celular", b: "Responsivo, otimizado para mobile" },
    { k: "Backup e segurança", a: "Por sua conta", b: "Backup automático e LGPD" },
    { k: "Relatórios", a: "Você monta do zero", b: "DRE, categorias e exportações prontos" },
  ];
  return (
    <section id="comparativo" className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            Planilha vs Gestor Plin
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Saia da planilha sem perder o controle
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">
            Por que centenas de MEIs e pequenas empresas estão substituindo o Excel pelo Gestor Plin.
          </p>
        </div>

        <Card className="mx-auto mt-8 max-w-5xl overflow-hidden border-border/60 sm:mt-10">
          <div className="grid grid-cols-[1.1fr_1fr_1fr] divide-x divide-border/60 border-b border-border/60 bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
            <div className="px-3 py-3 sm:px-5 sm:py-4">Recurso</div>
            <div className="px-3 py-3 sm:px-5 sm:py-4">Planilha</div>
            <div className="bg-primary/5 px-3 py-3 text-primary sm:px-5 sm:py-4">Gestor Plin</div>
          </div>
          {rows.map((r, i) => (
            <div
              key={r.k}
              className={`grid grid-cols-[1.1fr_1fr_1fr] divide-x divide-border/60 text-sm ${
                i % 2 === 1 ? "bg-muted/20" : ""
              }`}
            >
              <div className="px-3 py-3 font-medium text-foreground sm:px-5 sm:py-4">{r.k}</div>
              <div className="flex items-start gap-2 px-3 py-3 text-muted-foreground sm:px-5 sm:py-4">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>{r.a}</span>
              </div>
              <div className="flex items-start gap-2 bg-primary/5 px-3 py-3 text-foreground sm:px-5 sm:py-4">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>{r.b}</span>
              </div>
            </div>
          ))}
        </Card>

        <div className="mt-8 flex justify-center">
          <CtaPrimary utm={utm} source="comparison" label="Quero testar grátis" />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Personas cards ----------------------------- */
function PersonaCards({ utm }: { utm: string }) {
  const personas = [
    {
      icon: User,
      tag: "Pessoal",
      title: "Para você e sua família",
      bullets: ["Orçamento doméstico", "Cartões e contas", "Modo privacidade para apresentar"],
      persona: "pf",
    },
    {
      icon: Sparkles,
      tag: "MEI",
      title: "Para MEIs e autônomos",
      bullets: ["DAS, NFs e clientes", "Lançamentos recorrentes", "Relatórios para o contador"],
      persona: "mei",
    },
    {
      icon: Building2,
      tag: "Empresa",
      title: "Para pequenas empresas",
      bullets: ["Multiempresa isolada", "Equipe com permissões", "Contas a pagar/receber e DRE"],
      persona: "pj",
    },
  ];
  return (
    <section className="border-t border-border/60 bg-muted/30 py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            Para quem é
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Uma conta, três jeitos de usar
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">
            Alterne entre Pessoa Física e Pessoa Jurídica em 1 clique — dados isolados, mesma conta.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-5 sm:mt-12 sm:gap-6 md:grid-cols-3">
          {personas.map((p) => (
            <Card key={p.tag} className="flex flex-col border-border/60">
              <CardContent className="flex flex-1 flex-col p-5 sm:p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <p.icon className="h-5 w-5" />
                </div>
                <Badge variant="secondary" className="mt-4 w-fit text-[10px]">{p.tag}</Badge>
                <h3 className="mt-2 text-lg font-semibold">{p.title}</h3>
                <ul className="mt-4 flex-1 space-y-2">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-foreground/90">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <CtaPrimary
                  utm={utm}
                  source={`persona_${p.persona}`}
                  label="Testar grátis"
                  className="mt-5 w-full"
                  size="default"
                  extra={{ persona: p.persona }}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Features ----------------------------- */
function FeaturesGrid() {
  const features = [
    {
      icon: Wallet,
      title: "Contas a pagar e receber unificadas",
      desc: "Todos os lançamentos com vencimentos, status, recorrências e anexos.",
    },
    {
      icon: LineChart,
      title: "Dashboard inteligente",
      desc: "Saldos, evolução mensal e top categorias em tempo real.",
    },
    {
      icon: TrendingUp,
      title: "Fluxo de caixa projetado",
      desc: "Veja o saldo futuro com base nas suas contas e lançamentos previstos.",
    },
    {
      icon: Users,
      title: "Multiusuário e perfis",
      desc: "Convide sua equipe com permissões granulares por módulo.",
    },
    {
      icon: ShieldCheck,
      title: "Privacidade e LGPD",
      desc: "Modo privacidade, dados isolados por usuário/empresa (RLS).",
    },
    {
      icon: Clock,
      title: "Pronto em 2 minutos",
      desc: "Onboarding guiado: perfil, dados, primeira conta e categorias.",
    },
  ];
  return (
    <section id="recursos" className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            Recursos
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Tudo que você precisa para tirar o financeiro do papel
          </h2>
        </div>
        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {features.map((f) => (
            <Card
              key={f.title}
              className="border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
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

/* ----------------------------- Guarantee strip ----------------------------- */
function GuaranteeStrip({ utm }: { utm: string }) {
  return (
    <section className="border-y border-border/60 bg-primary/5 py-8 sm:py-10">
      <div className="container mx-auto flex flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold sm:text-lg">14 dias grátis · sem cartão · cancele quando quiser</p>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Acesso completo durante o teste. Sem letrinhas miúdas.
            </p>
          </div>
        </div>
        <CtaPrimary utm={utm} source="guarantee" label="Quero começar agora" />
      </div>
    </section>
  );
}

/* ----------------------------- Pricing ----------------------------- */
function PricingSection({ utm }: { utm: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("plans")
        .select(
          "id, slug, name, description, price_cents, billing_period, trial_days, sort_order, features"
        )
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
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            Planos
          </p>
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
                const href = buildCta(
                  p.price_cents === 0 ? "/auth?tab=signup" : `/auth?tab=signup&plan=${p.slug}`,
                  utm
                );
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
                        <Link to={href} onClick={() => trackCta(`pricing_${p.slug}`)}>
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

/* ----------------------------- FAQ ----------------------------- */
function FaqSection() {
  const faqs = [
    {
      q: "Preciso de cartão de crédito para testar?",
      a: "Não. O teste de 14 dias é liberado na hora, sem pedir cartão.",
    },
    {
      q: "Funciona para MEI e pessoa física na mesma conta?",
      a: "Sim. Você alterna entre Pessoa Física e Pessoa Jurídica com 1 clique, com dados totalmente isolados.",
    },
    {
      q: "Meus dados estão seguros?",
      a: "Criptografia em trânsito, isolamento por usuário/empresa (RLS) e conformidade com a LGPD. Você pode exportar ou excluir os dados a qualquer momento.",
    },
    {
      q: "Posso cancelar quando quiser?",
      a: "Sim. Sem fidelidade. Cancele em 1 clique nas configurações.",
    },
  ];
  return (
    <section id="faq" className="border-t border-border/60 bg-muted/30 py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            Perguntas frequentes
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Tire suas dúvidas
          </h2>
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

/* ----------------------------- Final CTA ----------------------------- */
function FinalCta({ utm }: { utm: string }) {
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
              Pronto para tirar o financeiro da planilha?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-sidebar-foreground/80 sm:mt-4 sm:text-base">
              14 dias grátis. Sem cartão de crédito. Cancele quando quiser.
            </p>
            <div className="mt-6 flex justify-center sm:mt-8">
              <CtaPrimary
                utm={utm}
                source="final_cta"
                label="Iniciar teste de 14 dias"
                className="w-full text-base sm:w-auto"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Footer ----------------------------- */
function PublicFooter() {
  return (
    <footer className="border-t border-border/60 bg-background py-8 sm:py-10">
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

/* ----------------------------- Page ----------------------------- */
export default function Landing() {
  const utm = useUtmQuery();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader utm={utm} />
      <main>
        <HeroSection utm={utm} />
        <PersonasStrip />
        <ComparisonSection utm={utm} />
        <PersonaCards utm={utm} />
        <FeaturesGrid />
        <GuaranteeStrip utm={utm} />
        <PricingSection utm={utm} />
        <FaqSection />
        <FinalCta utm={utm} />
      </main>
      <PublicFooter />
    </div>
  );
}
