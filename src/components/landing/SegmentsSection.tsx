import { Beer, Cake, Coffee, Pizza, Store, UtensilsCrossed } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLandingSection } from "@/hooks/useLandingContent";

const ICONS = [Beer, UtensilsCrossed, Pizza, Coffee, Store, Cake];

export function SegmentsSection() {
  const c = useLandingSection("segments");
  return (
    <section id="segmentos" className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            {c.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {c.title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">{c.subtitle}</p>
        </div>

        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {c.items.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <Card
                key={`${s.title}-${i}`}
                className="border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <CardContent className="flex gap-4 p-5 sm:p-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold sm:text-lg">{s.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
