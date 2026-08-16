import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLandingSection } from "@/hooks/useLandingContent";
import { CtaPrimary } from "./CtaPrimary";

export function SolutionsSection({ utm }: { utm: string }) {
  const c = useLandingSection("solutions");
  const tabs = c.tabs ?? [];
  const [active, setActive] = useState(tabs[0]?.key ?? "financeiro");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  if (!current) return null;

  return (
    <section id="solucoes" className="py-14 sm:py-20 lg:py-24">
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

        <div className="mx-auto mt-8 flex max-w-md gap-1 rounded-full border border-border bg-muted/40 p-1">
          {tabs.map((t) => (
            <Button
              key={t.key}
              type="button"
              variant={t.key === active ? "default" : "ghost"}
              className="h-10 flex-1 rounded-full text-xs sm:text-sm"
              onClick={() => setActive(t.key)}
            >
              {t.tab_label}
            </Button>
          ))}
        </div>

        <div className="mx-auto mt-8 max-w-4xl rounded-2xl border border-border/60 bg-card p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-bold tracking-tight sm:text-2xl">{current.title}</h3>
            {current.badge ? <Badge>{current.badge}</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">{current.subtitle}</p>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {current.bullets.map((b) => (
              <li key={b} className="flex gap-2.5 text-sm text-foreground/85">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <CtaPrimary
              utm={utm}
              source={`solutions_${current.key}`}
              label={current.cta_label}
              className="w-full sm:w-auto"
              extra={{ solucao: current.key }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
