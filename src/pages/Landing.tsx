import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
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
  Instagram,
  Menu,
  X as XIcon,
} from "lucide-react";
import { useLandingSection } from "@/hooks/useLandingContent";
import { ContactSection } from "@/components/landing/ContactSection";
import { Logo } from "@/components/Logo";
import { WhatsappButton } from "@/components/WhatsappButton";
import heroDashboard from "@/assets/hero-dashboard.png.asset.json";


type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_period: string;
  trial_days: number;
  sort_order: number;
  is_featured: boolean;
  featured_label: string | null;
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

type GtagWindow = Window & {
  dataLayer?: Record<string, unknown>[];
  gtag?: (...args: unknown[]) => void;
};

function trackCta(source: string, ctaText = "Começe Grátis") {
  try {
    const w = window as GtagWindow;
    const payload = {
      cta_source: source,
      cta_text: ctaText,
      cta_destination: "/auth?tab=signup",
      page_location: window.location.href,
      page_path: window.location.pathname,
    };

    // GTM / dataLayer
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: "cta_click_trial", ...payload });

    // GA4 (gtag.js) — evento customizado + generate_lead como conversão
    if (typeof w.gtag === "function") {
      w.gtag("event", "cta_click_trial", {
        event_category: "landing_cta",
        event_label: source,
        ...payload,
      });
      w.gtag("event", "generate_lead", {
        currency: "BRL",
        value: 0,
        method: source,
        ...payload,
      });
    }
  } catch {
    // noop
  }
}

function CtaPrimary({
  utm,
  label = "Começe Grátis",
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
      <Link to={href} onClick={() => trackCta(source, label)}>

        {label}
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Link>
    </Button>
  );
}

