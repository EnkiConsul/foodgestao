import { Check, Sparkles, Star, Users, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLandingSection } from "@/hooks/useLandingContent";
import heroDashboard from "@/assets/hero-dashboard.png.asset.json";
import { CtaPrimary } from "./CtaPrimary";

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
            app.360food.com / dashboard
          </span>
        </div>
        <img
          src={heroDashboard.url}
          alt="Dashboard do 360°FOOD com saldo, receitas, despesas e contas financeiras"
          loading="lazy"
          className="block w-full h-auto"
        />
      </Card>
    </div>
  );
}

export function HeroSection({ utm }: { utm: string }) {
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
