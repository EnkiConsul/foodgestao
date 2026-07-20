import { Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLandingSection } from "@/hooks/useLandingContent";
import { CtaPrimary } from "./CtaPrimary";

export function ComparisonSection({ utm }: { utm: string }) {
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
