import { CalendarCheck, CreditCard, Gift, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLandingSection } from "@/hooks/useLandingContent";
import { buildCycleTimeline } from "@/lib/billing/fidelidade360";

const ICONS = [CreditCard, CalendarCheck, Gift, Receipt];

/** Explica o Programa Fidelidade 360 e mostra o ciclo de 12 meses. */
export function Fidelidade360Section() {
  const c = useLandingSection("loyalty");
  const timeline = buildCycleTimeline(1);

  return (
    <section id="fidelidade360" className="bg-muted/30 py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            {c.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {c.title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">{c.subtitle}</p>
        </div>

        <div className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {c.steps.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <Card key={s.title} className="border-border/60">
                <CardContent className="p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold sm:text-base">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mx-auto mt-10 max-w-4xl">
          <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {c.timeline_title}
          </h3>
          <ol className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {timeline.map((m) => (
              <li
                key={m.month}
                className={`rounded-lg border p-2 text-center text-xs ${
                  m.charged
                    ? "border-border/60 bg-background text-muted-foreground"
                    : "border-primary/40 bg-primary/10 font-semibold text-primary"
                }`}
              >
                <span className="block text-[11px] uppercase tracking-wide">Mês {m.month}</span>
                <span className="mt-1 block">{m.charged ? "Cobra" : "Grátis"}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            {c.timeline_note}
          </p>
        </div>
      </div>
    </section>
  );
}
