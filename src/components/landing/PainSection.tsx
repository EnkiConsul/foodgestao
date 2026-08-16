import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useLandingSection } from "@/hooks/useLandingContent";

export function PainSection() {
  const c = useLandingSection("pain");
  return (
    <section id="dores" className="bg-muted/30 py-14 sm:py-20 lg:py-24">
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

        <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:mt-12 sm:gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
            <h3 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {c.pain_title}
            </h3>
            <ul className="mt-4 space-y-3">
              {c.pains.map((p) => (
                <li key={p} className="flex gap-2.5 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/70" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
            <h3 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              {c.gain_title}
            </h3>
            <ul className="mt-4 space-y-3">
              {c.gains.map((g) => (
                <li key={g} className="flex gap-2.5 text-sm text-foreground/80">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
