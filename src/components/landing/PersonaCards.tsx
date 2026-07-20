import { Building2, Check, Sparkles, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useLandingSection } from "@/hooks/useLandingContent";
import { CtaPrimary } from "./CtaPrimary";

export function PersonaCards({ utm }: { utm: string }) {
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
