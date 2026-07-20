import { Clock, LineChart, ShieldCheck, TrendingUp, Users, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLandingSection } from "@/hooks/useLandingContent";

export function FeaturesGrid() {
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