/* ----------------------------- Header ----------------------------- */
function PublicHeader({ utm }: { utm: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navLinks = [
    { label: "Início", href: "#" },
    { label: "Comparativo", href: "#comparativo" },
    { label: "Recursos", href: "#recursos" },
    { label: "Planos", href: "#planos" },
    { label: "FAQ", href: "#faq" },
    { label: "Contato", href: "#contato" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="container mx-auto flex h-14 items-center justify-between px-3 sm:h-16 sm:px-4">
        <Logo size="sm" linkTo="/" className="h-9 sm:h-10" />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              onClick={(e) => {
                if (l.href.startsWith("#")) {
                  e.preventDefault();
                  const id = l.href.slice(1);
                  if (id) {
                    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
                  } else {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }
              }}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to={buildCta("/auth", utm)}>Entrar</Link>
          </Button>
          <CtaPrimary
            utm={utm}
            source="header"
            label="Começe Grátis"
            size="sm"
            className="hidden sm:flex h-9 px-3 text-xs sm:text-sm"
          />

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((s) => !s)}
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          >
            {mobileOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="border-t border-border/60 bg-background/95 backdrop-blur-md md:hidden">
          <nav className="container mx-auto flex flex-col px-3 py-2">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                onClick={(e) => {
                  setMobileOpen(false);
                  if (l.href.startsWith("#")) {
                    e.preventDefault();
                    const id = l.href.slice(1);
                    if (id) {
                      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
                    } else {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }
                }}
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border/60 px-3 pt-3">
              <Button asChild variant="ghost" size="sm" className="justify-start">
                <Link to={buildCta("/auth", utm)}>Entrar</Link>
              </Button>
              <CtaPrimary
                utm={utm}
                source="header_mobile"
                label="Começe Grátis"
                size="sm"
                className="w-full"
              />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

/* ----------------------------- Hero mockup (visual fixo) ----------------------------- */
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
        <img
          src={heroDashboard.url}
          alt="Dashboard do Gestor Plin com saldo, receitas, despesas e contas bancárias"
          loading="lazy"
          className="block w-full h-auto"
        />
      </Card>
    </div>
  );
}


/* ----------------------------- Hero ----------------------------- */
function HeroSection({ utm }: { utm: string }) {
  const c = useLandingSection("hero");
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
            {c.badge}
          </Badge>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {c.title_prefix}<span className="text-primary">{c.title_highlight}</span>{c.title_suffix}
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground sm:mt-5 sm:text-lg">
            {c.subtitle}
          </p>

          <ul className="mt-5 space-y-2 sm:mt-6">
            {c.bullets.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm text-foreground/90">
                <Check className="h-4 w-4 text-success" /> {b}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-3 sm:mt-7 sm:flex-row">
            <CtaPrimary
              utm={utm}
              source="hero_primary"
              label={c.cta_primary}
              className="w-full text-base sm:w-auto"
            />
            <Button asChild size="lg" variant="outline" className="w-full text-base sm:w-auto">
              <a href="#comparativo">{c.cta_secondary}</a>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground sm:text-sm">
            <span className="flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-warning text-warning" /> {c.trust_satisfaction}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" /> {c.trust_users}
            </span>
            <span className="flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-primary" /> {c.trust_devices}
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
  const c = useLandingSection("personas_strip");
  return (
    <section className="border-y border-border/60 bg-muted/30 py-6">
      <div className="container mx-auto px-4">
        <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {c.label}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {c.items.map((i) => (
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
  const c = useLandingSection("comparison");
  return (
    <section id="comparativo" className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            {c.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {c.title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">
            {c.subtitle}
          </p>
        </div>

        <Card className="mx-auto mt-8 max-w-5xl overflow-hidden border-border/60 sm:mt-10">
          <div className="grid grid-cols-[1.1fr_1fr_1fr] divide-x divide-border/60 border-b border-border/60 bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
            <div className="px-3 py-3 sm:px-5 sm:py-4">{c.col_resource}</div>
            <div className="px-3 py-3 sm:px-5 sm:py-4">{c.col_spreadsheet}</div>
            <div className="bg-primary/5 px-3 py-3 text-primary sm:px-5 sm:py-4">{c.col_plin}</div>
          </div>
          {c.rows.map((r, i) => (
            <div
              key={`${r.k}-${i}`}
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
          <CtaPrimary utm={utm} source="comparison" label={c.cta_label} />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Personas cards ----------------------------- */
function PersonaCards({ utm }: { utm: string }) {
  const c = useLandingSection("persona_cards");
  const icons = { pf: User, mei: Sparkles, pj: Building2 } as const;
  return (
    <section className="border-t border-border/60 bg-muted/30 py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            {c.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {c.title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">
            {c.subtitle}
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-5 sm:mt-12 sm:gap-6 md:grid-cols-3">
          {c.cards.map((p) => {
            const Icon = icons[p.persona] ?? User;
            return (
              <Card key={p.tag} className="flex flex-col border-border/60">
                <CardContent className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
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
                    label={p.cta_label}
                    className="mt-5 w-full"
                    size="default"
                    extra={{ persona: p.persona }}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Features ----------------------------- */
function FeaturesGrid() {
  const c = useLandingSection("features");
  const icons = [Wallet, LineChart, TrendingUp, Users, ShieldCheck, Clock];
  return (
    <section id="recursos" className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            {c.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {c.title}
          </h2>
        </div>
        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {c.items.map((f, i) => {
            const Icon = icons[i % icons.length];
            return (
              <Card
                key={`${f.title}-${i}`}
                className="border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <CardContent className="p-5 sm:p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold sm:text-lg">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Guarantee strip ----------------------------- */
function GuaranteeStrip({ utm }: { utm: string }) {
  const c = useLandingSection("guarantee");
  return (
    <section className="border-y border-border/60 bg-primary/5 py-8 sm:py-10">
      <div className="container mx-auto flex flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold sm:text-lg">{c.title}</p>
            <p className="text-xs text-muted-foreground sm:text-sm">{c.subtitle}</p>
          </div>
        </div>
        <CtaPrimary utm={utm} source="guarantee" label={c.cta_label} />
      </div>
    </section>
  );
}

/* ----------------------------- Pricing ----------------------------- */
function PricingSection({ utm }: { utm: string }) {
  const intro = useLandingSection("pricing_intro");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("plans")
        .select(
          "id, slug, name, description, price_cents, billing_period, trial_days, sort_order, is_featured, featured_label, features"
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
            {intro.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {intro.title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">
            {intro.subtitle}
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
                const featured = !!p.is_featured;
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
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">{p.featured_label || "Mais popular"}</Badge>
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
                          Começe Grátis
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
  const c = useLandingSection("faq");
  return (
    <section id="faq" className="border-t border-border/60 bg-muted/30 py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            {c.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {c.title}
          </h2>
        </div>
        <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:mt-10 md:grid-cols-2">
          {c.items.map((f, i) => (
            <Card key={`${f.q}-${i}`} className="border-border/60">
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
  const c = useLandingSection("final_cta");
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
              {c.title}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-sidebar-foreground/80 sm:mt-4 sm:text-base">
              {c.subtitle}
            </p>
            <div className="mt-6 flex justify-center sm:mt-8">
              <CtaPrimary
                utm={utm}
                source="final_cta"
                label={c.cta_label}
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
  const c = useLandingSection("footer");
  const copy = c.copyright.replace("{year}", String(new Date().getFullYear()));
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="container mx-auto px-4 py-8 sm:py-10">
        {/* Linha 1: Marca + navegação */}
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Logo size="sm" linkTo="/" className="h-8" />
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <Link to="/auth" className="hover:text-foreground">{c.link_login}</Link>
            <a href="#planos" className="hover:text-foreground">{c.link_plans}</a>
            <a href="#faq" className="hover:text-foreground">{c.link_faq}</a>
            <a href="#contato" className="hover:text-foreground">Contato</a>
            <a
              href="https://www.instagram.com/gestorplin"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Instagram className="h-3.5 w-3.5" />
              @gestorplin
            </a>
          </div>
        </div>

        {/* Linha 2: Bloco legal LGPD (destacado) */}
        <div className="mt-6 border-t border-border/60 pt-6">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Privacidade & Conformidade LGPD
            </p>
            <nav
              aria-label="Documentos legais"
              className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-medium text-foreground/80"
            >
              <Link to="/privacidade" className="hover:text-primary hover:underline underline-offset-4">{c.link_privacy}</Link>
              <Link to="/termos" className="hover:text-primary hover:underline underline-offset-4">{c.link_terms}</Link>
              <Link to="/cookies" className="hover:text-primary hover:underline underline-offset-4">{c.link_cookies}</Link>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("plin:cookie-settings-open"))}
                className="hover:text-primary hover:underline underline-offset-4"
              >
                {c.link_cookie_settings}
              </button>
              <Link to="/encarregado-dados" className="hover:text-primary hover:underline underline-offset-4">{c.link_dpo}</Link>
            </nav>
          </div>
          <p className="mt-4 text-center text-[11px] text-muted-foreground sm:text-left">{copy}</p>
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
        <ContactSection />
        <FinalCta utm={utm} />
      </main>
      <PublicFooter />
      <WhatsappButton message="Olá! Vim pelo site e gostaria de saber mais sobre o Gestor Plin." />
    </div>
  );
}
